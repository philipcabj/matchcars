// portal/src/lib/exchange-rate.ts
// Versión server-side de getUsdToArsRate (lib/pricing.ts, que es client-only
// — usa firebase-client). Mismo criterio: dólar blue en vivo, con la
// cotización cargada por el admin (config/pricing.usdToArsRate) como
// respaldo si la API pública falla. Se usa para poder cargar el costo de
// compra de un auto en una moneda distinta a la de venta (ver
// purchase-price/route.ts) sin mezclar ARS y USD en el margen.
import { adminDb } from "@/lib/firebase-admin";

async function getConfigUsdToArsRate(): Promise<number> {
  try {
    const snap = await adminDb.doc("config/pricing").get();
    if (snap.exists) {
      const data = snap.data();
      let raw: unknown = data?.usdToArsRate;
      if (typeof raw === "string") raw = Number(raw.replace(",", "."));
      let value = Number(raw);
      if (!Number.isNaN(value)) {
        if (value > 0 && value < 10) value = value * 1000;
        if (value > 100) return value;
      }
    }
  } catch {
    // cae al fallback de abajo
  }
  return 1200;
}

export async function getUsdToArsRateServer(): Promise<{ rate: number; source: string }> {
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/blue");
    if (res.ok) {
      const data = await res.json();
      const rate = Number(data?.venta);
      if (!Number.isNaN(rate) && rate > 100) return { rate, source: "Dólar Blue (dolarapi.com)" };
    }
  } catch {
    // cae al fallback de abajo
  }
  const fallbackRate = await getConfigUsdToArsRate();
  return { rate: fallbackRate, source: "Referencia interna de MatchCars" };
}
