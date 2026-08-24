// portal/src/lib/risk-scoring.ts
// Puerto server-side (Admin SDK) de lib/riskScoring.ts (raíz, client SDK) —
// mismo cálculo de riesgo que corre la app móvil al publicar un auto, para
// que una publicación hecha desde el portal reciba la misma evaluación en
// vez de quedar siempre en riskScore: 0 (ver agency/vehicles/route.ts).
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

async function getConfigUsdToArsRate(): Promise<number> {
  try {
    const snap = await adminDb.doc("config/pricing").get();
    if (snap.exists) {
      const data = snap.data() ?? {};
      let raw: unknown = data.usdToArsRate;
      if (typeof raw === "string") raw = Number(raw.replace(",", "."));
      let value = Number(raw);
      if (!Number.isNaN(value)) {
        if (value > 0 && value < 10) value = value * 1000;
        if (value > 100) return value;
      }
    }
  } catch {
  }
  return 1200;
}

async function getUsdToArsRate(): Promise<number> {
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/blue");
    if (res.ok) {
      const data = await res.json();
      const rate = Number(data?.venta);
      if (!Number.isNaN(rate) && rate > 100) return rate;
    }
  } catch {
  }
  return getConfigUsdToArsRate();
}

function normalizePrice(val: unknown): number {
  let v = Number(val);
  if (isNaN(v) && typeof val === "string") v = Number(val.replace(",", ".").replace(/\s/g, ""));
  if (isNaN(v) || v <= 0) return 0;
  if (v < 100 || (v < 1000 && !Number.isInteger(v))) return v * 1000;
  return v;
}

// Solo el promedio de mercado, que es lo único que usa el scoring de riesgo
// (a diferencia de portal/src/lib/pricing.ts, que además devuelve min/max
// para mostrarlos en el form).
async function getMarketAverage(brand: string, model: string, year: number, currency: "ARS" | "USD"): Promise<number> {
  const normalizedBrand = brand.trim();
  const normalizedModel = model.trim();
  const targetModel = normalizedModel.toLowerCase();
  const brandCandidates = Array.from(new Set([normalizedBrand, normalizedBrand.toUpperCase(), normalizedBrand.toLowerCase()]));

  try {
    const snap = await adminDb
      .collection("vehicles")
      .where("brand", "in", brandCandidates)
      .where("year", "==", year)
      .where("currency", "==", currency)
      .get();
    const prices: number[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.status === "deleted") return;
      if (String(data.model || "").toLowerCase() !== targetModel) return;
      if (data.price && !isNaN(data.price)) prices.push(Number(data.price));
    });
    if (prices.length > 0) return prices.reduce((a, b) => a + b, 0) / prices.length;
  } catch {
  }

  try {
    const targetCurrency = currency === "ARS" ? "USD" : currency;
    const refKey = `${normalizedBrand}_${normalizedModel}_${year}_${targetCurrency}`;
    const refDoc = await adminDb.doc(`price_reference/${refKey}`).get();
    if (refDoc.exists) {
      const data = refDoc.data() ?? {};
      let avg = normalizePrice(data.avg);
      const count = Number(data.count) || 0;
      if (avg > 0 && count > 0) {
        if (currency === "ARS" && targetCurrency === "USD") avg *= await getUsdToArsRate();
        return avg;
      }
    }
  } catch {
  }

  return 0;
}

export async function evaluateVehicleRiskServer(options: {
  brand: string;
  model: string;
  year: number;
  price: number;
  currency: "ARS" | "USD";
  description: string;
  userId: string;
  trustLevel: string;
  coverImage: string;
}): Promise<{ flags: string[]; score: number }> {
  const flags: string[] = [];
  let score = 0;

  try {
    const avg = await getMarketAverage(options.brand, options.model, options.year, options.currency);
    if (avg > 0) {
      if (options.price < avg * 0.6) {
        flags.push("price_outlier");
        score += 4;
      } else if (options.price > avg * 1.5) {
        flags.push("price_high_outlier");
        score += 3;
      }
      const currentYear = new Date().getFullYear();
      if (options.year >= currentYear && options.price < avg * 0.8) {
        flags.push("year_price_mismatch");
        score += 2;
      }
    }
  } catch {
  }

  try {
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const snapRecent = await adminDb
      .collection("vehicles")
      .where("userId", "==", options.userId)
      .where("createdAt", ">=", Timestamp.fromDate(from))
      .get();
    if (snapRecent.docs.length >= 3 && options.trustLevel !== "verified") {
      flags.push("new_user_mass");
      score += 3;
    }
  } catch {
  }

  if (options.description) {
    const text = options.description.toLowerCase();
    const hasPhone = /\d{8,}/.test(text);
    const hasLink = text.includes("http://") || text.includes("https://") || text.includes("www.") || text.includes(".com");
    if (hasPhone || hasLink) {
      flags.push("external_contact");
      score += 2;
    }
  }

  try {
    if (options.coverImage) {
      const snapDup = await adminDb
        .collection("vehicles")
        .where("userId", "==", options.userId)
        .where("images.cover", "==", options.coverImage)
        .get();
      if (!snapDup.empty) {
        flags.push("duplicate_image");
        score += 2;
      }
    }
  } catch {
  }

  return { flags: Array.from(new Set(flags)), score };
}
