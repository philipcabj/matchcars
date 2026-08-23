// marketplace/src/lib/vehicles.ts
// Data layer de solo lectura para el feed y la ficha de auto. Fase 1 no tiene
// ninguna ruta de escritura.
//
// Estrategia de query — a propósito simple: igual que app/(tabs)/index.tsx
// (que tampoco usa `orderBy` en la query de Firestore, solo `where("published",
// "==", true)` + límite, y ordena/filtra todo client-side), acá se trae un
// lote de vehículos publicados con una sola condición de igualdad — sin
// `orderBy` ni filtros combinados — y el resto (marca/modelo/precio/año/km/
// combustible/provincia + orden) se resuelve en memoria en el servidor. Así
// no hace falta crear ningún índice compuesto nuevo en el Firestore de
// producción para esta fase de evaluación.
import "server-only";

import { adminDb } from "@/lib/firebase-admin";
import { cache } from "react";

export interface PublicVehicle {
  id: string;
  brand: string;
  model: string;
  version: string;
  year: number | null;
  price: number;
  currency: string;
  km: number;
  fuelType: string;
  gearbox: string;
  description: string;
  province: string;
  city: string;
  coverImage: string;
  gallery: string[];
  video: string;
  features: string[];
  acceptsTradeIn: boolean;
  acceptsFinancing: boolean;
  negotiablePrice: boolean;
  immediateDelivery: boolean;
  singleOwner: boolean;
  serviceRecords: boolean;
  vtvValid: boolean;
  papersUpToDate: boolean;
  warranty: boolean;
  priceHistory: { price: number; currency: string; changedAt: string | null }[];
  userId: string;
  userName: string;
  sellerTrustLevel: string;
  sellerRating: number;
  sellerReviewCount: number;
  // Se completan aparte (enrichWithSellerInfo) — no están denormalizados en
  // el propio doc del vehículo, hay que leer users/{userId}.
  sellerIsDealer: boolean;
  sellerLogoUrl: string | null;
  isFeatured: boolean;
  views: number;
  likesCount: number;
  createdAt: string | null;
  // Código corto de publicación (#4821, asignado por assignPublicationCode
  // en functions/src/index.ts) — autos viejos sin backfill pueden no tenerlo.
  publicationCode: number | null;
  // Ficha técnica ampliada (paridad con la app, types/vehicle.ts).
  engine: string;
  wheelType: string;
  airbags: string;
  windowsAuto: string;
  operationType: string;
  sellingReason: string;
  history: { year?: string; title?: string; note?: string }[];
  financing: { downPayment?: number; type?: string; entity?: string; monthlyPayment?: number; rate?: number; months?: number } | null;
}

// FETCH_BATCH_SIZE: tamaño del lote que se trae de Firestore para filtrar/
// ordenar en memoria (ver nota de estrategia arriba). Suficiente para el
// volumen de inventario actual — si crece mucho más, esta fase debería pasar
// a paginación real con `orderBy`+índices compuestos.
const FETCH_BATCH_SIZE = 500;
const PAGE_SIZE = 24;

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

