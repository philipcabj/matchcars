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
  acceptsFinancing?: boolean;
  financing?: {
    rate?: number;
    months?: number;
  };

  // Extras
  features?: string[];
  history?: { year?: string; title?: string; note?: string }[];

  description?: string;

  // Usuario dueño
  userId?: string;
  userName?: string;
  createdAt?: any;

  // Publicación
  published?: boolean;
}
