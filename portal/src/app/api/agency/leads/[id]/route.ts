// portal/src/app/api/agency/leads/[id]/route.ts
// GET   -> detalle de un lead (para /dashboard/leads/[id]), incluye la oferta
//          activa embebida (lead.offer) y el estado actual del vehículo.
// PATCH -> acciones sobre el lead: "advance"/"lost" (avanza etapa o lo marca
// perdido, espeja handleCycleStatus/markLeadAsLost de app/(screens)/leads.tsx),
// "mark_won" (cierre manual sin oferta formal) y "mark_vehicle_sold" (espeja
// handleMarkAsSold de chat/[uid].tsx: marca el auto vendido + crea el registro
// en sales/). Las acciones sobre una oferta formal en curso (aceptar/rechazar/
// contraofertar/retirar) viven en la subruta offer/route.ts.
//
// "lost" siempre pide motivo (reasonLost, campo que ya existe en types/commerce.ts
// pero el portal no usaba). "advance" en un lead manual también pide nota
// obligatoria (se agrega como línea a manualContact.notes) — sin chat, esa nota
// es el único registro de qué pasó. En los orgánicos no se pide nada: la
// conversación real ya es el registro.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { requireCRMAccess, resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { calculateCommission, CommissionRule, DEFAULT_COMMISSION_RULE } from "@/lib/commissions";
import { LEAD_STATUS_LABELS, LeadStatus } from "@/lib/leads";
import { sendNotificationEmail } from "@/lib/notify-mail";
import { sendPushNotification } from "@/lib/notify-push";
import { AGENCY_ROLE_PERMISSIONS, canManageCommissions } from "@/lib/plans";
import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

const TERMINAL_OFFER_STATUSES = ["rejected", "withdrawn", "expired"];

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

export const GET = withApiErrors(async (request, ctx: RouteContext<"/api/agency/leads/[id]">) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageLeads) {
    return Response.json({ error: "Tu rol no tiene permiso para ver los leads." }, { status: 403 });
  }
  await requireCRMAccess(agencyId);

  const { id } = await ctx.params;
  const snap = await adminDb.doc(`leads/${id}`).get();
  if (!snap.exists) return Response.json({ error: "No encontrado" }, { status: 404 });
  const data = snap.data()!;
  if (data.sellerId !== agencyId) return Response.json({ error: "No autorizado" }, { status: 403 });

  // Abrir el detalle = leído — sin esto, el badge de "nuevo" en /dashboard/leads
  // y el contador de la campanita quedaban prendidos para siempre salvo que la
  // agencia además respondiera el mensaje (único lugar que hoy resetea unreadCount).
  if ((data.unreadCount ?? 0) > 0) {
    await snap.ref.update({ unreadCount: 0 });
  }

  let vehicleStatus: string | null = null;
  // Precio EN VIVO, no la foto vieja de vehicleSnapshot (tomada cuando se
  // creó el lead) — para que "Cerrar acuerdo de precio" pueda pre-cargar el
  // precio real de hoy en vez de arrancar en blanco y obligar a
  // retipearlo a mano.
  let liveVehicle: { price?: number; currency?: string } | null = null;
  if (data.vehicleId) {
    const vehicleSnap = await adminDb.doc(`vehicles/${data.vehicleId}`).get();
    vehicleStatus = vehicleSnap.exists ? vehicleSnap.data()?.status ?? "available" : null;
    if (vehicleSnap.exists) {
      liveVehicle = { price: vehicleSnap.data()?.price, currency: vehicleSnap.data()?.currency };
    }
  }
  const vehicleSnapshot = data.vehicleSnapshot
    ? { ...data.vehicleSnapshot, ...(liveVehicle ?? {}) }
    : liveVehicle;

  // Token del QR de confirmación de entrega — se guardó en sales/{vehicleId}
  // al marcar como entregado (ver mark_vehicle_sold acá abajo). Se expone
  // acá para poder re-mostrar el mismo QR si se recarga la página.
  let deliveryConfirmToken: string | null = null;
  if (vehicleStatus === "reserved" && data.vehicleId) {
    const saleSnap = await adminDb.doc(`sales/${data.vehicleId}`).get();
    deliveryConfirmToken = saleSnap.exists ? saleSnap.data()?.deliveryConfirmToken ?? null : null;
  }

  return Response.json({
    id: snap.id,
    status: data.status || "new",
    conversationId: data.conversationId || "",
    vehicleId: data.vehicleId || null,
    buyerId: data.buyerId || null,
    vehicleStatus,
    vehicleSnapshot,
    deliveryConfirmToken,
    buyerSnapshot: data.buyerSnapshot ?? null,
    manualContact: data.manualContact ?? null,
    lastMessage: data.lastMessage ?? null,
    lastMessageAt: toIso(data.lastMessageAt),
    dealPrice: data.dealPrice ?? null,
    dealCurrency: data.dealCurrency ?? null,
    reasonLost: data.reasonLost ?? null,
    offer: data.offer ?? null,
    createdAt: toIso(data.createdAt),
    assignedTo: data.assignedTo ?? null,
    saleOperationId: data.saleOperationId ?? null,
  });
});

