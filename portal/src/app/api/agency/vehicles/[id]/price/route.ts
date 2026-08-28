// portal/src/app/api/agency/vehicles/[id]/price/route.ts
// PATCH -> ajuste rápido de precio desde la lista de Stock, sin pasar por el
// formulario completo de edición. Mismo criterio de priceHistory que el
// PATCH grande de vehicles/[id].
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { logActivity } from "@/lib/activity-log";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_PERMISSIONS } from "@/lib/plans";
import { hasSection } from "@/lib/sections";
import { FieldValue } from "firebase-admin/firestore";

export const PATCH = withApiErrors(async (request, ctx: RouteContext<"/api/agency/vehicles/[id]/price">) => {
  const uid = await requireUid(request);
  const membership = await resolveMembership(uid);
  const { agencyId, role } = membership;
  if (!AGENCY_ROLE_PERMISSIONS[role].manageStock || !hasSection(membership, "stock")) {
    return Response.json({ error: "Tu rol no tiene permiso para editar el stock." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const ref = adminDb.doc(`vehicles/${id}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.userId !== agencyId) return Response.json({ error: "No encontrado" }, { status: 404 });

  const body = await request.json();
  const price = Number(body.price);
  const currency = body.currency === "USD" ? "USD" : "ARS";
  if (!price || price <= 0) return Response.json({ error: "Ingresá un precio válido." }, { status: 400 });

  const existing = snap.data()!;
  const priceChanged = price !== existing.price || currency !== existing.currency;

  await ref.update({
    price,
    currency,
    updatedAt: FieldValue.serverTimestamp(),
    ...(priceChanged ? { priceHistory: FieldValue.arrayUnion({ price, currency, changedAt: new Date() }) } : {}),
  });

  if (priceChanged) {
    const carLabel = `${existing.brand ?? ""} ${existing.model ?? ""}`.trim() || "un auto";
    await logActivity({
      agencyId,
      actorUid: uid,
      entityType: "vehicle",
      entityId: id,
      summary: `Cambió el precio de ${carLabel}: ${existing.currency ?? "ARS"} ${Number(existing.price ?? 0).toLocaleString("es-AR")} → ${currency} ${price.toLocaleString("es-AR")}`,
    });
  }

  return Response.json({ ok: true });
});
