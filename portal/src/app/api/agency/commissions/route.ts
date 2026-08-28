// portal/src/app/api/agency/commissions/route.ts
// GET -> TODAS las ventas de un mes puntual (no solo las que tienen un
// vendedor de equipo asignado — antes solo se veían esas, dejando afuera a
// cualquier agencia de una sola persona), con la comisión por vendedor
// cuando aplica y el margen (venta - costo - gastos) de cada una.
// ?month=YYYY-MM, default el mes actual.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { canManageCommissions } from "@/lib/plans";
import { hasSection } from "@/lib/sections";

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const membership = await resolveMembership(uid);
  const { agencyId } = membership;
  if (!hasSection(membership, "comisiones")) {
    return Response.json({ error: "No tenés acceso a esta sección." }, { status: 403 });
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
  const salesInMonth = snap.docs
    .map((d) => {
      const data = d.data();
      const soldAt = data.soldAt?.toDate ? data.soldAt.toDate() : null;
      return { id: d.id, data, soldAt };
    })
    .filter((e) => e.soldAt && e.soldAt >= monthStart && e.soldAt < monthEnd);

  // El margen queda "congelado" en sale.commission.margin solo cuando hubo
  // comisión (vendedor de equipo asignado + plan pago). Para el resto de las
  // ventas del mes (agencia de una sola persona, o sin vendedor asignado) no
  // hay ninguna foto guardada — se recalcula acá mismo desde el costo actual
  // del auto, con el mismo criterio de "sin costo cargado, sin margen" que
  // ya usa mark_vehicle_sold (no se asume costo 0, sobreestimaría el margen).
  const salesMissingMargin = salesInMonth.filter((e) => !e.data.commission && e.data.vehicleId);
  const vehicleCostByVehicleId = new Map<string, { purchasePrice: number | null; expensesTotal: number }>();
  if (salesMissingMargin.length > 0) {
    const vehicleDocs = await adminDb.getAll(...salesMissingMargin.map((e) => adminDb.doc(`vehicles/${e.data.vehicleId}`)));
    vehicleDocs.forEach((docSnap, i) => {
      const data = docSnap.data();
      const purchasePrice = typeof data?.purchasePrice === "number" ? data.purchasePrice : null;
      vehicleCostByVehicleId.set(salesMissingMargin[i].data.vehicleId, { purchasePrice, expensesTotal: data?.expensesTotal || 0 });
    });
  }

  const entries = salesInMonth
    .map((e) => {
      const dealPrice = e.data.finalPrice ?? 0;
      let margin: number | null = e.data.commission?.margin ?? null;
      if (!e.data.commission) {
        const cost = vehicleCostByVehicleId.get(e.data.vehicleId);
        margin = cost?.purchasePrice != null ? dealPrice - cost.purchasePrice - cost.expensesTotal : null;
      }
      return {
        saleId: e.id,
        vehicleId: e.data.vehicleId,
        sellerUid: e.data.commission?.sellerUid ?? null,
        vehicleSnapshot: e.data.vehicleSnapshot ?? null,
        dealPrice,
        dealCurrency: e.data.currency ?? "ARS",
        margin,
        amount: e.data.commission?.amount ?? 0,
        soldAt: toIso(e.data.soldAt),
      };
    })
    .sort((a, b) => (b.soldAt ?? "").localeCompare(a.soldAt ?? ""));

  const bySeller = new Map<string, { arsTotal: number; usdTotal: number; count: number }>();
  const marginByCurrency = new Map<string, number>();
  let missingCostCount = 0;
  for (const e of entries) {
    if (e.sellerUid) {
      const acc = bySeller.get(e.sellerUid) ?? { arsTotal: 0, usdTotal: 0, count: 0 };
      if (e.dealCurrency === "USD") acc.usdTotal += e.amount;
      else acc.arsTotal += e.amount;
      acc.count += 1;
      bySeller.set(e.sellerUid, acc);
    }
    if (e.margin !== null) marginByCurrency.set(e.dealCurrency, (marginByCurrency.get(e.dealCurrency) ?? 0) + e.margin);
    else missingCostCount++;
  }

  return Response.json({
    month: `${y}-${String(m).padStart(2, "0")}`,
    entries,
    bySeller: Array.from(bySeller.entries()).map(([sellerUid, totals]) => ({ sellerUid, ...totals })),
    marginByCurrency: Array.from(marginByCurrency.entries()).map(([currency, total]) => ({ currency, total })),
    missingCostCount,
  });
});
