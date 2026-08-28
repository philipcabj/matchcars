// portal/src/app/api/agency/costos/route.ts
// GET -> TODAS las ventas cerradas de la agencia (a diferencia de
// commissions/route.ts, sin filtro de mes), con costo/comisión/margen neto
// de cada una. Alimenta las pestañas "Ventas cerradas" y "Resumen" del
// módulo de Costos y Rentabilidad (dashboard/costos) — "Resumen" agrupa por
// mes y calcula mejor/peor auto en el cliente a partir de este mismo
// payload, no hace falta un segundo endpoint.
//
// "reserved" cuenta como venta cerrada acá igual que en
// mycars.tsx/profile.tsx/SaleJourney.tsx (venta ya cerrada, pendiente de
// que el comprador confirme la recepción) — el auto ya salió del stock
// activo y su costo ya es un resultado, no una proyección.
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
  if (!hasSection(membership, "costos")) {
    return Response.json({ error: "No tenés acceso a esta sección." }, { status: 403 });
  }
  const ownerSnap = await adminDb.doc(`users/${agencyId}`).get();
  if (!canManageCommissions(ownerSnap.data()?.plan || "free")) {
    return Response.json({ error: "Costos y Rentabilidad está disponible en los planes pagos." }, { status: 403 });
  }

  const snap = await adminDb.collection("sales").where("sellerId", "==", agencyId).get();

  // Igual criterio que commissions/route.ts: costo congelado en
  // sale.commission.margin cuando hubo comisión; si no, se recalcula desde
  // el costo actual del auto (sin asumir costo 0 si nunca se cargó).
  const missingMargin = snap.docs.filter((d) => !d.data().commission && d.data().vehicleId);
  const costByVehicleId = new Map<string, { purchasePrice: number | null; expensesTotal: number }>();
  if (missingMargin.length > 0) {
    const vehicleDocs = await adminDb.getAll(...missingMargin.map((d) => adminDb.doc(`vehicles/${d.data().vehicleId}`)));
    vehicleDocs.forEach((v, i) => {
      const data = v.data();
      const purchasePrice = typeof data?.purchasePrice === "number" ? data.purchasePrice : null;
      costByVehicleId.set(missingMargin[i].data().vehicleId, { purchasePrice, expensesTotal: data?.expensesTotal || 0 });
    });
  }

  const entries = snap.docs
    .map((d) => {
      const data = d.data();
      const dealPrice = data.finalPrice ?? 0;
      const commissionAmount = data.commission?.amount ?? 0;
      // commission.margin es el margen BRUTO (precio - costo) que ya quedó
      // congelado al cerrar la venta, previo a restar la comisión — de ahí
      // se deriva el costo. Si no hubo comisión (agencia de una sola
      // persona, o sin vendedor asignado), se recalcula desde el costo
      // actual del auto, mismo criterio que commissions/route.ts.
      let cost: number | null = null;
      let grossMargin: number | null = null;
      const frozenMargin: number | null = typeof data.commission?.margin === "number" ? data.commission.margin : null;
      if (frozenMargin !== null) {
        grossMargin = frozenMargin;
        cost = dealPrice - frozenMargin;
      } else {
        const c = costByVehicleId.get(data.vehicleId);
        cost = c?.purchasePrice != null ? c.purchasePrice + c.expensesTotal : null;
        grossMargin = cost != null ? dealPrice - cost : null;
      }
      const margin = grossMargin != null ? grossMargin - commissionAmount : null;
      return {
        saleId: d.id,
        vehicleId: data.vehicleId ?? null,
        vehicleSnapshot: data.vehicleSnapshot ?? null,
        buyerName: data.buyerName ?? null,
        dealPrice,
        dealCurrency: data.currency ?? "ARS",
        cost,
        commissionAmount,
        margin, // neto: precio - costo - comisión
        soldAt: toIso(data.soldAt),
      };
    })
    .filter((e) => e.soldAt)
    .sort((a, b) => (b.soldAt ?? "").localeCompare(a.soldAt ?? ""));

  return Response.json({ entries });
});
