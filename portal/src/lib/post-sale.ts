// portal/src/lib/post-sale.ts
// Módulo B — Postventa. Las tareas las crea la Cloud Function onSaleConfirmed
// (functions/src/index.ts) al confirmarse una venta con comprador real; las
// de canal "auto" las dispara runPostSaleTasks (onSchedule); "recontacto" es
// manual a propósito, la agencia la marca hecha ella misma.
export type PostSaleTaskType = "encuesta" | "resena" | "service" | "recontacto";
export type PostSaleTaskStatus = "pendiente" | "enviada" | "hecha";

export const TASK_TYPE_LABELS: Record<PostSaleTaskType, string> = {
  encuesta: "Encuesta de satisfacción",
  resena: "Pedido de reseña",
  service: "Recordatorio de service",
  recontacto: "Recontacto comercial",
};

export const TASK_TYPE_ICONS: Record<PostSaleTaskType, string> = {
  encuesta: "📋",
  resena: "⭐",
  service: "🔧",
  recontacto: "📞",
};

export interface PostSaleTask {
  id: string;
  vehicleId: string;
  buyerId: string;
  buyerLabel: string;
  vehicleSnapshot: { brand?: string; model?: string; year?: number } | null;
  tipo: PostSaleTaskType;
  programadaPara: string | null;
  estado: PostSaleTaskStatus;
  canal: "auto" | "manual";
  sentAt: string | null;
  doneAt: string | null;
}
