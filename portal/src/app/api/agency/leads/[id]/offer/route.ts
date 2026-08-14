// portal/src/app/api/agency/leads/[id]/offer/route.ts
// POST -> acciones del vendedor sobre la oferta formal activa de un lead
// orgánico (lead.offer, con lead.offer.id -> offers/{id}). Espeja
// handleOfferAction en app/(screens)/chat/[uid].tsx. El portal solo actúa
// como vendedor (nunca comprador), así que a diferencia de la app no hace
// falta distinguir "quién" acepta: aceptar siempre es "offer_accepted" acá
// (la rama "counter_accepted" es para cuando el que acepta es el comprador).
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { requireDealerPlan, resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { sendNotificationEmail } from "@/lib/notify-mail";
import { sendPushNotification } from "@/lib/notify-push";
import { AGENCY_ROLE_PERMISSIONS } from "@/lib/plans";
import { FieldValue } from "firebase-admin/firestore";

type OfferAction = "accept" | "reject" | "counter" | "withdraw";

async function postMessage(conversationId: string, senderId: string, text: string) {
  const now = FieldValue.serverTimestamp();
  await adminDb.collection(`conversations/${conversationId}/messages`).add({ senderId, text, createdAt: now });
  await adminDb.doc(`conversations/${conversationId}`).set({ lastMessage: text, lastSenderId: senderId, updatedAt: now }, { merge: true });
}

export const POST = withApiErrors(async (request, ctx: RouteContext<"/api/agency/leads/[id]/offer">) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageLeads) {
    return Response.json({ error: "Tu rol no tiene permiso para gestionar leads." }, { status: 403 });
  }
  await requireDealerPlan(agencyId);

  const { id } = await ctx.params;
  const ref = adminDb.doc(`leads/${id}`);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "No encontrado" }, { status: 404 });
  const lead = snap.data()!;
  if (lead.sellerId !== agencyId) return Response.json({ error: "No autorizado" }, { status: 403 });
  if (!lead.offer?.id) return Response.json({ error: "Este lead no tiene una oferta activa." }, { status: 400 });
  if (!lead.conversationId) return Response.json({ error: "Este lead no tiene una conversación asociada." }, { status: 400 });

  const body = await request.json();
  const action = body.action as OfferAction;
  const offerRef = adminDb.doc(`offers/${lead.offer.id}`);
  const carModel = `${lead.vehicleSnapshot?.brand ?? ""} ${lead.vehicleSnapshot?.model ?? ""}`.trim();

  const notify = async (buyerId: string | undefined, type: "offer_accepted" | "counter_received" | "deal_canceled", amount?: string) => {
    if (!buyerId) return;
    sendNotificationEmail(type, { recipientUid: buyerId, senderName: "MatchCars", carModel, amount }).catch(() => {});
    const buyerSnap = await adminDb.doc(`users/${buyerId}`).get();
    const pushToken = buyerSnap.data()?.pushToken;
    if (!pushToken) return;
    const titles: Record<typeof type, string> = {
      offer_accepted: "¡Acuerdo cerrado!",
      counter_received: "Te hicieron una contraoferta",
      deal_canceled: "Acuerdo cancelado",
    };
    const bodies: Record<typeof type, string> = {
      offer_accepted: `Llegaron a un acuerdo${amount ? ` por ${amount}` : ""} · ${carModel}`,
      counter_received: `Te contraofertaron${amount ? ` ${amount}` : ""} por ${carModel}`,
      deal_canceled: `El acuerdo por ${carModel} fue cancelado`,
    };
    sendPushNotification(pushToken, titles[type], bodies[type], {}).catch(() => {});
  };

  if (action === "accept") {
    if (lead.offer.status !== "pending") {
      return Response.json({ error: "Esta oferta ya no está pendiente." }, { status: 400 });
    }
    const acceptedAmount = lead.offer.amount;
    const acceptedCurrency = lead.offer.currency;
    const now = FieldValue.serverTimestamp();
    await offerRef.update({ status: "accepted", resolvedAt: now, updatedAt: now });
    await ref.update({
      "offer.status": "accepted",
      status: "won",
      wonAt: now,
      dealPrice: acceptedAmount,
      dealCurrency: acceptedCurrency,
    });
    const amountText = `${acceptedCurrency} ${Number(acceptedAmount).toLocaleString("es-AR")}`;
    await postMessage(lead.conversationId, lead.sellerId, `Oferta aceptada: ${amountText}`);
    await notify(lead.buyerId, "offer_accepted", amountText);
    return Response.json({ ok: true });
  }

  if (action === "reject") {
    if (lead.offer.status !== "pending") {
      return Response.json({ error: "Esta oferta ya no está pendiente." }, { status: 400 });
    }
    const now = FieldValue.serverTimestamp();
    await offerRef.update({ status: "rejected", resolvedAt: now, updatedAt: now });
    await ref.update({ "offer.status": "rejected" });
    await postMessage(lead.conversationId, lead.sellerId, "Oferta rechazada");
    return Response.json({ ok: true });
  }

  if (action === "counter") {
    if (lead.offer.status !== "pending") {
      return Response.json({ error: "Esta oferta ya no está pendiente." }, { status: 400 });
    }
    const counterAmount = Number(body.counterAmount);
    const counterCurrency = body.counterCurrency === "USD" ? "USD" : "ARS";
    const counterNote = typeof body.counterNote === "string" ? body.counterNote.trim() : "";
    if (!counterAmount || counterAmount <= 0) {
      return Response.json({ error: "Ingresá un monto de contraoferta válido." }, { status: 400 });
    }
    const now = FieldValue.serverTimestamp();
    await offerRef.update({
      status: "countered",
      counterAmount,
      counterCurrency,
      ...(counterNote ? { counterNote } : {}),
      updatedAt: now,
    });
    await ref.update({
      "offer.status": "countered",
      "offer.counterAmount": counterAmount,
      "offer.counterCurrency": counterCurrency,
      ...(counterNote ? { "offer.counterNote": counterNote } : {}),
    });
    const amountText = `${counterCurrency} ${Number(counterAmount).toLocaleString("es-AR")}`;
    await postMessage(lead.conversationId, lead.sellerId, `Contraoferta: ${amountText}`);
    await notify(lead.buyerId, "counter_received", amountText);
    return Response.json({ ok: true });
  }

  if (action === "withdraw") {
    if (lead.offer.status !== "accepted") {
      return Response.json({ error: "Solo se puede retirar un acuerdo ya aceptado." }, { status: 400 });
    }
    const now = FieldValue.serverTimestamp();
    await offerRef.update({ status: "withdrawn", updatedAt: now });
    await ref.update({ "offer.status": "withdrawn", status: "contacted" });
    if (lead.vehicleId) {
      await adminDb.doc(`vehicles/${lead.vehicleId}`).update({ status: "available", published: true }).catch(() => {});
    }
    await notify(lead.buyerId, "deal_canceled");
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Acción inválida." }, { status: 400 });
});
