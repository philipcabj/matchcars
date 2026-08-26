// portal/src/app/api/admin/activity/route.ts
// GET -> feed combinado de actividad de TODA la plataforma para el panel de
// admin (a diferencia de /api/agency/activity, que es una sola agencia).
// Mezcla dos fuentes: agencies/{agencyId}/activity de todas las agencias
// (collection group) + platformActivity (acciones del propio panel de admin
// sin un dueño único, ver lib/activity-log.ts). Visible a admin y moderador,
// igual que Moderación/Reportes.
import { requireAdminRole } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";

const LIMIT_PER_SOURCE = 100;
const LIMIT_TOTAL = 150;

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

interface FeedEvent {
  id: string;
  source: "agency" | "platform";
  actorUid: string;
  actorName: string;
  entityType: string;
  entityId: string | null;
  agencyId: string | null;
  agencyName: string | null;
  summary: string;
  createdAt: string | null;
  sortKey: number;
}

export const GET = withApiErrors(async (request) => {
  await requireAdminRole(request);

  const [agencySnap, platformSnap] = await Promise.all([
    adminDb.collectionGroup("activity").orderBy("createdAt", "desc").limit(LIMIT_PER_SOURCE).get(),
    adminDb.collection("platformActivity").orderBy("createdAt", "desc").limit(LIMIT_PER_SOURCE).get(),
  ]);

  const agencyIds = Array.from(
    new Set(agencySnap.docs.map((d) => d.ref.parent.parent?.id).filter((id): id is string => !!id))
  );
  const agencyNames = new Map<string, string>();
  if (agencyIds.length > 0) {
    const agencyDocs = await adminDb.getAll(...agencyIds.map((id) => adminDb.doc(`users/${id}`)));
    agencyDocs.forEach((snap, i) => {
      const data = snap.data();
      const name = data?.agencyName || data?.displayName || data?.email || agencyIds[i];
      agencyNames.set(agencyIds[i], name);
    });
  }

  const agencyEvents: FeedEvent[] = agencySnap.docs.map((d) => {
    const data = d.data();
    const agencyId = d.ref.parent.parent?.id ?? null;
    const createdAt = data.createdAt;
    return {
      id: d.id,
      source: "agency",
      actorUid: data.actorUid as string,
      actorName: data.actorName as string,
      entityType: data.entityType as string,
      entityId: (data.entityId as string) ?? null,
      agencyId,
      agencyName: agencyId ? agencyNames.get(agencyId) ?? agencyId : null,
      summary: data.summary as string,
      createdAt: toIso(createdAt),
      sortKey: createdAt?.toMillis ? createdAt.toMillis() : 0,
    };
  });

  const platformEvents: FeedEvent[] = platformSnap.docs.map((d) => {
    const data = d.data();
    const createdAt = data.createdAt;
    return {
      id: d.id,
      source: "platform",
      actorUid: data.actorUid as string,
      actorName: data.actorName as string,
      entityType: data.action as string,
      entityId: null,
      agencyId: null,
      agencyName: null,
      summary: data.summary as string,
      createdAt: toIso(createdAt),
      sortKey: createdAt?.toMillis ? createdAt.toMillis() : 0,
    };
  });

  const events = [...agencyEvents, ...platformEvents]
    .sort((a, b) => b.sortKey - a.sortKey)
    .slice(0, LIMIT_TOTAL)
    .map(({ sortKey: _sortKey, ...rest }) => rest);

  return Response.json({ events });
});
