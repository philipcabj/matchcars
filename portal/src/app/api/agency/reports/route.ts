// portal/src/app/api/agency/reports/route.ts
// GET -> métricas de stock de la agencia: totales, desglose por estado,
// ranking de autos más vistos. Dos secciones de plan pago:
// - needsAttention ("necesitan atención"): cruce vehicles x leads por
//   vehicleId — Dealer+ (hasAdvancedReports). No hay series de tiempo
//   guardadas en ningún lado, así que no se puede armar un gráfico de
//   tendencia real de vistas/likes sin inventar datos; por eso no hay uno
//   acá, pero sí se puede señalar qué autos activos nunca generaron un lead.
// - peerComparison: tu agencia vs. el promedio de otras agencias en planes
//   Dealer — exclusivo Dealer Pro Plus (hasPeerComparison). Requiere un
//   mínimo de agencias en el promedio (MIN_PEERS_FOR_COMPARISON) para no
//   terminar mostrando, en la práctica, el número exacto de una sola agencia
//   competidora bajo la forma de "promedio".
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AttentionItem, PeerComparison } from "@/lib/reports";
import { AGENCY_ROLE_PERMISSIONS, hasAdvancedReports, hasPeerComparison } from "@/lib/plans";
import { STATUS_LABELS } from "@/lib/vehicle";

