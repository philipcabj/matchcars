import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';

export interface MarketAnalysis {
  min: number;
  max: number;
  avg: number;
  count: number;
}

async function getUsdToArsRate(): Promise<number> {
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
            const rate = await getUsdToArsRate();
            min *= rate;
            max *= rate;
            avg *= rate;
          }
          return { min, max, avg, count };
        }
      }

      // Si no hay match exacto por ID, agregamos un fallback más flexible:
      const brandCandidates = Array.from(
        new Set([
          normalizedBrand,
          normalizedBrand.toUpperCase(),
          normalizedBrand.toLowerCase(),
        ])
      );

      const refQuery = query(
        collection(db, "price_reference"),
        where("brand", "in", brandCandidates),
        where("year", "==", yearNumber),
        where("currency", "==", targetCurrency)
      );
      const refSnap = await getDocs(refQuery);
      const refPrices: number[] = [];

      const target = normalizedModel.toLowerCase();

      // Process fetched reference documents
      refSnap.forEach((d) => {
        const data: any = d.data();
        const modelStr = String(data.model || "").toLowerCase();
        
        // Match model loosely if provided
        if (!target || modelStr.includes(target)) {
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
          const rate = await getUsdToArsRate();
          min *= rate;
          max *= rate;
          avg *= rate;
        }
        return { min, max, avg, count };
      }
    } catch (e) {
      console.error("Error reading price_reference", e);
    }

    // 2) Fallback a datos internos de vehículos
    const q = query(
      collection(db, "vehicles"),
      where("brand", "==", normalizedBrand),
      where("model", "==", normalizedModel),
      where("year", "==", yearNumber),
      where("currency", "==", currency)
    );

    const snap = await getDocs(q);
    const prices: number[] = [];

    snap.forEach((docSnap) => {
      if (excludeId && docSnap.id === excludeId) return;

      const data: any = docSnap.data();
      if (data.price && !isNaN(data.price) && data.status !== "deleted") {
        prices.push(Number(data.price));
      }
    });

    if (prices.length > 0) {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const sum = prices.reduce((a, b) => a + b, 0);
      const avg = sum / prices.length;
      return { min, max, avg, count: prices.length };
    }
  } catch (e) {
    console.error("Error analyzing market price", e);
  }
  return { min: 0, max: 0, avg: 0, count: 0 };
}
