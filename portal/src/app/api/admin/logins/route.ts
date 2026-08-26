// portal/src/app/api/admin/logins/route.ts
// GET -> últimos logins al portal, más reciente primero. Admin only (no
// moderador) porque incluye IP, más sensible que el resto del panel — mismo
// criterio que la gestión de usuarios (requireSuperAdmin).
import { requireSuperAdmin } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

export const GET = withApiErrors(async (request) => {
  await requireSuperAdmin(request);

  const snap = await adminDb.collection("loginEvents").orderBy("createdAt", "desc").limit(200).get();

  const logins = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      uid: data.uid as string,
      email: (data.email as string | null) ?? null,
      name: (data.name as string | null) ?? null,
      method: data.method as string,
      ip: (data.ip as string | null) ?? null,
      userAgent: (data.userAgent as string | null) ?? null,
      createdAt: toIso(data.createdAt),
    };
  });

  return Response.json({ logins });
});
