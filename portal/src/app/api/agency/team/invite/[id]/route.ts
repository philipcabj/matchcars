// portal/src/app/api/agency/team/invite/[id]/route.ts
// DELETE -> revoca una invitación pendiente (no la borra, la marca
// "revoked" — sirve de auditoría, y libera el asiento que estaba reservando).
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_PERMISSIONS } from "@/lib/plans";

export const DELETE = withApiErrors(async (request, ctx: RouteContext<"/api/agency/team/invite/[id]">) => {
  const uid = await requireUid(request);
  const { agencyId, role: myRole } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[myRole].manageTeam) {
    return Response.json({ error: "Tu rol no tiene permiso para gestionar el equipo." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const ref = adminDb.doc(`agencyInvites/${id}`);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "No encontrado" }, { status: 404 });
  const invite = snap.data()!;
  if (invite.agencyId !== agencyId) return Response.json({ error: "No autorizado" }, { status: 403 });
  if (invite.status !== "pending") return Response.json({ error: "Esa invitación ya no está pendiente." }, { status: 400 });

  await ref.update({ status: "revoked" });
  return Response.json({ ok: true });
});