function mapVehicleDoc(id: string, data: FirebaseFirestore.DocumentData): PublicVehicle {
  return {
    id,
    brand: data.brand ?? "",
    model: data.model ?? "",
    version: data.version ?? "",
    year: data.year ?? null,
    price: data.price ?? 0,
    currency: data.currency ?? "ARS",
    km: data.km ?? 0,
    fuelType: data.fuelType ?? "",
    gearbox: data.gearbox ?? "",
    description: data.description ?? "",
    province: data.location?.province ?? data.province ?? "",
    city: data.location?.city ?? data.city ?? "",
    coverImage: data.images?.cover ?? data.coverImage ?? data.cover ?? "",
    gallery: data.images?.gallery ?? data.additionalImages ?? [],
    video: data.video ?? "",
    features: Array.isArray(data.features) ? data.features : [],
    acceptsTradeIn: !!(data.flags?.tradeIn ?? data.acceptsTradeIn ?? data.tradeIn),
    acceptsFinancing: !!data.acceptsFinancing,
    negotiablePrice: !!data.negotiablePrice,
    immediateDelivery: !!data.immediateDelivery,
    singleOwner: !!data.singleOwner,
    serviceRecords: !!data.serviceRecords,
    vtvValid: !!data.vtvValid,
    papersUpToDate: !!data.papersUpToDate,
    warranty: !!data.warranty,
    publicationCode: typeof data.publicationCode === "number" ? data.publicationCode : null,
    priceHistory: Array.isArray(data.priceHistory)
      ? data.priceHistory.map((h: { price: number; currency: string; changedAt?: unknown }) => ({
          price: h.price,
          currency: h.currency,
          changedAt: toIso(h.changedAt),
        }))
      : [],
    userId: data.userId ?? "",
    userName: data.userName ?? "",
    sellerTrustLevel: data.sellerTrustLevel ?? "new",
    sellerRating: data.sellerRating ?? 0,
    sellerReviewCount: data.sellerReviewCount ?? 0,
    sellerIsDealer: false,
    sellerLogoUrl: null,
    isFeatured: !!data.isFeatured,
    views: data.views ?? 0,
    likesCount: data.likesCount ?? 0,
    createdAt: toIso(data.createdAt),
    engine: data.engine ?? "",
    wheelType: data.wheelType ?? "",
    airbags: data.airbags != null ? String(data.airbags) : "",
    windowsAuto: data.windowsAuto != null ? String(data.windowsAuto) : "",
    operationType: data.operationType ?? "sale",
    sellingReason: data.sellingReason ?? "",
    history: Array.isArray(data.history) ? data.history : [],
    financing: data.financing
      ? {
          downPayment: data.financing.downPayment,
          type: data.financing.type,
          entity: data.financing.entity,
          monthlyPayment: data.financing.monthlyPayment,
          rate: data.financing.rate,
          months: data.financing.months,
        }
      : null,
  };
}

export interface VehicleFilters {
  brand?: string;
  model?: string;
  province?: string;
  fuelType?: string;
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  financing?: boolean;
  tradeIn?: boolean;
  page?: number;
}

export interface VehicleListResult {
  vehicles: PublicVehicle[];
  total: number;
  page: number;
  totalPages: number;
}

// cache(): dedupea Firestore reads dentro del mismo render — listVehicles y
// getFilterOptions suelen pedirse juntos en la misma página (el feed).
const fetchPublishedVehicles = cache(async (): Promise<PublicVehicle[]> => {
  const snap = await adminDb.collection("vehicles").where("published", "==", true).limit(FETCH_BATCH_SIZE).get();
  return snap.docs.map((d) => mapVehicleDoc(d.id, d.data())).filter((v) => v.price > 0 && v.brand);
});

// isDealer/logo del vendedor no están denormalizados en el doc del vehículo
// (a diferencia de sellerRating/sellerTrustLevel) — hay que leer users/**.
// Se hace con un solo getAll() por página (no 1 query por auto) para no
// disparar N lecturas en una grilla de 24 autos.
async function enrichWithSellerInfo(vehicles: PublicVehicle[]): Promise<PublicVehicle[]> {
  const userIds = Array.from(new Set(vehicles.map((v) => v.userId).filter(Boolean)));
  if (userIds.length === 0) return vehicles;

  const refs = userIds.map((uid) => adminDb.doc(`users/${uid}`));
  const snaps = await adminDb.getAll(...refs);
  const infoByUid = new Map<string, { isDealer: boolean; logoUrl: string | null }>();
  snaps.forEach((snap, i) => {
    if (!snap.exists) return;
    const data = snap.data()!;
    const plan: string = data.plan || "free";
    // isDealer = "tiene ficha pública de agencia" (cualquier plan pago desde
    // la reestructuración de planes), no literalmente "es plan Dealer".
    infoByUid.set(userIds[i], { isDealer: plan !== "free", logoUrl: data.logoUrl || data.avatarUrl || null });
  });

  return vehicles.map((v) => {
    const info = infoByUid.get(v.userId);
    return info ? { ...v, sellerIsDealer: info.isDealer, sellerLogoUrl: info.logoUrl } : v;
  });
}

