// lib/listingQuality.ts
// Score de calidad de una publicación en curso — se muestra como ayuda no
// bloqueante en app/(screens)/add-car mientras el vendedor carga el auto.
// Pura: sin side effects, fácil de testear.

export interface QualityCheck {
  ok: boolean;
  label: string;
  hint?: string;
  weight: number;
}

export interface ListingQuality {
  score: number; // 0-100
  checks: QualityCheck[];
}

export interface ListingQualityInput {
  photoCount: number; // portada + galería con url
  hasCover: boolean;
  descriptionLength: number;
  year?: string | number;
  km?: string | number;
  version?: string;
  price?: number;
  marketAvg?: number | null; // promedio de mercado (usePriceSuggestion)
  fuelType?: string;
  gearbox?: string;
}

const OVERPRICED_THRESHOLD = 0.15; // 15% arriba del promedio

export function evaluateListing(i: ListingQualityInput): ListingQuality {
  const checks: QualityCheck[] = [];

  checks.push({
    label: "Foto de portada",
    ok: i.hasCover,
    hint: "Es la primera que ve el comprador.",
    weight: 15,
  });
  checks.push({
    label: "5 fotos o más",
    ok: i.photoCount >= 5,
    hint: `Tenés ${i.photoCount}. Sumá frente, laterales, trasera e interior.`,
    weight: 20,
  });
  checks.push({
    label: "Fotos del interior y el motor",
    ok: i.photoCount >= 7,
    hint: "Las publicaciones con 7+ fotos reciben más consultas.",
    weight: 10,
  });
  checks.push({
    label: "Descripción de 60+ caracteres",
    ok: i.descriptionLength >= 60,
    hint: "Contá estado, service, único dueño, papeles al día.",
    weight: 15,
  });
  checks.push({
    label: "Año, km y versión completos",
    ok: !!i.year && !!i.km && !!String(i.version || "").trim(),
    weight: 10,
  });
  checks.push({
    label: "Combustible y caja cargados",
    ok: !!i.fuelType && !!i.gearbox,
    weight: 10,
  });

  if (i.price && i.marketAvg && i.marketAvg > 0) {
    const diff = (i.price - i.marketAvg) / i.marketAvg;
    const overpriced = diff > OVERPRICED_THRESHOLD;
    checks.push({
      label: overpriced ? `Precio ${Math.round(diff * 100)}% arriba del mercado` : "Precio alineado al mercado",
      ok: !overpriced,
      hint: overpriced ? "Los autos muy por encima del promedio casi no reciben consultas." : undefined,
      weight: 20,
    });
  } else {
    checks.push({
      label: "Comparar el precio con el mercado",
      ok: false,
      hint: "Completá marca, modelo y año para ver el promedio.",
      weight: 20,
    });
  }

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
  return { score: Math.round((got / total) * 100), checks };
}
