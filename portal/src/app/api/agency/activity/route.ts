// portal/src/app/api/agency/activity/route.ts
// GET -> registro de actividad del equipo (quién hizo qué y cuándo), más
// reciente primero. Ver portal/src/lib/activity-log.ts para qué se registra
// y por qué no es absolutamente todo.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_PERMISSIONS } from "@/lib/plans";

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  // Ver actividad del equipo es información sensible de gestión (quién
  // cambió qué precio, quién cerró qué venta) — mismo permiso que gestionar
  // el equipo, no el de leads/stock por separado.
  if (!AGENCY_ROLE_PERMISSIONS[role].manageTeam) {
    return Response.json({ error: "Tu rol no tiene permiso para ver la actividad del equipo." }, { status: 403 });
  }

  const snap = await adminDb
    .collection(`agencies/${agencyId}/activity`)
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();

  const events = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      actorUid: data.actorUid as string,
      actorName: data.actorName as string,
      entityType: data.entityType as string,
      entityId: data.entityId as string,
      summary: data.summary as string,
      createdAt: toIso(data.createdAt),
    };
  });

  return Response.json({ events });
});
