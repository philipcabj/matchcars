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
import { logActivity } from "@/lib/activity-log";
import { requireCRMAccess, resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { calculateCommission, CommissionRule, DEFAULT_COMMISSION_RULE } from "@/lib/commissions";
import { LEAD_STATUS_LABELS, LeadStatus } from "@/lib/leads";
import { markVehicleSold } from "@/lib/mark-vehicle-sold";
import { AGENCY_ROLE_PERMISSIONS, canManageCommissions } from "@/lib/plans";
import { FieldValue } from "firebase-admin/firestore";

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
  // Si ya se vendió pero la venta no tiene comisión calculada (típicamente
  // porque se reasignó el vendedor después de cerrar, antes de que
  // existiera el bloqueo de reasignar leads cerrados) — la ficha ofrece
  // recalcularla a mano con el vendedor actual, ver acción
  // "recalculate_commission" más abajo.
  let saleHasCommission: boolean | null = null;
  if (data.vehicleId && (vehicleStatus === "reserved" || vehicleStatus === "sold")) {
    const saleSnap = await adminDb.doc(`sales/${data.vehicleId}`).get();
    deliveryConfirmToken = saleSnap.exists ? saleSnap.data()?.deliveryConfirmToken ?? null : null;
    saleHasCommission = saleSnap.exists ? !!saleSnap.data()?.commission : null;
  }

  // Historial de este lead (avances, edición de contacto, cierre, etc.) —
  // mismo registro que agencies/{agencyId}/activity, filtrado a este lead en
  // vez de reusar GET /api/agency/activity (ese está gateado por el permiso
  // manageTeam, más restrictivo que manageLeads, y no filtra por entidad).
  const activitySnap = await adminDb
    .collection(`agencies/${agencyId}/activity`)
    .where("entityType", "==", "lead")
    .where("entityId", "==", id)
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();
  const activity = activitySnap.docs.map((d) => {
    const a = d.data();
    return { id: d.id, actorName: a.actorName as string, summary: a.summary as string, createdAt: toIso(a.createdAt) };
  });

  return Response.json({
    id: snap.id,
    status: data.status || "new",
    conversationId: data.conversationId || "",
    vehicleId: data.vehicleId || null,
    buyerId: data.buyerId || null,
    vehicleStatus,
    vehicleSnapshot,
    deliveryConfirmToken,
    saleHasCommission,
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
    deletedAt: toIso(data.deletedAt),
    deletedReason: data.deletedReason ?? null,
    activity,
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
  if (lead.deletedAt) return Response.json({ error: "Este lead fue eliminado." }, { status: 400 });

  const body = await request.json();
  const action = body.action as "advance" | "lost" | "mark_won" | "mark_vehicle_sold" | "assign";
  const current = lead.status || "new";

  const carLabel = () => `${lead.vehicleSnapshot?.brand ?? ""} ${lead.vehicleSnapshot?.model ?? ""}`.trim() || "un auto";

  if (action === "assign") {
    // Una vez cerrado (ganado o perdido) el vendedor asignado queda fijo —
    // cambiarlo después movería a quién se le atribuye la comisión y la
    // performance de ese cierre. Reasignar sigue permitido en cualquier
    // etapa previa; cada reasignación ya queda en el activity log.
    if (current === "won" || current === "lost") {
      return Response.json({ error: "Este lead ya está cerrado — no se puede reasignar." }, { status: 400 });
    }
    const assignedTo = typeof body.assignedTo === "string" && body.assignedTo ? body.assignedTo : null;
    let assignedName = "sin asignar";
    if (assignedTo) {
      // Solo se puede asignar a alguien que realmente sea miembro de la
      // agencia — evita asignar a un uid arbitrario mandado por el cliente.
      const memberSnap = await adminDb.doc(`agencies/${agencyId}/members/${assignedTo}`).get();
      const isOwner = assignedTo === agencyId;
      if (!isOwner && !memberSnap.exists) {
        return Response.json({ error: "Ese usuario no es parte de tu equipo." }, { status: 400 });
      }
      assignedName = isOwner ? "el dueño de la agencia" : memberSnap.data()?.name || memberSnap.data()?.email || assignedTo;
    }
    await ref.update({ assignedTo });
    await logActivity({
      agencyId,
      actorUid: uid,
      entityType: "lead",
      entityId: id,
      summary: assignedTo ? `Asignó el lead de ${carLabel()} a ${assignedName}` : `Quitó la asignación del lead de ${carLabel()}`,
    });
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
    await logActivity({
      agencyId,
      actorUid: uid,
      entityType: "lead",
      entityId: id,
      summary: `Marcó como perdido el lead de ${carLabel()}: ${reason}`,
    });
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

    await ref.update(updates);
    await logActivity({
      agencyId,
      actorUid: uid,
      entityType: "lead",
      entityId: id,
      summary: `Avanzó el lead de ${carLabel()} a "${LEAD_STATUS_LABELS[nextStatus]}"${note ? `: ${note}` : ""}`,
    });
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
    await logActivity({
      agencyId,
      actorUid: uid,
      entityType: "lead",
      entityId: id,
      summary: `Cerró el acuerdo de precio de ${carLabel()} en ${dealCurrency} ${dealPrice.toLocaleString("es-AR")}`,
    });
    return Response.json({ ok: true });
  }

  if (action === "mark_vehicle_sold") {
    if (current !== "won") {
      return Response.json({ error: "Este lead todavía no está marcado como vendido." }, { status: 400 });
    }
    // Extraído a lib/mark-vehicle-sold.ts para poder dispararse también
    // desde "Completar" en una saleOperation (Módulo A) sin duplicar la
    // transacción/comisión/notificación al comprador.
    const result = await markVehicleSold(agencyId, uid, id);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ ok: true, deliveryConfirmToken: result.deliveryConfirmToken });
  }

  // Recalcula la comisión de una venta ya cerrada usando el vendedor actual
  // — cubre el caso de un lead que se reasignó después de vendido (antes de
  // que existiera el bloqueo de reasignar leads cerrados, ver acción
  // "assign" más arriba) y se quedó con la comisión sin calcular. No
  // sobreescribe una comisión que ya existe — para eso hay que resolverlo a
  // mano, esto es solo para completar la que falta.
  if (action === "recalculate_commission") {
    if (current !== "won" || !lead.vehicleId) {
      return Response.json({ error: "Este lead no tiene una venta cerrada para recalcular." }, { status: 400 });
    }
    if (!lead.assignedTo || lead.assignedTo === agencyId) {
      return Response.json({ error: "Este lead no tiene un vendedor del equipo asignado." }, { status: 400 });
    }
    const ownerSnap = await adminDb.doc(`users/${agencyId}`).get();
    if (!canManageCommissions(ownerSnap.data()?.plan || "free")) {
      return Response.json({ error: "Las comisiones no están disponibles en tu plan." }, { status: 403 });
    }
    const saleRef = adminDb.doc(`sales/${lead.vehicleId}`);
    const saleSnap = await saleRef.get();
    if (!saleSnap.exists) {
      return Response.json({ error: "Este auto todavía no se marcó como vendido." }, { status: 400 });
    }
    if (saleSnap.data()?.commission) {
      return Response.json({ error: "Esta venta ya tiene una comisión calculada." }, { status: 400 });
    }

    const dealPrice = lead.dealPrice || saleSnap.data()?.finalPrice || 0;
    const dealCurrency = lead.dealCurrency || saleSnap.data()?.currency || "ARS";
    const ruleSnap = await adminDb.doc(`agencies/${agencyId}/settings/commissionRule`).get();
    const rule: CommissionRule = ruleSnap.exists ? (ruleSnap.data() as CommissionRule) : DEFAULT_COMMISSION_RULE;
    const vehicleSnap = await adminDb.doc(`vehicles/${lead.vehicleId}`).get();
    const purchasePrice = vehicleSnap.data()?.purchasePrice;
    const expensesTotal = vehicleSnap.data()?.expensesTotal || 0;
    const margin = typeof purchasePrice === "number" ? dealPrice - purchasePrice - expensesTotal : null;
    const commission = {
      sellerUid: lead.assignedTo,
      amount: calculateCommission(rule, dealPrice, margin),
      currency: dealCurrency,
      margin,
      rule,
    };
    await saleRef.set({ commission }, { merge: true });
    await logActivity({
      agencyId,
      actorUid: uid,
      entityType: "lead",
      entityId: id,
      summary: `Recalculó la comisión de ${carLabel()}`,
    });
    return Response.json({ ok: true });
  }

  if (action === "edit_contact") {
    if (!lead.manualContact) {
      return Response.json({ error: "Este lead no es manual." }, { status: 400 });
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return Response.json({ error: "Falta el nombre del contacto." }, { status: 400 });
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const instagramHandle = typeof body.instagramHandle === "string" ? body.instagramHandle.trim() : "";

    await ref.update({
      "manualContact.name": name,
      "manualContact.phone": phone || null,
      "manualContact.email": email || null,
      "manualContact.instagramHandle": instagramHandle || null,
    });
    await logActivity({
      agencyId,
      actorUid: uid,
      entityType: "lead",
      entityId: id,
      summary: `Editó el contacto de ${carLabel()}`,
    });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Acción inválida." }, { status: 400 });
});

// Baja de un lead manual mal cargado (duplicado, contacto equivocado, auto
// que no era, etc.). Mismo criterio que la baja de vehículos (vehicles/[id]/
// route.ts DELETE): soft-delete permanente vía deletedAt, sin deshacer — así
// el lead sale de /dashboard/leads y de las estadísticas pero el registro
// (y el motivo) quedan para auditoría. Solo para leads manuales: los
// orgánicos vienen de una conversación real de la app, ahí "Perdido" es lo
// que corresponde. No se puede borrar un lead que ya tiene una operación de
// venta asociada — hay que resolver esa operación primero.
export const DELETE = withApiErrors(async (request, ctx: RouteContext<"/api/agency/leads/[id]">) => {
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
  if (lead.deletedAt) return Response.json({ ok: true });

  if (!lead.manualContact) {
    return Response.json({ error: "Solo se pueden eliminar leads cargados a mano — un lead orgánico se marca como perdido." }, { status: 400 });
  }
  if (lead.saleOperationId) {
    return Response.json({ error: "Este lead tiene una operación de venta asociada — resolvela antes de eliminarlo." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return Response.json({ error: "Contame por qué eliminás este lead." }, { status: 400 });

  await ref.update({ deletedAt: FieldValue.serverTimestamp(), deletedReason: reason, deletedBy: uid });

  const carLabel = `${lead.vehicleSnapshot?.brand ?? ""} ${lead.vehicleSnapshot?.model ?? ""}`.trim() || "un auto";
  await logActivity({
    agencyId,
    actorUid: uid,
    entityType: "lead",
    entityId: id,
    summary: `Eliminó el lead manual de ${carLabel}: ${reason}`,
  });

  return Response.json({ ok: true });
});
