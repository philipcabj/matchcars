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
  precioTotal: number; // se guarda para poder reabrir y modificar el cálculo — antes solo quedaba montoFinanciado (ya restado el anticipo), y el campo volvía a aparecer vacío al reabrir
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

// "matchcars" = calculado con publicaciones similares (analyzeMarketPrice);
// "manual" ya no significa "no hay dato" — significa que la agencia lo
// escribió a mano (con o sin datos de MatchCars) o que MatchCars no
// encontró suficientes publicaciones similares para tasar solo.
export interface TradeInAppraisal {
  min: number;
  avg: number;
  max: number;
  fuente: "matchcars" | "manual";
}

export type TradeInCondition = "excelente" | "bueno" | "regular";

export const TRADE_IN_CONDITION_LABELS: Record<TradeInCondition, string> = {
  excelente: "Excelente",
  bueno: "Bueno",
  regular: "Regular",
};

// Descuento sobre el valor de venta estimado (tasacion.avg) para llegar a un
// precio de toma con margen de reventa — la agencia no puede pagar lo mismo
// que después va a pedir, necesita margen para volver a publicarlo. Base
// 5-10% según lo pedido, con un ajuste extra por estado: cuanto peor el
// estado, más margen hace falta (más gasto de puesta a punto antes de
// revender). Son valores de referencia editables desde el precio final, no
// una regla fija.
export const TRADE_IN_CONDITION_DISCOUNT: Record<TradeInCondition, number> = {
  excelente: 0.05,
  bueno: 0.08,
  regular: 0.12,
};

export function suggestTradeInPrice(valorVenta: number, condicion: TradeInCondition | ""): number {
  if (!valorVenta || !condicion) return 0;
  return Math.round(valorVenta * (1 - TRADE_IN_CONDITION_DISCOUNT[condicion]));
}

export interface TradeIn {
  incluye: boolean;
  marca: string;
  modelo: string;
  version: string;
  anio: number | null;
  km: number | null;
  estado: TradeInCondition | "";
  fotos: string[];
  // Valor de venta estimado (lo que MatchCars/la agencia cree que se puede
  // revender) — NO es el precio de toma, ver precioTomaFinal.
  tasacion: TradeInAppraisal | null;
  // Precio final acordado para tomar el usado — puede partir de
  // suggestTradeInPrice(tasacion.avg, estado) o cargarse a mano si
  // MatchCars no pudo tasar (tasacion null) o la agencia prefiere otro número.
  precioTomaFinal: number | null;
  // true una vez que alguien confirma precioTomaFinal a propósito (con
  // diálogo de "¿estás seguro?" — cierra el valor del auto que se recibe).
  // Antes de confirmar, el número es editable libremente sin fricción.
  precioTomaConfirmado: boolean;
  // uid de quién hizo/confirmó la tasación — antes nadie quedaba registrado.
  tasadoPor: string | null;
  agregadoAlStock: boolean;
  vehiculoStockId: string | null;
}

export const EMPTY_TRADE_IN: TradeIn = {
  incluye: false,
  marca: "",
  modelo: "",
  version: "",
  anio: null,
  km: null,
  estado: "",
  fotos: [],
  tasacion: null,
  precioTomaFinal: null,
  precioTomaConfirmado: false,
  tasadoPor: null,
  agregadoAlStock: false,
  vehiculoStockId: null,
};

export type SaleOperationStatus = "en_curso" | "completada" | "cancelada";

// Cómo se cubre el saldo (o el precio total si no hay parte de pago) — antes
// esto había que deducirlo mirando si había datos cargados en Financiación
// y/o Parte de pago por separado, sin ninguna pregunta explícita que atara
// las dos cosas a una sola decisión ("¿cómo se paga esta venta?").
// "financiado_propio" usa la calculadora de Financiación (cuota fija, tasa
// que carga la agencia); "financiado_externo" es una financiera o crédito
// privado ajeno a MatchCars — no hay cuota que calcular, solo se deja
// constancia de con quién financia el comprador.
export type MetodoPagoResto = "efectivo" | "financiado_propio" | "financiado_externo";

export interface SaleOperation {
  id: string;
  leadId: string;
  vehicleId: string | null;
  sellerId: string;
  buyerId: string | null;
  assignedTo: string | null;
  status: SaleOperationStatus;
  vehicleSnapshot?: { brand?: string; model?: string; year?: number; coverUrl?: string; price?: number; currency?: string } | null;
  buyerLabel: string;
  checklist: ChecklistItem[];
  financiacion: FinancingCalc | null;
  parteDePago: TradeIn;
  metodoPago: MetodoPagoResto | null;
  financieraNombre: string | null;
  // Datos en vivo (no guardados en el doc de la operación) para el
  // SaleJourney — ver comentario en el GET de sale-operations/[id]/route.ts.
  leadStatus: string | null;
  vehicleStatus: string | null;
  tradeInVehicleStatus: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
