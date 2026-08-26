// portal/src/app/api/admin/logins/route.ts
// GET -> últimos logins a la plataforma, más reciente primero. Admin only
// (no moderador) porque incluye IP, más sensible que el resto del panel —
// mismo criterio que la gestión de usuarios (requireSuperAdmin).
//
// Portal (agencias/admin) y app (compradores, mucho más volumen) se traen
// con un límite cada uno y se mezclan acá — si se pidiera un solo query con
// limit(200) sobre todo loginEvents, los logins de la app podrían desplazar
// por completo a los del portal, que son los que originalmente motivaron
// este tab.
import { requireSuperAdmin } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";

const LIMIT_PER_SOURCE = 150;
const LIMIT_TOTAL = 200;

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

export const GET = withApiErrors(async (request) => {
  await requireSuperAdmin(request);

  const [portalSnap, appSnap] = await Promise.all([
    adminDb.collection("loginEvents").where("source", "==", "portal").orderBy("createdAt", "desc").limit(LIMIT_PER_SOURCE).get(),
    adminDb.collection("loginEvents").where("source", "==", "app").orderBy("createdAt", "desc").limit(LIMIT_PER_SOURCE).get(),
  ]);

  const toRow = (d: FirebaseFirestore.QueryDocumentSnapshot) => {
    const data = d.data();
    const createdAt = data.createdAt;
    return {
      id: d.id,
      uid: data.uid as string,
      email: (data.email as string | null) ?? null,
      name: (data.name as string | null) ?? null,
      method: data.method as string,
      source: (data.source as string) ?? "portal",
      platform: (data.platform as string | null) ?? null,
      ip: (data.ip as string | null) ?? null,
      userAgent: (data.userAgent as string | null) ?? null,
      createdAt: toIso(createdAt),
      sortKey: createdAt?.toMillis ? createdAt.toMillis() : 0,
    };
  };

  const logins = [...portalSnap.docs.map(toRow), ...appSnap.docs.map(toRow)]
    .sort((a, b) => b.sortKey - a.sortKey)
    .slice(0, LIMIT_TOTAL)
    .map(({ sortKey: _sortKey, ...rest }) => rest);

  return Response.json({ logins });
});
