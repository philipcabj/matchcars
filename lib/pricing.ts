import { db } from '@/lib/firebase';
import { collection, doc, documentId, getDoc, getDocs, query, where } from 'firebase/firestore';

export interface MarketAnalysis {
  min: number;
  max: number;
  avg: number;
  count: number;
  // 'listings': computed from MatchCars' own published vehicles — preferred, since it reflects
  // the current real market on the platform.
  // 'reference': external market price guide (data/price_reference_flat.csv, imported into the
  // price_reference collection), used only when there isn't enough MatchCars data to compare against.
  source?: "listings" | "reference";
  // Only set when a USD->ARS conversion was applied (i.e. currency requested was ARS but the
  // matched data was in USD, which is always the case for the reference guide).
  exchangeRate?: number;
  exchangeRateSource?: string;
}

async function getConfigUsdToArsRate(): Promise<number> {
  try {
    const snap = await getDoc(doc(db, "config", "pricing"));
    if (snap.exists()) {
      const data: any = snap.data();
      let raw = data.usdToArsRate;

      // Handle string inputs with comma or dot issues if necessary
      if (typeof raw === 'string') {
        // If it contains a comma, replace with dot? Or if it's "1.400" (thousands)?
        // Simple Number() parse
        raw = Number(raw.replace(',', '.'));
      }

      let value = Number(raw);

      // Heuristic for rate: ARS/USD is currently > 1000.
      // If we get something like 1.4 or 1.2, it might be 1.4k or 1.2k (or user entered 1.400 meaning 1400)
      if (!Number.isNaN(value)) {
         if (value > 0 && value < 10) {
            value = value * 1000;
         }
         if (value > 100) return value;
      }
    }
  } catch (e) {
    console.error("Error reading usdToArsRate config", e);
  }
  // Fallback to a realistic default if config is missing (approximate Blue Dollar rate)
  // This prevents displaying USD values as ARS (e.g. 32,000 instead of 32,000,000)
  return 1200;
}

// Public, no-auth exchange rate (Blue Dollar, the rate commonly used to price used goods in
// Argentina) from dolarapi.com. Falls back to the internal config doc, then a hardcoded default,
// if the public API is unreachable.
export async function getUsdToArsRate(): Promise<{ rate: number; source: string }> {
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/blue");
    if (res.ok) {
      const data = await res.json();
      const rate = Number(data?.venta);
      if (!Number.isNaN(rate) && rate > 100) {
        return { rate, source: "Dólar Blue (dolarapi.com)" };
      }
    }
  } catch (e) {
    console.error("Error fetching public USD/ARS rate", e);
  }
  const fallbackRate = await getConfigUsdToArsRate();
  return { rate: fallbackRate, source: "Referencia interna de MatchCars" };
}

