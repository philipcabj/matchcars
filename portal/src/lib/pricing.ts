// portal/src/lib/pricing.ts
// Copia de lib/pricing.ts (raíz) para el formulario de Publicar auto del
// portal: mismo cálculo de "promedio de mercado" que ya usa la app (autos
// publicados en MatchCars primero, guía de precios de referencia si no hay
// datos propios suficientes). Client-side, mismos reads que hace la app.
import { db } from "@/lib/firebase-client";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

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
    const snap = await getDoc(doc(db, "config", "pricing"));
    if (snap.exists()) {
      const data = snap.data();
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

export async function analyzeMarketPrice(
  brand: string,
  model: string,
  year: number,
  currency: "ARS" | "USD",
  excludeId?: string
): Promise<MarketAnalysis> {
  try {
    if (!brand || !model || !year || !currency) return { min: 0, max: 0, avg: 0, count: 0 };

    const normalizedBrand = brand.trim();
    const normalizedModel = model.trim();
    const yearNumber = Number(year);
    if (!normalizedBrand || !normalizedModel || !yearNumber) return { min: 0, max: 0, avg: 0, count: 0 };

    const targetCurrency = currency === "ARS" ? "USD" : currency;
    const brandCandidates = Array.from(
      new Set([normalizedBrand, normalizedBrand.toUpperCase(), normalizedBrand.toLowerCase()])
    );
    const targetModel = normalizedModel.toLowerCase();

    try {
      const listingsSnap = await getDocs(
        query(
          collection(db, "vehicles"),
          where("brand", "in", brandCandidates),
          where("year", "==", yearNumber),
          where("currency", "==", currency)
        )
      );
      const prices: number[] = [];
      listingsSnap.forEach((docSnap) => {
        if (excludeId && docSnap.id === excludeId) return;
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
      const refDoc = await getDoc(doc(db, "price_reference", refKey));
      if (refDoc.exists()) {
        const data = refDoc.data();
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

      const refSnap = await getDocs(
        query(
          collection(db, "price_reference"),
          where("brand", "in", brandCandidates),
          where("year", "==", yearNumber),
          where("currency", "==", targetCurrency)
        )
      );
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
