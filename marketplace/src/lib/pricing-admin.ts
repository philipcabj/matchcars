// marketplace/src/lib/pricing-admin.ts
// Puerto Admin SDK de lib/pricing.ts (raíz) — mismo cálculo que ya usa el
// tasador de la app (app/(screens)/tasador.tsx) y el portal
// (portal/src/lib/pricing.ts, versión cliente). Acá server-side porque el
// marketplace no tiene SDK de cliente de Firebase — todo pasa por rutas de
// servidor con Admin SDK, solo lectura.
import "server-only";

import { adminDb } from "@/lib/firebase-admin";
import { FieldPath } from "firebase-admin/firestore";

export interface MarketAnalysis {
  min: number;
  max: number;
  avg: number;
  count: number;
  source?: "listings" | "reference";
  exchangeRate?: number;
  exchangeRateSource?: string;
}

async function getConfigUsdToArsRate(): Promise<number> {
  try {
    const snap = await adminDb.doc("config/pricing").get();
    if (snap.exists) {
      const data = snap.data()!;
      let raw: unknown = data.usdToArsRate;
      if (typeof raw === "string") raw = Number(raw.replace(",", "."));
      let value = Number(raw);
      if (!Number.isNaN(value)) {
        if (value > 0 && value < 10) value = value * 1000;
        if (value > 100) return value;
      }
    }
  } catch (e) {
    console.error("Error reading usdToArsRate config", e);
  }
  return 1200;
}

export async function getUsdToArsRate(): Promise<{ rate: number; source: string }> {
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/blue");
    if (res.ok) {
      const data = await res.json();
      const rate = Number(data?.venta);
      if (!Number.isNaN(rate) && rate > 100) return { rate, source: "Dólar Blue (dolarapi.com)" };
    }
  } catch (e) {
    console.error("Error fetching public USD/ARS rate", e);
  }
  const fallbackRate = await getConfigUsdToArsRate();
  return { rate: fallbackRate, source: "Referencia interna de MatchCars" };
}

function normalizePrice(val: unknown): number {
  let v = Number(val);
  if (isNaN(v) && typeof val === "string") {
    v = Number(val.replace(",", ".").replace(/\s/g, ""));
  }
  if (isNaN(v) || v <= 0) return 0;
  if (v < 100 || (v < 1000 && !Number.isInteger(v))) return v * 1000;
  return v;
}

export async function analyzeMarketPrice(brand: string, model: string, year: number, currency: "ARS" | "USD"): Promise<MarketAnalysis> {
  try {
    if (!brand || !model || !year || !currency) return { min: 0, max: 0, avg: 0, count: 0 };

    const normalizedBrand = brand.trim();
    const normalizedModel = model.trim();
    const yearNumber = Number(year);
    if (!normalizedBrand || !normalizedModel || !yearNumber) return { min: 0, max: 0, avg: 0, count: 0 };

    const targetCurrency = currency === "ARS" ? "USD" : currency;
    const brandCandidates = Array.from(new Set([normalizedBrand, normalizedBrand.toUpperCase(), normalizedBrand.toLowerCase()]));
    const targetModel = normalizedModel.toLowerCase();

    try {
      const listingsSnap = await adminDb
        .collection("vehicles")
        .where("brand", "in", brandCandidates)
        .where("year", "==", yearNumber)
        .where("currency", "==", currency)
        .get();
      const prices: number[] = [];
      listingsSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.status === "deleted") return;
        if (String(data.model || "").toLowerCase() !== targetModel) return;
        if (data.price && !isNaN(data.price)) prices.push(Number(data.price));
      });
      if (prices.length > 0) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        return { min, max, avg, count: prices.length, source: "listings" };
      }
    } catch (e) {
      console.error("Error reading internal listings for price analysis", e);
    }

    try {
      const refKey = `${normalizedBrand}_${normalizedModel}_${yearNumber}_${targetCurrency}`;
      const refDoc = await adminDb.doc(`price_reference/${refKey}`).get();
      if (refDoc.exists) {
        const data = refDoc.data()!;
        let min = normalizePrice(data.min);
        let max = normalizePrice(data.max);
        let avg = normalizePrice(data.avg);
        const count = Number(data.count) || 0;
        if (avg > 0 && count > 0) {
          if (currency === "ARS" && targetCurrency === "USD") {
            const { rate, source: rateSource } = await getUsdToArsRate();
            min *= rate;
            max *= rate;
            avg *= rate;
            return { min, max, avg, count, source: "reference", exchangeRate: rate, exchangeRateSource: rateSource };
          }
          return { min, max, avg, count, source: "reference" };
        }
      }

      const refSnap = await adminDb
        .collection("price_reference")
        .where("brand", "in", brandCandidates)
        .where("year", "==", yearNumber)
        .where("currency", "==", targetCurrency)
        .get();
      const refPrices: number[] = [];
      refSnap.forEach((d) => {
        const data = d.data();
        const modelStr = String(data.model || "").toLowerCase();
        if (!targetModel || modelStr.includes(targetModel)) {
          const v = normalizePrice(data.avg || data.price);
          if (v > 0) refPrices.push(v);
        }
      });
      if (refPrices.length > 0) {
        let min = Math.min(...refPrices);
        let max = Math.max(...refPrices);
        let avg = refPrices.reduce((a, b) => a + b, 0) / refPrices.length;
        const count = refPrices.length;
        if (currency === "ARS" && targetCurrency === "USD") {
          const { rate, source: rateSource } = await getUsdToArsRate();
          min *= rate;
          max *= rate;
          avg *= rate;
          return { min, max, avg, count, source: "reference", exchangeRate: rate, exchangeRateSource: rateSource };
        }
        return { min, max, avg, count, source: "reference" };
      }
    } catch (e) {
      console.error("Error reading price_reference", e);
    }
  } catch (e) {
    console.error("Error analyzing market price", e);
  }
  return { min: 0, max: 0, avg: 0, count: 0 };
}

export async function getAvailableYears(brand: string, model: string): Promise<number[]> {
  const normalizedBrand = brand.trim();
  const normalizedModel = model.trim();
  if (!normalizedBrand || !normalizedModel) return [];

  const years = new Set<number>();
  const brandCandidates = Array.from(new Set([normalizedBrand, normalizedBrand.toUpperCase(), normalizedBrand.toLowerCase()]));
  const targetModel = normalizedModel.toLowerCase();

  try {
    const listingsSnap = await adminDb.collection("vehicles").where("brand", "in", brandCandidates).get();
    listingsSnap.forEach((d) => {
      const data = d.data();
      if (data.status === "deleted") return;
      if (String(data.model || "").toLowerCase() !== targetModel) return;
      const y = Number(data.year);
      if (!isNaN(y) && y > 1900) years.add(y);
    });
  } catch (e) {
    console.error("Error fetching internal years for model", e);
  }

  try {
    const prefix = `${normalizedBrand.toUpperCase()}_${normalizedModel.toUpperCase()}`;
    const refSnap = await adminDb
      .collection("price_reference")
      .where(FieldPath.documentId(), ">=", prefix)
      .where(FieldPath.documentId(), "<", `${prefix}~`)
      .get();
    refSnap.forEach((d) => {
      const parts = d.id.split("_");
      const y = Number(parts[parts.length - 2]);
      if (!isNaN(y) && y > 1900) years.add(y);
    });
  } catch (e) {
    console.error("Error fetching reference years for model", e);
  }

  return Array.from(years).sort((a, b) => b - a);
}
