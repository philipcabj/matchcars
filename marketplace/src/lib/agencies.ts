// marketplace/src/lib/agencies.ts
// Directorio de agencias — mismo criterio que app/(screens)/agencias.tsx:
// users con cualquier plan pago, cantidad de autos activos, filtro por
// nombre/ciudad/provincia/marca, orden A-Z / rating / cantidad de autos.
// Ficha pública (getAgencyProfile) disponible para cualquier plan pago desde
// la reestructuración de planes — antes era exclusivo pro_dealer.
import "server-only";

import { adminDb } from "@/lib/firebase-admin";
import { getVehicleCountsByUser } from "@/lib/vehicles";
import { cache } from "react";

export interface Agency {
  id: string;
  slug: string | null;
  name: string;
  city: string;
  province: string;
  photoURL: string | null;
  rating: number;
  reviewCount: number;
  activeCars: number;
  brandSpecialties: string[];
  foundedYear: number | null;
  plan: string;
}

const PAID_PLANS = [
  "pro_monthly",
  "pro_annual",
  "pro_plus_monthly",
  "pro_plus_annual",
  "pro_dealer",
  "pro_dealer_monthly",
  "pro_dealer_annual",
];

// Jerarquía de planes — mismo criterio que getBoostScoreMultiplier en
// lib/planChecks.ts (raíz), portado acá porque ese archivo no es importable
// desde el marketplace (paquete separado). Determina el orden en
// getFeaturedAgencies (mayor plan primero) — no gatea nada, cualquier
// entrada de PAID_PLANS ya tiene ficha propia (ver getAgencyProfile).
const PLAN_RANK: Record<string, number> = {
  pro_dealer: 3,
  pro_dealer_monthly: 3,
  pro_dealer_annual: 3,
  pro_plus_monthly: 2,
  pro_plus_annual: 2,
  pro_monthly: 1,
  pro_annual: 1,
};

function planRank(plan: string): number {
  return PLAN_RANK[plan] ?? 0;
}

const fetchAgencies = cache(async (): Promise<Agency[]> => {
  const [snap, carCounts] = await Promise.all([
    adminDb.collection("users").where("plan", "in", PAID_PLANS).get(),
    getVehicleCountsByUser(),
  ]);

  return snap.docs.map((d) => {
    const data = d.data();
    const name =
      data.agencyName ||
      (data.firstName || data.lastName ? `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() : data.displayName || data.email || "Agencia");
    return {
      id: d.id,
      slug: data.slug || null,
      name,
      city: data.location?.city ?? data.city ?? "",
      province: data.location?.province ?? data.province ?? "",
      photoURL: data.photoURL || data.avatar || data.logoUrl || null,
      rating: typeof data.sellerRating === "number" ? data.sellerRating : 0,
      reviewCount: data.sellerReviewCount || 0,
      activeCars: carCounts[d.id] ?? 0,
      brandSpecialties: Array.isArray(data.brandSpecialties) ? data.brandSpecialties : [],
      foundedYear: data.foundedYear || null,
      plan: data.plan || "free",
    };
  });
});

export interface AgencyFilters {
  search?: string;
  province?: string;
  sort?: "name" | "rating" | "cars";
}

export async function listAgencies(filters: AgencyFilters = {}): Promise<{ agencies: Agency[]; provinces: string[] }> {
  let agencies = await fetchAgencies();
  const provinces = Array.from(new Set(agencies.map((a) => a.province).filter(Boolean))).sort();

  if (filters.search) {
    const q = filters.search.toLowerCase();
    agencies = agencies.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.city.toLowerCase().includes(q) ||
        a.province.toLowerCase().includes(q) ||
        a.brandSpecialties.some((b) => b.toLowerCase().includes(q))
    );
  }
  if (filters.province) agencies = agencies.filter((a) => a.province === filters.province);

  const sorted = [...agencies];
  switch (filters.sort) {
    case "rating":
      sorted.sort((a, b) => b.rating - a.rating);
      break;
    case "cars":
      sorted.sort((a, b) => b.activeCars - a.activeCars);
      break;
    default:
      sorted.sort((a, b) => a.name.localeCompare(b.name));
  }

  return { agencies: sorted, provinces };
}

// Mayor plan primero, y a igual plan, más autos publicados — no usa el
// mismo "sort" que el directorio general (que ordena por lo que elige el
// usuario ahí: nombre/rating/autos).
export async function getFeaturedAgencies(take = 8): Promise<Agency[]> {
  const agencies = await fetchAgencies();
  const sorted = [...agencies].sort((a, b) => planRank(b.plan) - planRank(a.plan) || b.activeCars - a.activeCars);
  return sorted.slice(0, take);
}

export interface AgencyProfile extends Agency {
  bannerUrl: string | null;
  description: string;
  businessAddress: string;
  businessHours: string;
  website: string;
  instagram: string;
  whatsapp: string;
  email: string;
  soldCount: number;
  businessCoordinates: { latitude: number; longitude: number } | null;
}

// Ficha propia de una agencia (matchcars.app/agencia/{slug}). El parámetro
// puede ser el slug elegido por la agencia o, si no tiene uno cargado, su
// uid directo — mismo criterio de fallback que ya usan AgencyCard y el
// bloque de vendedor de la ficha del auto (`slug || vehicle.userId`).
export async function getAgencyProfile(slugOrId: string): Promise<AgencyProfile | null> {
  const bySlug = await adminDb.collection("users").where("slug", "==", slugOrId).limit(1).get();
  const doc = !bySlug.empty ? bySlug.docs[0] : await adminDb.doc(`users/${slugOrId}`).get();
  if (!doc.exists) return null;

  const data = doc.data()!;
  const plan: string = data.plan || "free";
  if (planRank(plan) === 0) return null; // no es agencia (o plan no reconocido) — no tiene ficha propia

  const [carCounts, soldSnap] = await Promise.all([
    getVehicleCountsByUser(),
    adminDb.collection("vehicles").where("userId", "==", doc.id).where("status", "==", "sold").count().get(),
  ]);
  const name =
    data.agencyName ||
    (data.firstName || data.lastName ? `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() : data.displayName || data.email || "Agencia");
  const coords = data.businessCoordinates;
  const businessCoordinates =
    coords && typeof coords.latitude === "number" && typeof coords.longitude === "number"
      ? { latitude: coords.latitude, longitude: coords.longitude }
      : null;

  return {
    id: doc.id,
    slug: data.slug || null,
    name,
    city: data.location?.city ?? data.city ?? "",
    province: data.location?.province ?? data.province ?? "",
    photoURL: data.photoURL || data.avatar || data.logoUrl || null,
    rating: typeof data.sellerRating === "number" ? data.sellerRating : 0,
    reviewCount: data.sellerReviewCount || 0,
    activeCars: carCounts[doc.id] ?? 0,
    brandSpecialties: Array.isArray(data.brandSpecialties) ? data.brandSpecialties : [],
    foundedYear: data.foundedYear || null,
    plan,
    bannerUrl: data.bannerUrl || null,
    description: data.description || "",
    businessAddress: data.businessAddress || "",
    businessHours: data.businessHours || "",
    website: data.website || "",
    instagram: data.instagram || "",
    whatsapp: data.whatsapp || "",
    email: data.email || "",
    soldCount: soldSnap.data().count,
    businessCoordinates,
  };
}
