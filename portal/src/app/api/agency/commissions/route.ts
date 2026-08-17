// portal/src/app/api/agency/commissions/route.ts
// GET -> ventas con comisión calculada (sales/{vehicleId}.commission, ver
// mark_vehicle_sold en leads/[id]/route.ts) de un mes puntual, con el total
// por vendedor. ?month=YYYY-MM, default el mes actual.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_PERMISSIONS, canManageCommissions } from "@/lib/plans";

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].viewStats) {
    return Response.json({ error: "Tu rol no tiene permiso para ver comisiones." }, { status: 403 });
  }
  const ownerSnap = await adminDb.doc(`users/${agencyId}`).get();
  if (!canManageCommissions(ownerSnap.data()?.plan || "free")) {
    return Response.json({ error: "Las comisiones están disponibles en los planes Dealer." }, { status: 403 });
  }

  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month"); // "YYYY-MM"
  const now = new Date();
  const [y, m] = monthParam?.match(/^\d{4}-\d{2}$/) ? monthParam.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 1);

  const snap = await adminDb.collection("sales").where("sellerId", "==", agencyId).get();
  const entries = snap.docs
    .map((d) => {
      const data = d.data();
      const soldAt = data.soldAt?.toDate ? data.soldAt.toDate() : null;
      return { id: d.id, data, soldAt };
    })
    .filter((e) => e.data.commission && e.soldAt && e.soldAt >= monthStart && e.soldAt < monthEnd)
    .map((e) => ({
      saleId: e.id,
      vehicleId: e.data.vehicleId,
      sellerUid: e.data.commission.sellerUid,
      vehicleSnapshot: e.data.vehicleSnapshot ?? null,
      dealPrice: e.data.finalPrice ?? 0,
      dealCurrency: e.data.currency ?? "ARS",
      margin: e.data.commission.margin ?? null,
      amount: e.data.commission.amount ?? 0,
      soldAt: toIso(e.data.soldAt),
    }))
    .sort((a, b) => (b.soldAt ?? "").localeCompare(a.soldAt ?? ""));

  const bySeller = new Map<string, { arsTotal: number; usdTotal: number; count: number }>();
  for (const e of entries) {
    const acc = bySeller.get(e.sellerUid) ?? { arsTotal: 0, usdTotal: 0, count: 0 };
    if (e.dealCurrency === "USD") acc.usdTotal += e.amount;
    else acc.arsTotal += e.amount;
    acc.count += 1;
    bySeller.set(e.sellerUid, acc);
  }

  return Response.json({
    month: `${y}-${String(m).padStart(2, "0")}`,
    entries,
    bySeller: Array.from(bySeller.entries()).map(([sellerUid, totals]) => ({ sellerUid, ...totals })),
  });
});
