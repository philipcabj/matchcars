// portal/src/app/api/agency/profile/route.ts
// GET   -> campos públicos/de marca de la agencia (para el form de perfil).
// PATCH -> los actualiza en users/{agencyId}. Whitelist explícita de campos:
//          nunca se puede tocar plan/role/email desde acá, a propósito.
//
// El logo/banner se suben directo a Storage desde el cliente
// (logos|banners/{agencyId}_...), mismos paths que ya usa edit-profile.tsx
// de la app — no hizo falta tocar storage.rules (cae en la regla catch-all
// existente).
import { logActivity } from "@/lib/activity-log";
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_PERMISSIONS, canUseWatermark } from "@/lib/plans";
import { AgencyProfileFields } from "@/lib/agency-profile";

const STRING_FIELDS: (keyof AgencyProfileFields)[] = [
  "agencyName",
  "description",
  "phone",
  "whatsapp",
  "website",
  "instagram",
  "businessAddress",
  "province",
  "city",
  "businessHours",
  "logoUrl",
  "bannerUrl",
  "foundedYear",
];

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // sin acentos (marcas diacríticas tras NFD)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const { agencyId } = await resolveMembership(uid);
  const snap = await adminDb.doc(`users/${agencyId}`).get();
  if (!snap.exists) return Response.json({ error: "Agencia no encontrada" }, { status: 404 });
  const data = snap.data()!;

  const coords = data.businessCoordinates;
  const businessCoordinates =
    coords && typeof coords.latitude === "number" && typeof coords.longitude === "number"
      ? { latitude: coords.latitude, longitude: coords.longitude }
      : null;

  const profile: AgencyProfileFields = {
    agencyName: data.agencyName || "",
    description: data.description || "",
    phone: data.phone || "",
    whatsapp: data.whatsapp || "",
    website: data.website || "",
    instagram: data.instagram || "",
    businessAddress: data.businessAddress || data.address || "",
    province: data.province || "",
    city: data.city || "",
    businessHours: data.businessHours || "",
    logoUrl: data.logoUrl || "",
    bannerUrl: data.bannerUrl || "",
    slug: data.slug || "",
    foundedYear: data.foundedYear ? String(data.foundedYear) : "",
    brandSpecialties: Array.isArray(data.brandSpecialties) ? data.brandSpecialties : [],
    watermarkEnabled: !!data.watermarkEnabled,
    businessCoordinates,
  };

  return Response.json({ profile, canUseWatermark: canUseWatermark(data.plan || "free") });
});

export const PATCH = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageTeam) {
    return Response.json({ error: "Tu rol no tiene permiso para editar el perfil de la agencia." }, { status: 403 });
  }

  const body = await request.json();
  const update: Record<string, unknown> = {};
  for (const field of STRING_FIELDS) {
    if (typeof body[field] === "string") update[field] = body[field].trim();
  }
  if (body.businessCoordinates === null) {
    update.businessCoordinates = null;
  } else if (
    body.businessCoordinates &&
    typeof body.businessCoordinates.latitude === "number" &&
    typeof body.businessCoordinates.longitude === "number"
  ) {
    update.businessCoordinates = {
      latitude: body.businessCoordinates.latitude,
      longitude: body.businessCoordinates.longitude,
    };
  }
  if (Array.isArray(body.brandSpecialties)) {
    update.brandSpecialties = body.brandSpecialties.filter((b: unknown) => typeof b === "string" && b.trim()).map((b: string) => b.trim());
  }
  if (update.foundedYear !== undefined) {
    const year = Number(update.foundedYear);
    update.foundedYear = update.foundedYear && !Number.isNaN(year) ? year : null;
  }

  if (typeof body.slug === "string") {
    const slug = slugify(body.slug);
    if (slug) {
      const existing = await adminDb.collection("users").where("slug", "==", slug).limit(1).get();
      if (!existing.empty && existing.docs[0].id !== agencyId) {
        return Response.json({ error: "Ese link ya está en uso por otra agencia." }, { status: 409 });
      }
    }
    update.slug = slug || null;
  }

  // watermarkEnabled: nunca confiar en el cliente — igual que hace la Cloud
  // Function autoEnhancePhoto server-side. Requiere plan pago y logo cargado.
  if (typeof body.watermarkEnabled === "boolean") {
    const userSnap = await adminDb.doc(`users/${agencyId}`).get();
    const plan: string = userSnap.data()?.plan || "free";
    const logoUrl = typeof update.logoUrl === "string" ? update.logoUrl : userSnap.data()?.logoUrl;
    update.watermarkEnabled = body.watermarkEnabled && canUseWatermark(plan) && !!logoUrl;
  }

  await adminDb.doc(`users/${agencyId}`).set(update, { merge: true });

  if (Object.keys(update).length > 0) {
    await logActivity({
      agencyId,
      actorUid: uid,
      entityType: "profile",
      entityId: agencyId,
      summary: `Actualizó el perfil de la agencia: ${Object.keys(update).join(", ")}`,
    });
  }

  return Response.json({ ok: true });
});
