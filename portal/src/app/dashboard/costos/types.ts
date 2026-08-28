// portal/src/app/dashboard/costos/types.ts
// Shape de GET /api/agency/costos, compartido entre VentasCerradasTab y
// ResumenTab (el fetch se levanta una sola vez en page.tsx).
export interface CostoEntry {
  saleId: string;
  vehicleId: string | null;
  vehicleSnapshot: { brand?: string; model?: string; year?: number } | null;
  buyerName: string | null;
  dealPrice: number;
  dealCurrency: string;
  cost: number | null;
  commissionAmount: number;
  margin: number | null; // neto: precio - costo - comisión
  soldAt: string | null;
}
