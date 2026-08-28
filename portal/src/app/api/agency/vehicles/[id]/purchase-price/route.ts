// portal/src/app/api/agency/vehicles/[id]/purchase-price/route.ts
// PATCH -> guarda el costo de adquisición del auto (Módulo C — margen real).
// Ruta chica aparte del PATCH grande de vehicles/[id] a propósito: la
// pestaña "Costos" del detalle de Stock no reenvía el formulario completo,
// solo este único campo.
//
// El costo se puede cargar en una moneda distinta a la del auto (compraste
// en USD, vendés en ARS, o al revés) — `purchasePrice` SIEMPRE queda
// normalizado a la moneda del auto (así todo el resto del código, margen
// en vehicles/route.ts, costos/route.ts, mark-vehicle-sold.ts, sigue
// leyéndolo sin cambios), y se guarda aparte el monto/moneda originales +
// la cotización usada, solo para mostrarle al usuario de dónde salió el
// número.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { getUsdToArsRateServer } from "@/lib/exchange-rate";
import { adminDb } from "@/lib/firebase-admin";
import { canTrackExpenses } from "@/lib/plans";
import { hasSection } from "@/lib/sections";

export const PATCH = withApiErrors(async (request, ctx: RouteContext<"/api/agency/vehicles/[id]/purchase-price">) => {
  const uid = await requireUid(request);
  const membership = await resolveMembership(uid);
  const { agencyId } = membership;
  if (!hasSection(membership, "costos")) {
    return Response.json({ error: "No tenés acceso a esta sección." }, { status: 403 });
  }

  const ownerSnap = await adminDb.doc(`users/${agencyId}`).get();
  if (!canTrackExpenses(ownerSnap.data()?.plan || "free")) {
    return Response.json({ error: "El control de gastos está disponible desde el plan Pro." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const ref = adminDb.doc(`vehicles/${id}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.userId !== agencyId) return Response.json({ error: "No encontrado" }, { status: 404 });

  const body = await request.json();
  const rawAmount = body.purchasePrice === null ? null : Number(body.purchasePrice);
  if (rawAmount !== null && (!Number.isFinite(rawAmount) || rawAmount < 0)) {
    return Response.json({ error: "Ingresá un costo válido." }, { status: 400 });
  }
  const inputCurrency = body.currency === "USD" ? "USD" : "ARS";

  if (rawAmount === null) {
    await ref.update({
      purchasePrice: null,
      purchasePriceOriginal: null,
      purchasePriceOriginalCurrency: null,
      purchasePriceExchangeRate: null,
    });
    return Response.json({ ok: true });
  }

  const vehicleCurrency = snap.data()?.currency === "USD" ? "USD" : "ARS";
  let purchasePrice = rawAmount;
  let exchangeRate: number | null = null;
  if (inputCurrency !== vehicleCurrency) {
    const { rate } = await getUsdToArsRateServer();
    exchangeRate = rate;
    purchasePrice = inputCurrency === "USD" ? rawAmount * rate : rawAmount / rate;
  }

  await ref.update({
    purchasePrice,
    purchasePriceOriginal: rawAmount,
    purchasePriceOriginalCurrency: inputCurrency,
    purchasePriceExchangeRate: exchangeRate,
  });
  return Response.json({ ok: true, purchasePrice, exchangeRate });
});
