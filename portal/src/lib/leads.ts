// portal/src/lib/leads.ts
// Tipos compartidos para el CRM de leads del portal — espejo simplificado de
// types/commerce.ts (Lead) de la raíz, solo los campos que este endpoint/UI usa.
export type LeadStatus = "new" | "contacted" | "negotiation" | "won" | "lost";

export const LEAD_STATUS_ORDER: LeadStatus[] = ["new", "contacted", "negotiation", "won", "lost"];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  negotiation: "En negociación",
  won: "Vendido",
  lost: "Perdido",
};

// Mismo hue por etapa que los chips de estado en /dashboard/leads (STATUS_COLORS),
// versión sólida para barras/gráficos — la identidad de cada etapa siempre es el
// mismo color en todo el portal.
export const LEAD_STAGE_BAR_COLOR: Record<LeadStatus, string> = {
  new: "bg-blue-500",
  contacted: "bg-amber-500",
  negotiation: "bg-cyan-500",
  won: "bg-success",
  lost: "bg-error",
};

export type ManualContactSource = "whatsapp" | "instagram" | "phone" | "in_person" | "other";

export const MANUAL_CONTACT_SOURCE_LABELS: Record<ManualContactSource, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  phone: "Teléfono",
  in_person: "Presencial",
  other: "Otro",
};

export interface ManualContact {
  name: string;
  phone?: string;
  email?: string;
  instagramHandle?: string;
  notes?: string;
  contactSource?: ManualContactSource;
}

// "web" = entró por el formulario "Consultar" del marketplace público
// (marketplace/src/lib/leads-server.ts). El resto son los de la app.
export type LeadOrigin = "web" | string;

export interface LeadListItem {
  id: string;
  status: LeadStatus;
  vehicleSnapshot?: { brand?: string; model?: string; year?: number; price?: number; currency?: string; coverUrl?: string };
  buyerSnapshot?: { firstName?: string; lastName?: string; initials?: string; avatarColor?: string };
  // Presente solo en leads cargados a mano desde el portal (llamada, local,
  // WhatsApp fuera de la app) o entrantes de la web ("Consultar").
  manualContact?: ManualContact;
  source?: LeadOrigin;
  webLead?: { message?: string; origin?: string } | null;
  lastMessage?: string;
  lastMessageAt?: string | null;
  unreadCount?: number;
  dealPrice?: number;
  dealCurrency?: string;
  createdAt?: string | null;
  // uid de un miembro del equipo (o null = sin asignar) — para agencias con
  // varios vendedores, saber quién sigue cada lead.
  assignedTo?: string | null;
}

// Estado de una oferta formal (types/commerce.ts OfferSummary en la raíz) —
// solo los campos que el panel de oferta del portal necesita mostrar/actuar.
export type OfferStatus = "pending" | "accepted" | "rejected" | "countered" | "expired" | "withdrawn";

export interface PortalOffer {
  id: string;
  amount: number;
  currency: string;
  status: OfferStatus;
  includesTradeIn?: boolean;
  includesFinancing?: boolean;
  financingNote?: string;
  note?: string;
  counterAmount?: number;
  counterCurrency?: string;
  counterNote?: string;
}

export interface LeadDetail {
  id: string;
  status: LeadStatus;
  conversationId: string;
  vehicleId?: string | null;
  buyerId?: string | null;
  vehicleStatus?: string | null;
  vehicleSnapshot?: LeadListItem["vehicleSnapshot"];
  buyerSnapshot?: LeadListItem["buyerSnapshot"];
  manualContact?: ManualContact;
  source?: LeadOrigin;
  webLead?: { message?: string; origin?: string } | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  dealPrice?: number | null;
  dealCurrency?: string | null;
  reasonLost?: string | null;
  offer?: PortalOffer | null;
  createdAt?: string | null;
  assignedTo?: string | null;
  saleOperationId?: string | null;
  deliveryConfirmToken?: string | null;
  saleHasCommission?: boolean | null;
  deletedAt?: string | null;
  deletedReason?: string | null;
  activity?: LeadActivityEvent[];
}

export interface CreateManualLeadInput {
  name: string;
  phone?: string;
  email?: string;
  instagramHandle?: string;
  notes?: string;
  vehicleId?: string;
  contactSource: ManualContactSource;
}

// Evento del registro de actividad (activity-log.ts) filtrado a este lead —
// mismo shape que devuelve GET /api/agency/activity, sin entityType/entityId
// porque acá ya vienen filtrados a un solo lead.
export interface LeadActivityEvent {
  id: string;
  actorName: string;
  summary: string;
  createdAt: string | null;
}

export interface LeadStats {
  total: number;
  newCount: number;
  contactedCount: number;
  negotiationCount: number;
  wonCount: number;
  lostCount: number;
  conversionRate: number;
  arsTotal: number;
  usdTotal: number;
  // Comparación mes actual vs. anterior — a diferencia de vistas/likes (que
  // son un total corriente sin historial), leads y ventas sí tienen
  // createdAt/wonAt reales, así que esta comparación no inventa datos.
  leadsThisMonth: number;
  leadsLastMonth: number;
  salesThisMonth: number;
  salesLastMonth: number;
}

export interface SalesByMonth {
  month: string; // "2026-08"
  count: number;
  ars: number;
  usd: number;
}

// Mensaje de la conversación real (app) ligada a un lead orgánico. Mismo shape
// que conversations/{id}/messages en Firestore ({ senderId, text, createdAt }).
export interface LeadMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: string | null;
  isAgency: boolean;
}
