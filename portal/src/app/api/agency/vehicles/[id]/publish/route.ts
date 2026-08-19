// portal/src/app/api/agency/vehicles/[id]/publish/route.ts
// POST -> pasa un auto de "a_preparar" (creado desde parte de pago, ver
// add_trade_in_to_stock en sale-operations/[id]/route.ts) a "pending_review"
// — mismo estado inicial que cualquier auto nuevo, entra a la cola de
// moderación normal (ModerationTab). Antes no existía NINGÚN camino para
// sacar un auto de "a_preparar": la edición (PATCH de este mismo recurso)
// a propósito no toca status/published, así que quedaba colgado para
// siempre sin que el admin lo viera ni la agencia supiera qué hacer.
import { ApiAuthError, requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_PERMISSIONS } from "@/lib/plans";
import { FieldValue } from "firebase-admin/firestore";

export const POST = withApiErrors(async (request, ctx: RouteContext<"/api/agency/vehicles/[id]/publish">) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageStock) {
    return Response.json({ error: "Tu rol no tiene permiso para publicar autos." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const ref = adminDb.doc(`vehicles/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiAuthError("No encontrado", 404);
  const data = snap.data()!;
  if (data.userId !== agencyId) throw new ApiAuthError("No autorizado", 403);

  if (data.status !== "a_preparar") {
    return Response.json({ error: "Este auto ya no está en preparación." }, { status: 400 });
  }

  const missing: string[] = [];
  if (!data.brand) missing.push("marca");
  if (!data.model) missing.push("modelo");
  if (!data.year) missing.push("año");
  if (!data.price) missing.push("precio");
  if (!data.images?.cover) missing.push("foto de portada");
  if (missing.length > 0) {
    return Response.json({ error: `Completá antes de publicar: ${missing.join(", ")}.` }, { status: 400 });
  }

  await ref.update({ status: "pending_review", published: false, updatedAt: FieldValue.serverTimestamp() });
  return Response.json({ ok: true });
});
