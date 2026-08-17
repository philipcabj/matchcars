// portal/src/app/api/agency/vehicles/[id]/price/route.ts
// PATCH -> ajuste rápido de precio desde la lista de Stock, sin pasar por el
// formulario completo de edición. Mismo criterio de priceHistory que el
// PATCH grande de vehicles/[id].
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_PERMISSIONS } from "@/lib/plans";
import { FieldValue } from "firebase-admin/firestore";

export const PATCH = withApiErrors(async (request, ctx: RouteContext<"/api/agency/vehicles/[id]/price">) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageStock) {
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

  return Response.json({ ok: true });
});
