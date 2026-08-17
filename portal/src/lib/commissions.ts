// portal/src/lib/commissions.ts
export type CommissionRuleType = "porcentaje_venta" | "porcentaje_margen" | "fijo" | "escalonado";

export interface CommissionTier {
  desde: number;
  hasta: number | null; // null = sin techo
  porcentaje: number;
}

export interface CommissionRule {
  tipo: CommissionRuleType;
  valor: number; // porcentaje (0-100) o monto fijo, según tipo — ignorado si tipo es "escalonado"
  escalones: CommissionTier[]; // solo se usa si tipo es "escalonado"
}

export const DEFAULT_COMMISSION_RULE: CommissionRule = {
  tipo: "porcentaje_venta",
  valor: 3,
  escalones: [],
};

export const COMMISSION_TYPE_LABELS: Record<CommissionRuleType, string> = {
  porcentaje_venta: "% sobre el precio de venta",
  porcentaje_margen: "% sobre el margen (venta − costos)",
  fijo: "Monto fijo por venta",
  escalonado: "Escalonado por precio de venta",
};

export interface CommissionEntry {
  saleId: string; // vehicleId, mismo id que sales/{vehicleId}
  vehicleId: string;
  sellerUid: string; // vendedor al que se le atribuye
  vehicleSnapshot?: { brand?: string; model?: string; year?: number };
  dealPrice: number;
  dealCurrency: "ARS" | "USD";
  margin: number | null; // null si no había costos cargados
  amount: number;
  rule: CommissionRule; // foto de la regla vigente al momento del cierre
  soldAt: string | null;
}

// Cálculo puro — reusado tanto al cerrar una venta (server) como, si hiciera
// falta, en una previsualización. margin puede ser null (sin costos
// cargados): en ese caso "porcentaje_margen" cae a 0, el resto no lo necesita.
export function calculateCommission(rule: CommissionRule, dealPrice: number, margin: number | null): number {
  switch (rule.tipo) {
    case "porcentaje_venta":
      return round2((dealPrice * rule.valor) / 100);
    case "porcentaje_margen":
      return margin && margin > 0 ? round2((margin * rule.valor) / 100) : 0;
    case "fijo":
      return round2(rule.valor);
    case "escalonado": {
      const tier = rule.escalones.find((t) => dealPrice >= t.desde && (t.hasta === null || dealPrice <= t.hasta));
      return tier ? round2((dealPrice * tier.porcentaje) / 100) : 0;
    }
    default:
      return 0;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
