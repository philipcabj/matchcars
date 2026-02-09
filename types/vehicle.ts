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

  // Operación
  operationType?: "sale" | "swap"; // venta / permuta
  acceptsTradeIn?: boolean; // Acepta permuta
  tradeIn?: boolean; // Alias para permuta (legacy/compatibility)
  acceptsFinancing?: boolean;
  financing?: {
    rate?: number;
    months?: number;
  };
  negotiablePrice?: boolean; // Precio conversable
  immediateDelivery?: boolean; // Entrega inmediata
  sellingReason?: string; // Motivo de venta

  // Historial y Documentación
  originalPrice?: number; // Precio original para calcular rebajas
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
  status?: "available" | "reserved" | "sold" | "pending" | "blocked" | "rejected" | "deleted"; // Estado de la publicación
  rejectionReason?: string;
  isFeatured?: boolean;
  featuredAt?: any; // Timestamp of when it was featured
  
  // Métricas
  views?: number;
  likesCount?: number;
}