const EXCLUDED_STATUSES = ["deleted", "rejected", "rejected_limit", "blocked", "sold", "a_preparar"];
const HIGH_VIEWS_THRESHOLD = 15;
const STALE_DAYS_THRESHOLD = 30;
const MAX_ATTENTION_ITEMS = 6;
const MIN_PEERS_FOR_COMPARISON = 3;
const DEALER_PLAN_VALUES = ["pro_dealer", "pro_dealer_monthly", "pro_dealer_annual", "dealer_pro_plus_monthly", "dealer_pro_plus_annual"];

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].viewStats) {
    return Response.json({ error: "Tu rol no tiene permiso para ver reportes." }, { status: 403 });
  }

  const ownerSnap = await adminDb.doc(`users/${agencyId}`).get();
  const plan: string = ownerSnap.data()?.plan || "free";

  const [snap, leadsSnap] = await Promise.all([
    adminDb.collection("vehicles").where("userId", "==", agencyId).get(),
    hasAdvancedReports(plan) ? adminDb.collection("leads").where("sellerId", "==", agencyId).get() : Promise.resolve(null),
  ]);
  const vehicles: (FirebaseFirestore.DocumentData & { id: string })[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const vehicleIdsWithLeads = new Set((leadsSnap?.docs ?? []).map((d) => d.data().vehicleId).filter(Boolean));

  const statusCounts = new Map<string, number>();
  let totalViews = 0;
  let totalLikes = 0;
  let activeCount = 0;
  let activeViewsSum = 0;
  let daysSum = 0;
  let daysCount = 0;
  const now = Date.now();
  const attentionCandidates: AttentionItem[] = [];

  for (const v of vehicles) {
    const status = v.status || "available";
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    totalViews += v.views || 0;
    totalLikes += v.likesCount || 0;
    if (!EXCLUDED_STATUSES.includes(status)) {
      activeCount++;
      activeViewsSum += v.views || 0;
      const daysInStock = v.createdAt?.toDate ? (now - v.createdAt.toDate().getTime()) / (1000 * 60 * 60 * 24) : 0;
      if (v.createdAt?.toDate) {
        daysSum += daysInStock;
        daysCount++;
      }
      if (hasAdvancedReports(plan) && !vehicleIdsWithLeads.has(v.id)) {
        const views = v.views || 0;
        let reason: AttentionItem["reason"] | null = null;
        if (views >= HIGH_VIEWS_THRESHOLD) reason = "no_leads_high_views";
        else if (daysInStock >= STALE_DAYS_THRESHOLD) reason = "stale_no_leads";
        if (reason) {
          attentionCandidates.push({
            id: v.id,
            brand: v.brand ?? null,
            model: v.model ?? null,
            year: v.year ?? null,
            price: v.price ?? null,
            currency: v.currency ?? null,
            coverImage: v.images?.cover ?? null,
            reason,
            views,
            daysInStock: Math.round(daysInStock),
          });
        }
      }
    }
  }

  let needsAttention: AttentionItem[] | null = null;
  if (hasAdvancedReports(plan)) {
    const highViewsFirst = attentionCandidates
      .filter((a) => a.reason === "no_leads_high_views")
      .sort((a, b) => b.views - a.views);
    const staleAfter = attentionCandidates
      .filter((a) => a.reason === "stale_no_leads")
      .sort((a, b) => b.daysInStock - a.daysInStock);
    needsAttention = [...highViewsFirst, ...staleAfter].slice(0, MAX_ATTENTION_ITEMS);
  }

  let peerComparison: PeerComparison | null = null;
  if (hasPeerComparison(plan)) {
    const peerSnap = await adminDb.collection("vehicles").where("userPlan", "in", DEALER_PLAN_VALUES).get();
    const byAgency = new Map<string, { activeCount: number; totalViews: number; daysSum: number; daysCount: number }>();
    for (const d of peerSnap.docs) {
      const v = d.data();
      const peerUid: string | undefined = v.userId;
      if (!peerUid) continue;
      const status = v.status || "available";
      if (EXCLUDED_STATUSES.includes(status)) continue;
      const entry = byAgency.get(peerUid) ?? { activeCount: 0, totalViews: 0, daysSum: 0, daysCount: 0 };
      entry.activeCount++;
      entry.totalViews += v.views || 0;
      if (v.createdAt?.toDate) {
        entry.daysSum += (now - v.createdAt.toDate().getTime()) / (1000 * 60 * 60 * 24);
        entry.daysCount++;
      }
      byAgency.set(peerUid, entry);
    }
    byAgency.delete(agencyId); // el promedio es de OTRAS agencias, no incluye la propia
    const peers = Array.from(byAgency.values()).filter((p) => p.activeCount > 0);

    if (peers.length >= MIN_PEERS_FOR_COMPARISON) {
      const avgActiveCars = peers.reduce((s, p) => s + p.activeCount, 0) / peers.length;
      const avgViewsPerCar = peers.reduce((s, p) => s + p.totalViews / p.activeCount, 0) / peers.length;
      const daysPeers = peers.filter((p) => p.daysCount > 0);
      const avgDaysInStockPeers =
        daysPeers.length > 0 ? daysPeers.reduce((s, p) => s + p.daysSum / p.daysCount, 0) / daysPeers.length : null;

      peerComparison = {
        peerCount: peers.length,
        yourActiveCars: activeCount,
        avgActiveCars: Math.round(avgActiveCars * 10) / 10,
        yourAvgViewsPerCar: activeCount > 0 ? Math.round(activeViewsSum / activeCount) : 0,
        avgAvgViewsPerCar: Math.round(avgViewsPerCar),
        yourAvgDaysInStock: daysCount > 0 ? Math.round(daysSum / daysCount) : null,
        avgAvgDaysInStock: avgDaysInStockPeers !== null ? Math.round(avgDaysInStockPeers) : null,
      };
    }
  }

  const statusBreakdown = Array.from(statusCounts.entries())
    .map(([status, count]) => ({ status, label: STATUS_LABELS[status]?.label || status, count }))
    .sort((a, b) => b.count - a.count);

  const topVehicles = vehicles
    .map((v) => ({
      id: v.id,
      brand: v.brand ?? null,
      model: v.model ?? null,
      year: v.year ?? null,
      price: v.price ?? null,
      currency: v.currency ?? null,
      coverImage: v.images?.cover ?? null,
      views: v.views || 0,
      likesCount: v.likesCount || 0,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 8);

  return Response.json({
    activeCount,
    totalViews,
    totalLikes,
    avgDaysInStock: daysCount > 0 ? Math.round(daysSum / daysCount) : null,
    statusBreakdown,
    topVehicles,
    needsAttention,
    peerComparison,
  });
});