export async function listVehicles(filters: VehicleFilters = {}): Promise<VehicleListResult> {
  let vehicles = await fetchPublishedVehicles();

  if (filters.brand) vehicles = vehicles.filter((v) => v.brand === filters.brand);
  if (filters.model) vehicles = vehicles.filter((v) => v.model === filters.model);
  if (filters.province) vehicles = vehicles.filter((v) => v.province === filters.province);
  if (filters.fuelType) vehicles = vehicles.filter((v) => v.fuelType === filters.fuelType);
  if (filters.minPrice) vehicles = vehicles.filter((v) => v.price >= filters.minPrice!);
  if (filters.maxPrice) vehicles = vehicles.filter((v) => v.price <= filters.maxPrice!);
  if (filters.minYear) vehicles = vehicles.filter((v) => (v.year ?? 0) >= filters.minYear!);
  if (filters.maxYear) vehicles = vehicles.filter((v) => (v.year ?? 0) <= filters.maxYear!);
  if (filters.financing) vehicles = vehicles.filter((v) => v.acceptsFinancing);
  if (filters.tradeIn) vehicles = vehicles.filter((v) => v.acceptsTradeIn);

  vehicles.sort((a, b) => {
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });

  const total = vehicles.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const pageVehicles = await enrichWithSellerInfo(vehicles.slice(start, start + PAGE_SIZE));

  return { vehicles: pageVehicles, total, page, totalPages };
}

// Todos los vehículos publicados, sin paginar — para el sitemap.
export async function listAllVehicleIds(): Promise<{ id: string; createdAt: string | null }[]> {
  const vehicles = await fetchPublishedVehicles();
  return vehicles.map((v) => ({ id: v.id, createdAt: v.createdAt }));
}

export async function getVehicle(id: string): Promise<PublicVehicle | null> {
  const snap = await adminDb.doc(`vehicles/${id}`).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (!data.published || data.status === "sold" || data.status === "deleted") return null;
  return mapVehicleDoc(snap.id, data);
}

// Para /comparar — trae vehículos puntuales por id, preservando el orden
// en que se pasaron (así el usuario ve las columnas en el orden que las eligió).
export async function getVehiclesByIds(ids: string[]): Promise<PublicVehicle[]> {
  const unique = Array.from(new Set(ids)).slice(0, 4); // hasta 4 autos a la vez
  if (unique.length === 0) return [];
  const snaps = await Promise.all(unique.map((id) => adminDb.doc(`vehicles/${id}`).get()));
  const byId = new Map(
    snaps.filter((s) => s.exists && s.data()?.published).map((s) => [s.id, mapVehicleDoc(s.id, s.data()!)])
  );
  return unique.map((id) => byId.get(id)).filter((v): v is PublicVehicle => !!v);
}

export interface Review {
  id: string;
  reviewerName: string;
  rating: number;
  comment: string;
  createdAt: string | null;
}

// Lectura best-effort — firestore.rules: reviews allow read: if true, pero el
// shape exacto del documento no está 100% confirmado desde acá, así que se
// lee de forma defensiva (nunca tira si faltan campos).
export async function getSellerReviews(sellerId: string, take = 5): Promise<Review[]> {
  if (!sellerId) return [];
  try {
    const snap = await adminDb.collection("reviews").where("sellerId", "==", sellerId).limit(take).get();
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        reviewerName: data.reviewerName || data.buyerName || "Comprador",
        rating: Number(data.rating) || 0,
        comment: data.comment || data.review || "",
        createdAt: toIso(data.createdAt),
      };
    });
  } catch {
    return [];
  }
}

export async function getSimilarVehicles(vehicle: PublicVehicle, take = 4): Promise<PublicVehicle[]> {
  const snap = await adminDb
    .collection("vehicles")
    .where("published", "==", true)
    .where("brand", "==", vehicle.brand)
    .limit(take + 1)
    .get();
  const similar = snap.docs
    .map((d) => mapVehicleDoc(d.id, d.data()))
    .filter((v) => v.id !== vehicle.id)
    .slice(0, take);
  return enrichWithSellerInfo(similar);
}

export interface SellerProfile {
  displayName: string;
  avatarUrl: string | null;
  plan: string;
  isDealer: boolean;
  whatsapp: string;
  email: string;
  slug: string | null;
}

export async function getSellerProfile(userId: string): Promise<SellerProfile | null> {
  if (!userId) return null;
  const snap = await adminDb.doc(`users/${userId}`).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  const plan: string = data.plan || "free";
  return {
    displayName: data.agencyName || data.displayName || "Vendedor",
    avatarUrl: data.avatarUrl || data.logoUrl || null,
    plan,
    isDealer: plan !== "free",
    whatsapp: data.whatsapp || "",
    email: data.email || "",
    slug: data.slug || null,
  };
}

