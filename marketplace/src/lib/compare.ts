// marketplace/src/lib/compare.ts
// Mismo cálculo de "mejor valor" que app/(screens)/compare.tsx — puro, sin
// red, así que se puede correr tanto server-side (la página /comparar) como
// si hiciera falta client-side.
import { PublicVehicle } from "@/lib/vehicles";

export interface BestValues {
  minPrice: number | null;
  maxYear: number | null;
  minKm: number | null;
  maxRating: number | null;
  minPricePerKm: number | null;
}

export function computeBestValues(vehicles: PublicVehicle[]): BestValues | null {
  if (vehicles.length < 2) return null;

  const currencies = new Set(vehicles.map((v) => v.currency));
  const sameCurrency = currencies.size === 1;

  const prices = vehicles.map((v) => v.price).filter((p) => p > 0);
  const years = vehicles.map((v) => v.year ?? 0).filter((y) => y > 0);
  const kms = vehicles.map((v) => v.km).filter((k) => k >= 0);
  const ratings = vehicles.map((v) => v.sellerRating).filter((r) => r > 0);
  const pricePerKm = sameCurrency
    ? vehicles.map((v) => (v.price && v.km > 0 ? v.price / v.km : null)).filter((x): x is number => x !== null)
    : [];

  return {
    minPrice: sameCurrency && prices.length > 0 ? Math.min(...prices) : null,
    maxYear: years.length > 0 ? Math.max(...years) : null,
    minKm: kms.length > 0 ? Math.min(...kms) : null,
    maxRating: ratings.length > 0 ? Math.max(...ratings) : null,
    minPricePerKm: pricePerKm.length > 0 ? Math.min(...pricePerKm) : null,
  };
}

// Cuenta "puntos ganados" por vehículo — precio/año/km/rating/precio-por-km
// más iguales al mejor valor, +1 por cada característica positiva (mismo
// criterio que compare.tsx).
export function computeScores(vehicles: PublicVehicle[], best: BestValues | null): Record<string, number> {
  const scores: Record<string, number> = {};
  vehicles.forEach((v) => {
    scores[v.id] = 0;
  });
  if (!best) return scores;

  vehicles.forEach((v) => {
    if (best.minPrice !== null && v.price === best.minPrice) scores[v.id]++;
    if (best.maxYear !== null && v.year === best.maxYear) scores[v.id]++;
    if (best.minKm !== null && v.km === best.minKm) scores[v.id]++;
    if (best.maxRating !== null && v.sellerRating === best.maxRating) scores[v.id]++;
    if (best.minPricePerKm !== null && v.price && v.km > 0) {
      const ppk = v.price / v.km;
      if (Math.round(ppk) === Math.round(best.minPricePerKm)) scores[v.id]++;
    }
    if (v.vtvValid) scores[v.id]++;
    if (v.papersUpToDate) scores[v.id]++;
    if (v.warranty) scores[v.id]++;
    if (v.singleOwner) scores[v.id]++;
    if (v.serviceRecords) scores[v.id]++;
    if (v.acceptsFinancing) scores[v.id]++;
    if (v.negotiablePrice) scores[v.id]++;
  });
  return scores;
}