// Helper to normalize price (handle kUSD format like 22.99 -> 22990)
function normalizePrice(val: any, currency: string): number {
  let v = Number(val);
  
  // Try parsing string with comma if NaN
  if (isNaN(v) && typeof val === 'string') {
    // Replace comma with dot, and remove any non-numeric chars except dot/minus? 
    // Ideally just replace comma. Some users might use dots for thousands.
    // If we have "32.886", replace might not be needed if it's already a valid JS number format (no, JS uses dot for decimal).
    // If "32.886" means 32k, JS parses it as 32.886 (approx 33).
    v = Number(val.replace(',', '.').replace(/\s/g, ''));
  }

  if (isNaN(v) || v <= 0) return 0;

  // HEURISTIC: price_reference data may store values in "kUSD" format (e.g. 22.99 → 22,990).
  // Assumption: no car in this market costs less than $1,000 USD or 1,000 ARS.
  // Only apply multiplication when the value has a decimal part OR is below 100,
  // to avoid inflating legitimate integer prices like 800 (USD scrap car).
  if (v < 100 || (v < 1000 && !Number.isInteger(v))) {
    return v * 1000;
  }
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

    if (!normalizedBrand || !normalizedModel || !yearNumber) {
      return { min: 0, max: 0, avg: 0, count: 0 };
    }

    const targetCurrency = currency === "ARS" ? "USD" : currency;
    const brandCandidates = Array.from(
      new Set([
        normalizedBrand,
        normalizedBrand.toUpperCase(),
        normalizedBrand.toLowerCase(),
      ])
    );
    const targetModel = normalizedModel.toLowerCase();

    // 1) Datos internos de MatchCars primero: reflejan el mercado real y actual de la
    // plataforma, así que se priorizan por sobre la guía externa. Brand/model se comparan
    // sin distinguir mayúsculas porque las publicaciones no siempre guardan el mismo casing
    // que usan los selectores de marca/modelo (ej: "VOLKSWAGEN"/"GOLF" vs "Volkswagen"/"Golf").
    try {
      const listingsQuery = query(
        collection(db, "vehicles"),
        where("brand", "in", brandCandidates),
        where("year", "==", yearNumber),
        where("currency", "==", currency)
      );
      const listingsSnap = await getDocs(listingsQuery);
      const prices: number[] = [];

      listingsSnap.forEach((docSnap) => {
        if (excludeId && docSnap.id === excludeId) return;
        const data: any = docSnap.data();
        if (data.status === "deleted") return;
        const modelStr = String(data.model || "").toLowerCase();
        if (modelStr !== targetModel) return;
        if (data.price && !isNaN(data.price)) {
          prices.push(Number(data.price));
        }
      });

      if (prices.length > 0) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const sum = prices.reduce((a, b) => a + b, 0);
        const avg = sum / prices.length;
        return { min, max, avg, count: prices.length, source: "listings" };
      }
    } catch (e) {
      console.error("Error reading internal listings for price analysis", e);
    }

    // 2) Sin datos propios suficientes: recurrir a la guía de precios externa.
    try {
      const refKey = `${normalizedBrand}_${normalizedModel}_${yearNumber}_${targetCurrency}`;
      const refDoc = await getDoc(doc(db, "price_reference", refKey));
      if (refDoc.exists()) {
        const data: any = refDoc.data();

        // Use normalizePrice for all fields
        let min = normalizePrice(data.min, targetCurrency);
        let max = normalizePrice(data.max, targetCurrency);
        let avg = normalizePrice(data.avg, targetCurrency);
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

      // Si no hay match exacto por ID, agregamos un fallback más flexible:
      const refQuery = query(
        collection(db, "price_reference"),
        where("brand", "in", brandCandidates),
        where("year", "==", yearNumber),
        where("currency", "==", targetCurrency)
      );
      const refSnap = await getDocs(refQuery);
      const refPrices: number[] = [];

      // Process fetched reference documents
      refSnap.forEach((d) => {
        const data: any = d.data();
        const modelStr = String(data.model || "").toLowerCase();

        // Match model loosely if provided
        if (!targetModel || modelStr.includes(targetModel)) {
          // Use normalizePrice helper
          const v = normalizePrice(data.avg || data.price, targetCurrency);

          if (v > 0) {
            refPrices.push(v);
          }
        }
      });

      if (refPrices.length > 0) {
        let min = Math.min(...refPrices);
        let max = Math.max(...refPrices);
        const sum = refPrices.reduce((a, b) => a + b, 0);
        let avg = sum / refPrices.length;
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

// Years a given brand/model actually has data for, combining MatchCars listings and the
// external reference guide. Used to hide year options that would obviously return nothing
// (e.g. a model shown for a year it was never sold).
export async function getAvailableYears(brand: string, model: string): Promise<number[]> {
  const normalizedBrand = brand.trim();
  const normalizedModel = model.trim();
  if (!normalizedBrand || !normalizedModel) return [];

  const years = new Set<number>();
  const brandCandidates = Array.from(
    new Set([normalizedBrand, normalizedBrand.toUpperCase(), normalizedBrand.toLowerCase()])
  );
  const targetModel = normalizedModel.toLowerCase();

  // 1) Internal MatchCars listings for this exact model (case-insensitive).
  try {
    const listingsSnap = await getDocs(
      query(collection(db, "vehicles"), where("brand", "in", brandCandidates))
    );
    listingsSnap.forEach((d) => {
      const data: any = d.data();
      if (data.status === "deleted") return;
      if (String(data.model || "").toLowerCase() !== targetModel) return;
      const y = Number(data.year);
      if (!isNaN(y) && y > 1900) years.add(y);
    });
  } catch (e) {
    console.error("Error fetching internal years for model", e);
  }

  // 2) External reference guide: years where at least one trim of this model has a usable
  // price. price_reference doc IDs are `${brand}_${model...}_${year}_${currency}` using the
  // CSV's original (uppercase) casing, so a documentId prefix range scopes this to just the
  // matching model instead of reading the whole brand (thousands of docs).
  try {
    const prefix = `${normalizedBrand.toUpperCase()}_${normalizedModel.toUpperCase()}`;
    const refSnap = await getDocs(
      query(
        collection(db, "price_reference"),
        where(documentId(), ">=", prefix),
        where(documentId(), "<", prefix + "")
      )
    );
    refSnap.forEach((d) => {
      const data: any = d.data();
      const v = normalizePrice(data.avg, "USD");
      if (v <= 0) return;
      const y = Number(data.year);
      if (!isNaN(y) && y > 1900) years.add(y);
    });
  } catch (e) {
    console.error("Error fetching reference years for model", e);
  }

  return Array.from(years).sort((a, b) => b - a);
}

// Years that currently have at least one active, published MatchCars listing — optionally
// scoped by brand and/or model. Used by the index feed's year filter so it doesn't offer years
// with nothing to actually find. Unlike getAvailableYears, this intentionally does NOT consult
// the external reference guide — it's about what's browsable right now, not market pricing.
export async function getListingYears(brand?: string, model?: string): Promise<number[]> {
  const years = new Set<number>();
  const normalizedBrand = brand?.trim();
  const targetModel = model?.trim().toLowerCase();

  try {
    const baseQuery = normalizedBrand
      ? query(
          collection(db, "vehicles"),
          where("brand", "in", Array.from(new Set([normalizedBrand, normalizedBrand.toUpperCase(), normalizedBrand.toLowerCase()])))
        )
      : query(collection(db, "vehicles"));

    const snap = await getDocs(baseQuery);
    snap.forEach((d) => {
      const data: any = d.data();
      if (data.published === false) return;
      if (["deleted", "rejected", "rejected_limit", "blocked", "sold", "pending", "pending_review"].includes(data.status)) return;
      if (targetModel && String(data.model || "").toLowerCase() !== targetModel) return;
      const y = Number(data.year);
      if (!isNaN(y) && y > 1900) years.add(y);
    });
  } catch (e) {
    console.error("Error fetching listing years", e);
  }

  return Array.from(years).sort((a, b) => b - a);
}
