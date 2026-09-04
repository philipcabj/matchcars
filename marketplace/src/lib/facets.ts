// marketplace/src/lib/facets.ts
// Landing pages por faceta (/autos/{marca}, /autos/{marca}/{modelo}). Resuelve
// un slug de la URL de vuelta al valor real de marca/modelo comparando contra
// el inventario publicado — slugify es lossy, así que la única fuente de verdad
// es "¿existe una marca/modelo cuyo slug coincide?".
import "server-only";

import { cache } from "react";
import { getBrandModelMap } from "@/lib/vehicles";

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface ResolvedFacet {
  brand: string;
  model?: string;
}

// null = el slug no corresponde a ninguna marca/modelo publicado → 404.
// (segments vacío se maneja en la page: redirige a la home.)
export const resolveFacet = cache(async (segments: string[]): Promise<ResolvedFacet | null> => {
  if (segments.length === 0 || segments.length > 2) return null;
  const map = await getBrandModelMap();

  const brandSlug = segments[0];
  const brand = Object.keys(map).find((b) => slugify(b) === brandSlug);
  if (!brand) return null;
  if (segments.length === 1) return { brand };

  const modelSlug = segments[1];
  const model = map[brand].find((m) => slugify(m) === modelSlug);
  if (!model) return null;
  return { brand, model };
});

export function facetPath(brand: string, model?: string): string {
  return model ? `/autos/${slugify(brand)}/${slugify(model)}` : `/autos/${slugify(brand)}`;
}
