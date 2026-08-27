// portal/src/lib/sale-operations.ts
// Módulo A — Operación de venta: checklist de trámites, financiación rápida
// (sin conexión a ninguna financiera) y parte de pago, agrupados en una sola
// entidad colgada de un lead. Ver saleOperations/{id} en Firestore.
import type { DocumentData } from "@/lib/pdf/SaleDocuments";
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

// Firma electrónica de Seña/Boleto (Módulo A) — solo estos dos pasos del
// checklist son firmables: son un acuerdo privado entre comprador y
// vendedor (Ley 25.506, firma electrónica simple). El resto de los pasos
// (Formulario 08, Verificación policial, Informe de dominio) son trámites
// ante organismos que exigen firma certificada o son inspecciones físicas —
// ningún sistema de firma electrónica los reemplaza, siguen siendo manuales.
export type SignableChecklistKey = "sena" | "boleto_compraventa";

export interface SignatureParty {
  name: string | null;
  signedAt: string | null;
  contactEmail: string | null; // solo comprador — el vendedor firma con su sesión, no por email
  ip: string | null;
  userAgent: string | null;
}

export type SignatureStatus = "pending_buyer" | "signed" | "voided";

export interface SignatureRequest {
  documentUrl: string; // PDF sin firmar (reusa la generación de document/route.tsx)
  finalDocumentUrl: string | null; // con el bloque de firmas, una vez completo
  status: SignatureStatus;
  createdAt: string;
  expiresAt: string;
  seller: SignatureParty;
  buyer: SignatureParty;
  // Solo para "sena" — hace falta guardarlo para poder re-renderizar el PDF
  // final (con el bloque de firmas) con exactamente el mismo contenido que
  // se mandó a firmar.
  monto?: number;
  montoCurrency?: "ARS" | "USD";
  // Snapshot congelado al enviar a firmar — el PDF final (al verificar el
  // código) se renderiza con ESTO, no con datos en vivo del auto/agencia. Si
  // no fuera así, un cambio de precio u otro dato entre "enviar a firmar" y
  // que el comprador confirme haría que termine firmando algo distinto de lo
  // que vio y aceptó.
  documentData: DocumentData;
}

// Documento que la agencia le pide subir al comprador (ej. "DNI frente y
// dorso") desde el portal público de la operación — libre, no atado a un
// paso fijo del checklist porque no todos los pedidos encajan en los 7
// pasos default.
export interface DocumentRequest {
  id: string;
  label: string;
  requestedAt: string;
  uploadedUrl: string | null;
  uploadedAt: string | null;
}

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
  // true una vez confirmada a propósito — misma idea que
  // parteDePago.precioTomaConfirmado, para que "Forma de pago" tenga un
  // cierre real y no quede para siempre como una elección que se puede tocar
  // sin querer.
  metodoPagoConfirmado: boolean;
  // Token del portal público del comprador (portal.matchcars.app/mi-operacion/{token})
  // — se genera una sola vez al crear la operación, sin importar si el
  // comprador tiene cuenta en MatchCars o no (ver leads/[id]/operation/route.ts).
  buyerAccessToken: string;
  // Resuelto una sola vez al crear la operación (cuenta o manualContact) y
  // reusado para mandar el código de firma — sin esto, "Enviar a firmar"
  // quedaría deshabilitado por siempre para leads manuales sin recotejar.
  buyerContactEmail: string | null;
  signatures: Partial<Record<SignableChecklistKey, SignatureRequest>>;
  documentRequests: DocumentRequest[];
  // Datos en vivo (no guardados en el doc de la operación) para el
  // SaleJourney — ver comentario en el GET de sale-operations/[id]/route.ts.
  leadStatus: string | null;
  vehicleStatus: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
