// portal/src/app/api/agency/profile/route.ts
// GET   -> campos públicos/de marca de la agencia (para el form de perfil).
// PATCH -> los actualiza en users/{agencyId}. Whitelist explícita de campos:
//          nunca se puede tocar plan/role/email desde acá, a propósito.
//
// El logo se sube directo a Storage desde el cliente (logos/{agencyId}_...),
// mismo path que ya usa edit-profile.tsx de la app — no hizo falta tocar
// storage.rules (cae en la regla catch-all existente).
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_PERMISSIONS, canUseWatermark } from "@/lib/plans";
import { AgencyProfileFields } from "@/lib/agency-profile";

const EDITABLE_FIELDS: (keyof AgencyProfileFields)[] = [
  "agencyName",
  "description",
  "phone",
  "whatsapp",
  "website",
  "instagram",
  "address",
  "province",
  "city",
  "businessHours",
  "logoUrl",
];

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const { agencyId } = await resolveMembership(uid);
  const snap = await adminDb.doc(`users/${agencyId}`).get();
  if (!snap.exists) return Response.json({ error: "Agencia no encontrada" }, { status: 404 });
  const data = snap.data()!;

  const profile: AgencyProfileFields = {
    agencyName: data.agencyName || "",
    description: data.description || "",
    phone: data.phone || "",
    whatsapp: data.whatsapp || "",
    website: data.website || "",
    instagram: data.instagram || "",
    address: data.address || data.businessAddress || "",
    province: data.province || "",
    city: data.city || "",
    businessHours: data.businessHours || "",
    logoUrl: data.logoUrl || "",
    watermarkEnabled: !!data.watermarkEnabled,
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
  for (const field of EDITABLE_FIELDS) {
    if (typeof body[field] === "string") update[field] = body[field].trim();
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
  return Response.json({ ok: true });
});
