export type TrustLevel = "new" | "active" | "verified";

export interface SaleRecord {
  id: string;
  vehicleId: string;
  sellerId: string;
  buyerId?: string;
  buyerName?: string;
  sellerName?: string;
  finalPrice: number;
  currency: "ARS" | "USD";
  soldAt: any;
  source: "matchcars" | "external";
  rating?: number;
  review?: string;
  vehicleSnapshot?: {
    brand: string;
    model: string;
    year: number;
    coverImage?: string;
  };
}

export type LeadStatus = "new" | "contacted" | "negotiation" | "won" | "lost";

export type OfferStatus = "pending" | "accepted" | "rejected" | "countered" | "expired" | "withdrawn";

export interface OfferSummary {
  id: string;
  amount: number;
  currency: "ARS" | "USD";
  status: OfferStatus;
  includesTradeIn: boolean;
  includesFinancing: boolean;
  financingNote?: string;
  note?: string;
  counterAmount?: number;
  counterCurrency?: "ARS" | "USD";
  counterNote?: string;
  createdAt: any;
  expiresAt?: any;
}

export interface Offer extends OfferSummary {
  tradeInDescription?: string;
  leadId: string;
  conversationId: string;
  vehicleId: string;
  sellerId: string;
  buyerId: string;
  updatedAt: any;
  resolvedAt?: any;
  vehicleSnapshot?: {
    brand: string;
    model: string;
    year?: number;
    price?: number;
    currency?: "ARS" | "USD";
  };
  buyerSnapshot?: {
    firstName?: string;
    lastName?: string;
    initials?: string;
    avatarColor?: string;
  };
}

export type LeadSource = "search" | "favorite" | "share" | "alert" | "whatsapp" | "phone" | "in_person" | "other";

export interface Lead {
  sellerId: string;
  buyerId: string;
  vehicleId: string;
  conversationId: string;
  status: LeadStatus;
  reasonLost?: string;
  createdAt: any;
  lastMessageAt: any;
  lastSellerReplyAt?: any;
  nextFollowUpAt?: any;
  unreadCount: number;
  lastSenderId: string;
  messageCount?: number;
  lastMessage?: string;
  estimatedValue?: number;
  currency?: "ARS" | "USD";
  source?: LeadSource;
  vehicleSnapshot?: {
    brand: string;
    model: string;
    year?: number;
    price?: number;
    currency?: "ARS" | "USD";
    coverUrl?: string;
  };
  buyerSnapshot?: {
    firstName?: string;
    lastName?: string;
    initials?: string;
    avatarColor?: string;
  };
  contactedAt?: any;
  negotiationAt?: any;
  wonAt?: any;
  lostAt?: any;
  dealPrice?: number;
  dealCurrency?: "ARS" | "USD";
  offer?: OfferSummary;
}
