import type { BuyerPreferences } from "@/types/user";
import type { Vehicle } from "@/types/vehicle";

export interface MatchScoreDetail {
  score: number; // 0-100
  breakdown: MatchCriterion[];
}

export interface MatchCriterion {
  label: string;
  matched: boolean;
  points: number;
  maxPoints: number;
}

// Weights must sum to 100
const WEIGHTS = {
  price: 28,
  province: 20,
  km: 16,
  year: 14,
  swap: 12,
  fuel: 10,
};

export function calcMatchScore(
  vehicle: Vehicle,
  prefs: BuyerPreferences
): MatchScoreDetail {
  const breakdown: MatchCriterion[] = [];
  let earned = 0;

  // ── Price ────────────────────────────────────────────────────────────────
  const price = Number(vehicle.price ?? 0);
  const hasPrice = prefs.budgetMin !== undefined || prefs.budgetMax !== undefined;
  let priceMatch = false;
  if (hasPrice) {
    const aboveMin = prefs.budgetMin === undefined || price >= prefs.budgetMin;
    const belowMax = prefs.budgetMax === undefined || price <= prefs.budgetMax;
    priceMatch = aboveMin && belowMax;
  }
  if (hasPrice) {
    earned += priceMatch ? WEIGHTS.price : 0;
    breakdown.push({
      label: "Precio dentro de tu presupuesto",
      matched: priceMatch,
      points: WEIGHTS.price,
      maxPoints: WEIGHTS.price,
    });
  }

  // ── Province ─────────────────────────────────────────────────────────────
  const vProvince = vehicle.province ?? (vehicle as any).location?.province ?? "";
  const provinceMatch =
    !!prefs.province && vProvince.toLowerCase() === prefs.province.toLowerCase();
  if (prefs.province) {
    earned += provinceMatch ? WEIGHTS.province : 0;
    breakdown.push({
      label: "Misma provincia",
      matched: provinceMatch,
      points: WEIGHTS.province,
      maxPoints: WEIGHTS.province,
    });
  }

  // ── Km ───────────────────────────────────────────────────────────────────
  const km = Number(vehicle.km ?? 0);
  const kmMatch = prefs.maxKm === undefined || km <= prefs.maxKm;
  if (prefs.maxKm !== undefined) {
    earned += kmMatch ? WEIGHTS.km : 0;
    breakdown.push({
      label: `Menos de ${Number(prefs.maxKm).toLocaleString("es-AR")} km`,
      matched: kmMatch,
      points: WEIGHTS.km,
      maxPoints: WEIGHTS.km,
    });
  }

  // ── Year ─────────────────────────────────────────────────────────────────
  const year = Number(vehicle.year ?? 0);
  const yearMatch = prefs.minYear === undefined || year >= prefs.minYear;
  if (prefs.minYear !== undefined) {
    earned += yearMatch ? WEIGHTS.year : 0;
    breakdown.push({
      label: `Modelo ${prefs.minYear} o más nuevo`,
      matched: yearMatch,
      points: WEIGHTS.year,
      maxPoints: WEIGHTS.year,
    });
  }

  // ── Swap ─────────────────────────────────────────────────────────────────
  const swapMatch = !prefs.wantsSwap || !!(vehicle as any).acceptsTradeIn;
  if (prefs.wantsSwap) {
    earned += swapMatch ? WEIGHTS.swap : 0;
    breakdown.push({
      label: "Acepta permuta",
      matched: swapMatch,
      points: WEIGHTS.swap,
      maxPoints: WEIGHTS.swap,
    });
  }

  // ── Fuel ─────────────────────────────────────────────────────────────────
  const vFuel = ((vehicle as any).fuelType ?? "").toLowerCase().trim();
  const fuelMatch = !prefs.fuelType || vFuel === prefs.fuelType.toLowerCase().trim();
  if (prefs.fuelType) {
    earned += fuelMatch ? WEIGHTS.fuel : 0;
    breakdown.push({
      label: `Combustible: ${prefs.fuelType}`,
      matched: fuelMatch,
      points: WEIGHTS.fuel,
      maxPoints: WEIGHTS.fuel,
    });
  }

  // If no preferences are set, return 0 with empty breakdown
  if (breakdown.length === 0) {
    return { score: 0, breakdown: [] };
  }

  // Normalise to the criteria that were actually active
  const maxPossible = breakdown.reduce((s, c) => s + c.maxPoints, 0);
  const score = maxPossible > 0 ? Math.round((earned / maxPossible) * 100) : 0;

  return { score, breakdown };
}