export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  description: string;
  rating: number;
  reviewCount: number;
  isDealer: boolean;
  slug: string | null;
  whatsapp: string;
  email: string;
}

// Perfil público de un vendedor particular (matchcars.app/user-profile/{uid}).
// Si resulta ser una agencia (isDealer), la página redirige a /agencia/{slug}
// — esta función igual expone isDealer/slug para que la página pueda hacerlo.
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!uid) return null;
  const snap = await adminDb.doc(`users/${uid}`).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  const plan: string = data.plan || "free";
  const displayName =
    data.displayName ||
    (data.firstName || data.lastName ? `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() : "") ||
    data.email ||
    "Usuario";

  return {
    id: snap.id,
    displayName,
    avatarUrl: data.avatarUrl || data.photoURL || null,
    description: data.description || "",
    rating: typeof data.sellerRating === "number" ? data.sellerRating : 0,
    reviewCount: data.sellerReviewCount || 0,
    isDealer: plan !== "free",
    slug: data.slug || null,
    whatsapp: data.whatsapp || "",
    email: data.email || "",
  };
}

// Stock completo de un vendedor puntual — para la ficha de agencia. Ya se
// sabe de antemano si es agencia y cuál es su logo, así que se pisan esos
// campos acá en vez de pagar otro getAll() vía enrichWithSellerInfo.
export async function getVehiclesBySeller(userId: string, sellerIsDealer: boolean, sellerLogoUrl: string | null): Promise<PublicVehicle[]> {
  const vehicles = await fetchPublishedVehicles();
  return vehicles.filter((v) => v.userId === userId).map((v) => ({ ...v, sellerIsDealer, sellerLogoUrl }));
}

// Autos vendidos de un vendedor — para la tab "Vendidos" de la ficha de
// agencia. Consulta aparte (no viene en fetchPublishedVehicles, que solo
// trae `published == true`): mismo criterio de status que ya usa
// getAgencyProfile para el conteo (`soldCount`), pero acá trayendo los docs
// completos en vez de solo el count().
export async function getSoldVehiclesBySeller(
  userId: string,
  sellerIsDealer: boolean,
  sellerLogoUrl: string | null
): Promise<PublicVehicle[]> {
  const snap = await adminDb.collection("vehicles").where("userId", "==", userId).where("status", "==", "sold").limit(60).get();
  return snap.docs.map((d) => ({ ...mapVehicleDoc(d.id, d.data()), sellerIsDealer, sellerLogoUrl }));
}

// Cantidad de autos publicados por vendedor — para el directorio de agencias.
// Reusa el mismo lote cacheado (fetchPublishedVehicles) en vez de una query
// por agencia.
export async function getVehicleCountsByUser(): Promise<Record<string, number>> {
  const vehicles = await fetchPublishedVehicles();
  const counts: Record<string, number> = {};
  for (const v of vehicles) {
    if (!v.userId) continue;
    counts[v.userId] = (counts[v.userId] ?? 0) + 1;
  }
  return counts;
}

export async function getFilterOptions(): Promise<{ brands: string[]; provinces: string[] }> {
  const vehicles = await fetchPublishedVehicles();
  const brands = Array.from(new Set(vehicles.map((v) => v.brand).filter(Boolean))).sort();
  const provinces = Array.from(new Set(vehicles.map((v) => v.province).filter(Boolean))).sort();
  return { brands, provinces };
}

// Para el widget "Autos destacados" del sidebar — reusa el mismo lote
// cacheado, no depende de los filtros de búsqueda actuales.
export async function getFeaturedVehicles(take = 4): Promise<PublicVehicle[]> {
  const vehicles = await fetchPublishedVehicles();
  return vehicles
    .filter((v) => v.isFeatured)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, take);
}

export interface PopularBrand {
  brand: string;
  count: number;
}

// Para el widget "Marcas populares" del sidebar — las marcas con más stock
// publicado, sin depender de los filtros de búsqueda actuales.
export async function getPopularBrands(take = 8): Promise<PopularBrand[]> {
  const vehicles = await fetchPublishedVehicles();
  const counts = new Map<string, number>();
  for (const v of vehicles) {
    if (!v.brand) continue;
    counts.set(v.brand, (counts.get(v.brand) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, take);
}
