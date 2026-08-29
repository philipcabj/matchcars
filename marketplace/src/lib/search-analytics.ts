// marketplace/src/lib/search-analytics.ts
// Captura de búsquedas del lado web — server-side con Admin SDK (la página
// principal ya es un server component con `searchParams`), así que no hace
// falta pasar por las reglas de Firestore como sí necesita el lado app (ver
// lib/search-analytics.ts en la raíz del repo, mismo shape de documento).
import "server-only";

import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export interface WebSearchFilters {
  brand?: string;
  province?: string;
  city?: string;
  fuelType?: string;
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  financing?: boolean;
  tradeIn?: boolean;
}

function cleanFilters(filters: WebSearchFilters): WebSearchFilters {
  const out: WebSearchFilters = {};
  (Object.keys(filters) as (keyof WebSearchFilters)[]).forEach((k) => {
    const v = filters[k];
    if (v === undefined || v === null || v === false) return;
    (out[k] as typeof v) = v;
  });
  return out;
}

export function logSearchEvent(query: string | undefined, filters: WebSearchFilters, resultsCount: number) {
  const cleaned = cleanFilters(filters);
  const trimmedQuery = (query ?? "").trim().slice(0, 100);
  if (!trimmedQuery && Object.keys(cleaned).length === 0) return; // nada que registrar

  adminDb
    .collection("searchEvents")
    .add({
      query: trimmedQuery,
      filters: cleaned,
      resultsCount,
      source: "web",
      platform: null,
      uid: null,
      createdAt: FieldValue.serverTimestamp(),
    })
    .catch(() => {});
}
