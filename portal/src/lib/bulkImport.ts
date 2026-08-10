// portal/src/lib/bulkImport.ts
// Constantes de la carga masiva, iguales a las de app/(screens)/bulk-import.tsx
// para que la planilla de ejemplo y el CSV real sean intercambiables entre
// portal y app. El procesamiento real lo sigue haciendo la Cloud Function
// startBulkImport (functions/src/index.ts), sin tocar.
export const TEMPLATE_HEADERS = [
  "id",
  "brand",
  "model",
  "version",
  "year",
  "price",
  "currency",
  "km",
  "description",
  "fuel",
  "transmission",
];

export const TEMPLATE_ROWS = [
  ["AUTO1", "Toyota", "Corolla", "XEI CVT", "2022", "18500", "USD", "32000", "Único dueño, service oficial al día", "Nafta", "Automática"],
  ["AUTO2", "Volkswagen", "Gol Trend", "Trendline", "2019", "9800000", "ARS", "58000", "Impecable, VTV vigente", "Nafta", "Manual"],
];

export interface BulkImportPreviewRow {
  id?: string;
  brand: string;
  model: string;
  valid: boolean;
}

export interface BulkImportJob {
  status: "processing" | "done" | "error";
  totalCount: number;
  processedCount: number;
  successCount: number;
  failCount: number;
  errors: { row: number; vehicle: string; message: string }[];
  errorMessage?: string;
}
