// lib/search-analytics.ts
// Captura de búsquedas (texto libre + filtros activos) para poder armar más
// adelante un widget de "lo más buscado" en el dashboard de agencias — hoy
// no se registra ninguna búsqueda en ningún lado (Analytics.logSearch en
// lib/analytics.ts existe pero nunca se llama, y aunque se llamara manda los
// datos a Meta/GA, no a algo propio que se pueda leer para un dashboard).
//
// Mismo patrón "fire and forget" que loginEvents (contexts/AuthContext.tsx)
// y error_logs (lib/logger.ts): addDoc sin bloquear la UI, sin leer de
// vuelta del lado del cliente.
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Platform } from "react-native";
import { auth, db } from "./firebase";

export interface SearchFilters {
  brand?: string;
  model?: string;
  province?: string;
  city?: string;
  fuelType?: string;
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  financing?: boolean;
  tradeIn?: boolean;
  currency?: string;
}

// Saca las claves vacías/undefined — así "filters" en Firestore solo
// muestra lo que la persona realmente usó, no un objeto lleno de "".
function cleanFilters(filters: SearchFilters): SearchFilters {
  const out: SearchFilters = {};
  (Object.keys(filters) as (keyof SearchFilters)[]).forEach((k) => {
    const v = filters[k];
    if (v === undefined || v === null || v === "" || v === false) return;
    (out[k] as typeof v) = v;
  });
  return out;
}

export function logSearchEvent(query: string, filters: SearchFilters, resultsCount: number) {
  const cleaned = cleanFilters(filters);
  const trimmedQuery = query.trim().slice(0, 100);
  if (!trimmedQuery && Object.keys(cleaned).length === 0) return; // nada que registrar

  addDoc(collection(db, "searchEvents"), {
    query: trimmedQuery,
    filters: cleaned,
    resultsCount,
    source: "app",
    platform: Platform.OS,
    uid: auth.currentUser?.uid ?? null,
    createdAt: serverTimestamp(),
  }).catch(() => {});
}
