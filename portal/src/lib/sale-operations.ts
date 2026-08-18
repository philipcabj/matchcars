// portal/src/lib/sale-operations.ts
// Módulo A — Operación de venta: checklist de trámites, financiación rápida
// (sin conexión a ninguna financiera) y parte de pago, agrupados en una sola
// entidad colgada de un lead. Ver saleOperations/{id} en Firestore.
export type ChecklistStepStatus = "pendiente" | "hecho";

export interface ChecklistAttachment {
  url: string;
  nombre: string;
  subidoEn: string | null;
}

export interface ChecklistItem {
  key: string;
  label: string;
  status: ChecklistStepStatus;
  responsable: string | null; // uid de un miembro de la agencia
  // Fecha límite — a propósito NO hay un plazo hardcodeado (verificación
  // policial/informe de dominio caducan, pero el plazo real varía y no está
  // definido); la agencia la carga a mano cuando la conoce. null = sin fecha.
  dueAt: string | null;
  completedAt: string | null;
  adjuntos: ChecklistAttachment[];
}

// Plantilla fija v1 — reordenar/personalizar por agencia queda para más
// adelante si el flujo se valida en uso real.
export const DEFAULT_CHECKLIST_STEPS: { key: string; label: string }[] = [
  { key: "sena", label: "Seña / Reserva" },
  { key: "boleto_compraventa", label: "Boleto de compraventa" },
  { key: "verificacion_policial", label: "Verificación policial" },
  { key: "formulario_08", label: "Formulario 08" },
  { key: "informe_dominio", label: "Informe de dominio" },
  { key: "transferencia", label: "Transferencia" },
  { key: "entrega", label: "Entrega" },
];

export function buildDefaultChecklist(): ChecklistItem[] {
  return DEFAULT_CHECKLIST_STEPS.map((s) => ({
    key: s.key,
    label: s.label,
    status: "pendiente",
    responsable: null,
    dueAt: null,
    completedAt: null,
    adjuntos: [],
  }));
}

export interface FinancingCalc {
  anticipo: number;
  cuotas: number;
  tasaAnual: number; // % nominal anual, cargada a mano por la agencia
  cuotaMensual: number; // resultado — sistema francés, cuota fija
  montoFinanciado: number;
}

// Sistema francés (cuota fija) — matemática pura, sin ninguna integración.
// tasaAnual es nominal anual; se convierte a tasa mensual simple (/12).
export function calculateFrenchInstallment(montoFinanciado: number, cuotas: number, tasaAnual: number): number {
  if (montoFinanciado <= 0 || cuotas <= 0) return 0;
  const i = tasaAnual / 100 / 12;
  if (i === 0) return round2(montoFinanciado / cuotas);
  const cuota = (montoFinanciado * i) / (1 - Math.pow(1 + i, -cuotas));
  return round2(cuota);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface TradeInAppraisal {
  min: number;
  avg: number;
  max: number;
  fuente: "matchcars" | "manual";
}

export interface TradeIn {
  incluye: boolean;
  marca: string;
  modelo: string;
  anio: number | null;
  km: number | null;
  estado: string;
  fotos: string[];
  tasacion: TradeInAppraisal | null;
  agregadoAlStock: boolean;
  vehiculoStockId: string | null;
}

export const EMPTY_TRADE_IN: TradeIn = {
  incluye: false,
  marca: "",
  modelo: "",
  anio: null,
  km: null,
  estado: "",
  fotos: [],
  tasacion: null,
  agregadoAlStock: false,
  vehiculoStockId: null,
};

export type SaleOperationStatus = "en_curso" | "completada" | "cancelada";

export interface SaleOperation {
  id: string;
  leadId: string;
  vehicleId: string | null;
  sellerId: string;
  buyerId: string | null;
  assignedTo: string | null;
  status: SaleOperationStatus;
  vehicleSnapshot?: { brand?: string; model?: string; year?: number; coverUrl?: string } | null;
  buyerLabel: string;
  checklist: ChecklistItem[];
  financiacion: FinancingCalc | null;
  parteDePago: TradeIn;
  createdAt: string | null;
  updatedAt: string | null;
}
