// portal/src/app/api/agency/notifications/route.ts
// GET -> "cosas que necesitan tu atención ahora", calculado en vivo a partir
// de leads/sales existentes — no es un log de eventos persistido (eso
// requeriría escribir desde las Cloud Functions que ya mandan mail/push, un
// cambio de infra aparte). Se recalcula en cada request; el cliente hace
// polling liviano. Tres categorías: leads nuevos sin atender, ofertas
// esperando respuesta de la agencia, y ventas esperando confirmación del
// comprador.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { NotificationItem } from "@/lib/notifications";
import { AGENCY_ROLE_PERMISSIONS, isDealerPlan } from "@/lib/plans";

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

function buyerLabel(snapshot: { firstName?: string; lastName?: string } | undefined, manual: { name?: string } | undefined) {
  return manual?.name || [snapshot?.firstName, snapshot?.lastName].filter(Boolean).join(" ") || "Comprador";
}

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageLeads) {
    return Response.json({ items: [] });
  }
  // Silencioso a propósito (a diferencia de requireDealerPlan, que tira
  // error): esto es un poll de fondo para la campanita, no una página — un
  // plan sin CRM simplemente no tiene nada de leads/ofertas que mostrar acá.
  const ownerSnap = await adminDb.doc(`users/${agencyId}`).get();
  if (!isDealerPlan(ownerSnap.data()?.plan || "free")) {
    return Response.json({ items: [] });
  }

  const [newLeadsSnap, pendingOfferSnap, pendingSalesSnap] = await Promise.all([
    adminDb.collection("leads").where("sellerId", "==", agencyId).where("status", "==", "new").get(),
    adminDb.collection("leads").where("sellerId", "==", agencyId).where("offer.status", "==", "pending").get(),
    adminDb.collection("sales").where("sellerId", "==", agencyId).where("confirmedByBuyer", "==", null).get(),
  ]);

  const items: NotificationItem[] = [];

  for (const d of newLeadsSnap.docs) {
    const data = d.data();
    const veh = data.vehicleSnapshot;
    const carLabel = veh?.brand || veh?.model ? `${veh?.brand ?? ""} ${veh?.model ?? ""}`.trim() : "una publicación";
    items.push({
      id: `new_lead_${d.id}`,
      type: "new_lead",
      title: `Nuevo lead: ${buyerLabel(data.buyerSnapshot, data.manualContact)}`,
      subtitle: `Consultó por ${carLabel}`,
      href: `/dashboard/leads/${d.id}`,
      at: toIso(data.createdAt),
    });
  }

  for (const d of pendingOfferSnap.docs) {
    const data = d.data();
    const veh = data.vehicleSnapshot;
    const carLabel = veh?.brand || veh?.model ? `${veh?.brand ?? ""} ${veh?.model ?? ""}`.trim() : "un auto";
    items.push({
      id: `pending_offer_${d.id}`,
      type: "pending_offer",
      title: `Oferta por ${carLabel}`,
      subtitle: `${data.offer?.currency ?? ""} ${Number(data.offer?.amount ?? 0).toLocaleString("es-AR")} — esperando tu respuesta`,
      href: `/dashboard/leads/${d.id}`,
      at: toIso(data.offer?.createdAt) ?? toIso(data.lastMessageAt),
    });
  }

  for (const d of pendingSalesSnap.docs) {
    const data = d.data();
    const veh = data.vehicleSnapshot;
    const carLabel = veh?.brand || veh?.model ? `${veh?.brand ?? ""} ${veh?.model ?? ""}`.trim() : "un auto";
    items.push({
      id: `pending_sale_${d.id}`,
      type: "pending_sale_confirmation",
      title: `Esperando confirmación de ${carLabel}`,
      subtitle: "El comprador todavía no confirmó que lo recibió.",
      href: `/dashboard/stock/${data.vehicleId}`,
      at: toIso(data.soldAt),
    });
  }

  items.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  return Response.json({ items: items.slice(0, 15) });
});