export const PATCH = withApiErrors(async (request, ctx: RouteContext<"/api/agency/leads/[id]">) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageLeads) {
    return Response.json({ error: "Tu rol no tiene permiso para gestionar leads." }, { status: 403 });
  }
  await requireCRMAccess(agencyId);

  const { id } = await ctx.params;
  const ref = adminDb.doc(`leads/${id}`);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "No encontrado" }, { status: 404 });
  const lead = snap.data()!;
  if (lead.sellerId !== agencyId) return Response.json({ error: "No autorizado" }, { status: 403 });

  const body = await request.json();
  const action = body.action as "advance" | "lost" | "mark_won" | "mark_vehicle_sold" | "assign";
  const current = lead.status || "new";

  if (action === "assign") {
    const assignedTo = typeof body.assignedTo === "string" && body.assignedTo ? body.assignedTo : null;
    if (assignedTo) {
      // Solo se puede asignar a alguien que realmente sea miembro de la
      // agencia — evita asignar a un uid arbitrario mandado por el cliente.
      const memberSnap = await adminDb.doc(`agencies/${agencyId}/members/${assignedTo}`).get();
      const isOwner = assignedTo === agencyId;
      if (!isOwner && !memberSnap.exists) {
        return Response.json({ error: "Ese usuario no es parte de tu equipo." }, { status: 400 });
      }
    }
    await ref.update({ assignedTo });
    return Response.json({ ok: true });
  }

  if (action === "lost") {
    if (current === "won" || current === "lost") {
      return Response.json({ error: "Este lead ya está cerrado." }, { status: 400 });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) return Response.json({ error: "Contame el motivo de la pérdida." }, { status: 400 });
    const updates: Record<string, unknown> = { status: "lost", reasonLost: reason };
    if (!lead.lostAt) updates.lostAt = FieldValue.serverTimestamp();
    await ref.update(updates);
    return Response.json({ ok: true });
  }

  if (action === "advance") {
    if (current === "won" || current === "lost" || current === "negotiation") {
      return Response.json(
        { error: "Este lead ya está en negociación o cerrado — cerralo como vendido o perdido desde ahí." },
        { status: 400 }
      );
    }
    const nextStatus: LeadStatus = current === "new" ? "contacted" : "negotiation";
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (lead.manualContact && !note) {
      return Response.json({ error: "Contame qué pasó antes de avanzar este lead." }, { status: 400 });
    }

    const updates: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === "contacted" && !lead.contactedAt) updates.contactedAt = FieldValue.serverTimestamp();
    if (nextStatus === "negotiation" && !lead.negotiationAt) updates.negotiationAt = FieldValue.serverTimestamp();

    if (note && lead.manualContact) {
      const line = `[${new Date().toLocaleDateString("es-AR")}] → ${LEAD_STATUS_LABELS[nextStatus]}: ${note}`;
      updates["manualContact.notes"] = lead.manualContact.notes ? `${lead.manualContact.notes}\n${line}` : line;
    }

    await ref.update(updates);
    return Response.json({ ok: true });
  }

  if (action === "mark_won") {
    if (current !== "contacted" && current !== "negotiation") {
      return Response.json({ error: "Este lead no está en un estado que se pueda cerrar como vendido." }, { status: 400 });
    }
    if (lead.offer && !TERMINAL_OFFER_STATUSES.includes(lead.offer.status)) {
      return Response.json({ error: "Este lead tiene una oferta activa — resolvela desde ahí." }, { status: 400 });
    }
    const dealPrice = Number(body.dealPrice);
    const dealCurrency = body.dealCurrency === "USD" ? "USD" : "ARS";
    if (!dealPrice || dealPrice <= 0) {
      return Response.json({ error: "Ingresá un precio de cierre válido." }, { status: 400 });
    }
    await ref.update({ status: "won", wonAt: FieldValue.serverTimestamp(), dealPrice, dealCurrency });
    return Response.json({ ok: true });
  }

  if (action === "mark_vehicle_sold") {
    if (current !== "won") {
      return Response.json({ error: "Este lead todavía no está marcado como vendido." }, { status: 400 });
    }
    if (!lead.vehicleId) {
      return Response.json({ error: "Este lead no tiene un auto del stock asociado." }, { status: 400 });
    }
    const vehicleRef = adminDb.doc(`vehicles/${lead.vehicleId}`);
    const saleRef = adminDb.doc(`sales/${lead.vehicleId}`);
    const offerRef = lead.offer?.id ? adminDb.doc(`offers/${lead.offer.id}`) : null;
    // Con comprador real, el auto queda "reserved" (no "sold" todavía) hasta
    // que confirme la recepción desde el chat de la app — mismo criterio que
    // handleMarkAsSold en chat/[uid].tsx. Sin comprador (lead manual) no hay
    // quién confirme, así que se cierra directo como antes.
    const pendingConfirmation = !!lead.buyerId;
    const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    // Token para el QR de confirmación de entrega en persona — cualquiera
    // que tenga este link puede confirmar esta venta puntual, sin necesitar
    // sesión propia (el comprador puede no tener la app abierta/logueada en
    // el momento de la entrega). Alcanza con la posesión del QR, igual
    // criterio que un link de descarga con token de Storage.
    const deliveryConfirmToken = pendingConfirmation ? randomUUID() : null;

    // Comisión (Módulo C) — solo si hay un vendedor asignado distinto del
    // dueño (el dueño no se paga comisión a sí mismo) y el plan la incluye.
    // Se calcula acá, no después, para que quede una foto fija de la regla
    // vigente al momento del cierre — si la agencia cambia la regla más
    // adelante, no debería recalcular ventas ya cerradas.
    const dealPrice = lead.dealPrice || 0;
    const dealCurrency = lead.dealCurrency || "ARS";
    let commission: { sellerUid: string; amount: number; currency: string; margin: number | null; rule: CommissionRule } | null = null;
    if (lead.assignedTo && lead.assignedTo !== agencyId) {
      const ownerSnap = await adminDb.doc(`users/${agencyId}`).get();
      if (canManageCommissions(ownerSnap.data()?.plan || "free")) {
        const ruleSnap = await adminDb.doc(`agencies/${agencyId}/settings/commissionRule`).get();
        const rule: CommissionRule = ruleSnap.exists ? (ruleSnap.data() as CommissionRule) : DEFAULT_COMMISSION_RULE;
        // margin en null si no se cargó costo de compra — no se asume 0 de
        // costo (sobreestimaría el margen), simplemente esa regla no aplica.
        const vehicleForMargin = await vehicleRef.get();
        const purchasePrice = vehicleForMargin.data()?.purchasePrice;
        const expensesTotal = vehicleForMargin.data()?.expensesTotal || 0;
        const margin = typeof purchasePrice === "number" ? dealPrice - purchasePrice - expensesTotal : null;
        commission = {
          sellerUid: lead.assignedTo,
          amount: calculateCommission(rule, dealPrice, margin),
          currency: dealCurrency,
          margin,
          rule,
        };
      }
    }

    await adminDb.runTransaction(async (t) => {
      const vehicleSnap = await t.get(vehicleRef);
      if (!vehicleSnap.exists) throw new Error("El auto ya no existe.");
      if (vehicleSnap.data()?.status === "sold") throw new Error("Este auto ya está marcado como vendido.");
      t.update(vehicleRef, {
        status: pendingConfirmation ? "reserved" : "sold",
        published: false,
        soldAt: FieldValue.serverTimestamp(),
        ...(offerRef ? { soldViaOfferId: lead.offer.id } : {}),
      });
      if (offerRef) t.update(offerRef, { vehicleSold: true });
      t.set(
        saleRef,
        {
          vehicleId: lead.vehicleId,
          sellerId: agencyId,
          buyerId: lead.buyerId || "",
          finalPrice: dealPrice,
          currency: dealCurrency,
          soldAt: FieldValue.serverTimestamp(),
          source: "matchcars",
          vehicleSnapshot: lead.vehicleSnapshot ?? {},
          confirmedByBuyer: pendingConfirmation ? null : true,
          ...(pendingConfirmation ? { buyerConfirmDeadline: deadline, deliveryConfirmToken } : { confirmedAt: FieldValue.serverTimestamp() }),
          ...(commission ? { commission } : {}),
        },
        { merge: true }
      );
    });

    if (lead.buyerId) {
      const carModel = `${lead.vehicleSnapshot?.brand ?? ""} ${lead.vehicleSnapshot?.model ?? ""}`.trim();
      sendNotificationEmail("vehicle_sold", {
        recipientUid: lead.buyerId,
        senderName: "MatchCars",
        subject: `Confirmá la recepción de tu ${carModel}`,
        carModel,
      }).catch(() => {});
      const buyerSnap = await adminDb.doc(`users/${lead.buyerId}`).get();
      const pushToken = buyerSnap.data()?.pushToken;
      if (pushToken) {
        sendPushNotification(pushToken, "Confirmá tu compra", `El vendedor marcó ${carModel} como entregado — confirmá que lo recibiste.`, {}).catch(() => {});
      }
    }

    return Response.json({ ok: true, deliveryConfirmToken });
  }

  return Response.json({ error: "Acción inválida." }, { status: 400 });
});
