// portal/src/lib/mark-vehicle-sold.ts
// Extraído tal cual de la acción "mark_vehicle_sold" de
// leads/[id]/route.ts para poder dispararse también desde "Completar" en
// una saleOperation (Módulo A) sin duplicar la transacción/comisión/
// notificación al comprador. Antes, terminar el checklist de la operación
// NO marcaba el auto como vendido ni avisaba al comprador — eran dos
// acciones sin ninguna conexión entre sí, así que "Completar" dejaba el
// auto publicado y al comprador sin nada que confirmar/puntuar.
import "server-only";

import { logActivity } from "@/lib/activity-log";
import { adminDb } from "@/lib/firebase-admin";
import { calculateCommission, CommissionRule, DEFAULT_COMMISSION_RULE } from "@/lib/commissions";
import { sendNotificationEmail } from "@/lib/notify-mail";
import { sendPushNotification } from "@/lib/notify-push";
import { canManageCommissions } from "@/lib/plans";
import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

export type MarkVehicleSoldResult = { ok: true; deliveryConfirmToken: string | null } | { ok: false; error: string; status: number };

export async function markVehicleSold(agencyId: string, actorUid: string, leadId: string): Promise<MarkVehicleSoldResult> {
  const leadRef = adminDb.doc(`leads/${leadId}`);
  const leadSnap = await leadRef.get();
  if (!leadSnap.exists) return { ok: false, error: "Lead no encontrado.", status: 404 };
  const lead = leadSnap.data()!;
  if (lead.sellerId !== agencyId) return { ok: false, error: "No autorizado.", status: 403 };
  const carLabel = () => `${lead.vehicleSnapshot?.brand ?? ""} ${lead.vehicleSnapshot?.model ?? ""}`.trim() || "un auto";

  if (lead.status !== "won") {
    return { ok: false, error: "Este lead todavía no está marcado como vendido.", status: 400 };
  }
  if (!lead.vehicleId) {
    return { ok: false, error: "Este lead no tiene un auto del stock asociado.", status: 400 };
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

  try {
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
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido", status: 400 };
  }

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
      sendPushNotification(pushToken, "Confirmá tu compra", `El vendedor marcó ${carModel} como entregado — confirmá que lo recibiste.`, {
        url: `matchcars://chat/${agencyId}?vehicleId=${lead.vehicleId}`,
      }).catch(() => {});
    }
    // El email puede caer en spam y no siempre hay un chat previo con el
    // vendedor (leads del CRM cargados a mano no tienen conversación en la
    // app) — sin esto, "Confirmar recepción" quedaba sin ningún aviso
    // visible dentro de la app. Mismo mecanismo que ya usa mycars.tsx para
    // avisar "Calificá tu experiencia", leído por Notificaciones > Alertas
    // y por Perfil > Mis compras.
    adminDb
      .collection(`users/${lead.buyerId}/rating_notifications`)
      .add({
        type: "confirm_delivery",
        title: "Confirmá tu compra",
        message: `El vendedor marcó tu ${carModel} como entregado. Confirmá la recepción desde "Mis compras" en tu perfil.`,
        vehicleId: lead.vehicleId,
        sellerId: agencyId,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      })
      .catch(() => {});
  }

  await logActivity({
    agencyId,
    actorUid,
    entityType: "lead",
    entityId: leadId,
    summary: pendingConfirmation
      ? `Marcó ${carLabel()} como vendido — esperando confirmación del comprador`
      : `Marcó ${carLabel()} como vendido y entregado`,
  });

  return { ok: true, deliveryConfirmToken };
}
