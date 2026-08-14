// portal/src/app/api/agency/reports/route.ts
// GET -> métricas de stock de la agencia: totales, desglose por estado,
// ranking de autos más vistos, y una lista de "necesitan atención" (cruce
// vehicles x leads por vehicleId — no hay series de tiempo guardadas en
// ningún lado, así que no se puede armar un gráfico de tendencia real de
// vistas/likes sin inventar datos; por eso no hay uno acá, pero sí se puede
// señalar qué autos activos nunca generaron un lead).
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AttentionItem } from "@/lib/reports";
import { AGENCY_ROLE_PERMISSIONS } from "@/lib/plans";
import { STATUS_LABELS } from "@/lib/vehicle";

const EXCLUDED_STATUSES = ["deleted", "rejected", "rejected_limit", "blocked", "sold"];
const HIGH_VIEWS_THRESHOLD = 15;
const STALE_DAYS_THRESHOLD = 30;
const MAX_ATTENTION_ITEMS = 6;

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].viewStats) {
    return Response.json({ error: "Tu rol no tiene permiso para ver reportes." }, { status: 403 });
  }

  const [snap, leadsSnap] = await Promise.all([
    adminDb.collection("vehicles").where("userId", "==", agencyId).get(),
    adminDb.collection("leads").where("sellerId", "==", agencyId).get(),
  ]);
  const vehicles: (FirebaseFirestore.DocumentData & { id: string })[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const vehicleIdsWithLeads = new Set(leadsSnap.docs.map((d) => d.data().vehicleId).filter(Boolean));

  const statusCounts = new Map<string, number>();
  let totalViews = 0;
  let totalLikes = 0;
  let activeCount = 0;
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
      const daysInStock = v.createdAt?.toDate ? (now - v.createdAt.toDate().getTime()) / (1000 * 60 * 60 * 24) : 0;
      if (v.createdAt?.toDate) {
        daysSum += daysInStock;
        daysCount++;
      }
      if (!vehicleIdsWithLeads.has(v.id)) {
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

  const highViewsFirst = attentionCandidates
    .filter((a) => a.reason === "no_leads_high_views")
    .sort((a, b) => b.views - a.views);
  const staleAfter = attentionCandidates
    .filter((a) => a.reason === "stale_no_leads")
    .sort((a, b) => b.daysInStock - a.daysInStock);
  const needsAttention = [...highViewsFirst, ...staleAfter].slice(0, MAX_ATTENTION_ITEMS);

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
  });
});
