// portal/src/app/api/agency/vehicles/[id]/visibility/route.ts
// PATCH -> pausar/republicar un auto YA aprobado (status:"available"), sin
// pasar de nuevo por moderación — antes esto no existía en el portal: la
// única forma de sacar un auto de circulación era eliminarlo (soft-delete
// permanente, ver DELETE en [id]/route.ts). Pausar solo toca `published`,
// el mismo campo booleano que ya lee marketplace/app en todos lados —
// republicar deja el auto exactamente como estaba antes de pausarlo.
import { ApiAuthError, requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { logActivity } from "@/lib/activity-log";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_PERMISSIONS } from "@/lib/plans";
import { FieldValue } from "firebase-admin/firestore";

export const PATCH = withApiErrors(async (request, ctx: RouteContext<"/api/agency/vehicles/[id]/visibility">) => {
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

  if (data.status !== "available") {
    return Response.json(
      { error: "Solo se puede pausar o republicar un auto ya aprobado. Este está en otro estado." },
      { status: 400 }
    );
  }

  const body = await request.json();
  const published = body.published === true;
  await ref.update({ published, updatedAt: FieldValue.serverTimestamp() });

  const carLabel = `${data.brand ?? ""} ${data.model ?? ""}`.trim() || "un auto";
  await logActivity({
    agencyId,
    actorUid: uid,
    entityType: "vehicle",
    entityId: id,
    summary: published ? `Republicó ${carLabel}` : `Pausó ${carLabel}`,
  });

  return Response.json({ ok: true, published });
});
