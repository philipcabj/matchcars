// portal/src/app/api/agency/team/[uid]/route.ts
// PATCH  -> cambia el rol de un miembro existente.
// DELETE -> saca a un miembro del equipo.
import { ApiAuthError, requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { logActivity } from "@/lib/activity-log";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_LABELS, AGENCY_ROLE_PERMISSIONS, AgencyRole } from "@/lib/plans";
import { sanitizeSections } from "@/lib/sections";
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
  // Opcional: si no viene, se deja el acceso por sección tal como está
  // (cambiar el rol no debería resetear a mano lo que el dueño ya
  // configuró) — .update() con dot-path para no pisar el doc entero.
  const sections = sanitizeSections(body.sections);

  const ref = adminDb.doc(`agencies/${agencyId}/members/${targetUid}`);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Ese miembro no existe." }, { status: 404 });

  const update: Record<string, unknown> = { role: body.role };
  if (sections) update.sections = sections;

  await Promise.all([ref.update(update), adminDb.doc(`agencyMemberships/${targetUid}`).update(update)]);

  const memberName = snap.data()?.name || snap.data()?.email || targetUid;
  const summary = sections
    ? `Actualizó el acceso de ${memberName}`
    : `Cambió el rol de ${memberName} a ${AGENCY_ROLE_LABELS[body.role as AgencyRole]}`;
  await logActivity({ agencyId, actorUid, entityType: "team", entityId: targetUid, summary });

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
