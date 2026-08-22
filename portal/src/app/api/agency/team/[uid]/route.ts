// portal/src/app/api/agency/team/[uid]/route.ts
// PATCH  -> cambia el rol de un miembro existente.
// DELETE -> saca a un miembro del equipo.
import { ApiAuthError, requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { logActivity } from "@/lib/activity-log";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_LABELS, AGENCY_ROLE_PERMISSIONS, AgencyRole } from "@/lib/plans";
import { NextRequest } from "next/server";

const VALID_ROLES: AgencyRole[] = ["manager", "sales"];

async function requireTeamManager(request: NextRequest, targetUid: string) {
  const uid = await requireUid(request);
  const { agencyId, role: myRole } = await resolveMembership(uid);
  if (targetUid === agencyId) throw new ApiAuthError("No se puede modificar al dueño/a de la agencia.", 400);
  if (!AGENCY_ROLE_PERMISSIONS[myRole].manageTeam) throw new ApiAuthError("Tu rol no tiene permiso para gestionar el equipo.", 403);
  return { agencyId, actorUid: uid };
}

export const PATCH = withApiErrors(async (request, ctx: RouteContext<"/api/agency/team/[uid]">) => {
  const { uid: targetUid } = await ctx.params;
  const { agencyId, actorUid } = await requireTeamManager(request, targetUid);

  const body = await request.json();
  if (!VALID_ROLES.includes(body.role)) {
    return Response.json({ error: "Rol inválido." }, { status: 400 });
  }

  const ref = adminDb.doc(`agencies/${agencyId}/members/${targetUid}`);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Ese miembro no existe." }, { status: 404 });

  await Promise.all([
    ref.update({ role: body.role }),
    adminDb.doc(`agencyMemberships/${targetUid}`).set({ agencyId, role: body.role }),
  ]);

  const memberName = snap.data()?.name || snap.data()?.email || targetUid;
  await logActivity({
    agencyId,
    actorUid,
    entityType: "team",
    entityId: targetUid,
    summary: `Cambió el rol de ${memberName} a ${AGENCY_ROLE_LABELS[body.role as AgencyRole]}`,
  });

  return Response.json({ ok: true });
});

export const DELETE = withApiErrors(async (request, ctx: RouteContext<"/api/agency/team/[uid]">) => {
  const { uid: targetUid } = await ctx.params;
  const { agencyId, actorUid } = await requireTeamManager(request, targetUid);

  const memberSnap = await adminDb.doc(`agencies/${agencyId}/members/${targetUid}`).get();
  const memberName = memberSnap.data()?.name || memberSnap.data()?.email || targetUid;

  await Promise.all([
    adminDb.doc(`agencies/${agencyId}/members/${targetUid}`).delete(),
    adminDb.doc(`agencyMemberships/${targetUid}`).delete(),
  ]);

  await logActivity({ agencyId, actorUid, entityType: "team", entityId: targetUid, summary: `Sacó a ${memberName} del equipo` });

  return Response.json({ ok: true });
});
