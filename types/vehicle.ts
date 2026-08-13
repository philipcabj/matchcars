// types/vehicle.ts

export interface Vehicle {
  id: string;

  // Datos básicos
  brand?: string;
  model?: string;
  year?: number | string;
  version?: string;
  title?: string;

  // Precio
  price?: number;
  currency?: string;

  // Imágenes
  coverImage?: string;
  cover?: string; // Legacy flat field, superseded by coverImage/images.cover
  additionalImages?: string[];
  video?: string; // Video Walkaround URL

  // Ubicación (igual filosofía que MatchProp)
  city?: string;
  province?: string;
  location?: {
    latitude?: number;
    longitude?: number;
    address?: string;
    city?: string;
    province?: string;
  };
  parsedLocation?: {
    locality?: string;
    city?: string;
    province?: string;
  };

  // Datos del auto
  km?: number;
  fuelType?: string;
  gearbox?: string;
  transmission?: string; // Legacy alias for gearbox
  engine?: string;
  wheelType?: string;
  airbags?: number | string | null;
  windowsAuto?: number | string | null;

  // Operación
  operationType?: "sale" | "swap"; // venta / permuta
  acceptsTradeIn?: boolean; // Acepta permuta
  tradeIn?: boolean; // Alias para permuta (legacy/compatibility)
  acceptsFinancing?: boolean;
  financing?: {
    // Legacy fields (kept for backward compat)
    rate?: number;
    months?: number;
    initialPercent?: number;
    // New fields from financing module
    downPayment?: number;          // monto fijo de anticipo
    type?: "propio" | "banco" | "sin_interes"; // tipo de financiación
    entity?: string;               // entidad (ej: "Banco Nación")
    monthlyPayment?: number;       // cuota mensual calculada
  };
  negotiablePrice?: boolean; // Precio conversable
  immediateDelivery?: boolean; // Entrega inmediata
  sellingReason?: string; // Motivo de venta
  flags?: { forSale?: boolean; tradeIn?: boolean };

  // Historial y Documentación
  originalPrice?: number; // Precio original para calcular rebajas
  priceHistory?: { price: number; currency: string; changedAt: any }[];
  updatedAt?: any; // Última actualización
  singleOwner?: boolean;
  serviceRecords?: boolean;
  vtvValid?: boolean;
  papersUpToDate?: boolean;
  warranty?: boolean;

  // Extras
  features?: string[];
  history?: { year?: string; title?: string; note?: string }[];

  description?: string;

  // Usuario dueño
  userId?: string;
  userName?: string;
  userPlan?: string;
  sellerTrustLevel?: "new" | "active" | "verified"; // Denormalized
  sellerRating?: number; // Denormalized 1-5
  sellerReviewCount?: number; // Denormalized
  createdAt?: any;

  // Publicación
  published?: boolean;
  status?: "available" | "reserved" | "sold" | "pending" | "pending_review" | "blocked" | "rejected" | "rejected_limit" | "deleted" | "flagged";
  rejectionReason?: string;
  rejectedReason?: string;
  isFeatured?: boolean;
  featuredAt?: any;
  riskFlags?: string[];
  riskScore?: number;
  // Código corto de publicación (#4821) — asignado por la Cloud Function
  // assignPublicationCode al crear el auto, no editable a mano.
  publicationCode?: number;
  // Métricas
  views?: number;
  likesCount?: number;
  likedBy?: string[];
  offerCount?: number;
}
