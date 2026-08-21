// portal/src/app/api/admin/users/route.ts
// GET /api/admin/users — lista de usuarios de la plataforma (hasta 5000, más
// recientes primero), solo admin (no moderator) — mismo gate que la tab
// "Usuarios" de app/(admin)/dashboard.tsx. Búsqueda/filtro se resuelve
// client-side sobre este lote, igual que la app.
// (2026-08-20: el límite era 300 — con 399 usuarios reales, 99 quedaban
// invisibles en silencio, mismo bug que tenía la app. `total` va aparte,
// contado con un agregado real, para que el número mostrado nunca dependa
// de cuántos se llegaron a traer.)
import { requireSuperAdmin } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";

function toMillis(ts: unknown): number {
  if (ts && typeof ts === "object" && "toMillis" in ts) return (ts as { toMillis: () => number }).toMillis();
  return 0;
}
function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

export const GET = withApiErrors(async (request) => {
  await requireSuperAdmin(request);
  const [snap, countSnap] = await Promise.all([
    adminDb.collection("users").limit(5000).get(),
    adminDb.collection("users").count().get(),
  ]);
  const users = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      firstName: data.firstName ?? "",
      lastName: data.lastName ?? "",
      email: data.email ?? "",
      photoURL: data.photoURL ?? null,
      avatarColor: data.avatarColor ?? null,
      initials: data.initials ?? null,
      role: data.role ?? "user",
      plan: data.plan ?? "free",
      isBlocked: !!data.isBlocked,
      createdAt: toIso(data.createdAt),
      lastLoginAt: toIso(data.lastLoginAt),
      cancelAtPeriodEnd: !!data.cancelAtPeriodEnd,
      nextBillingDate: toIso(data.nextBillingDate),
      createdAtMillis: toMillis(data.createdAt),
    };
  });
  users.sort((a, b) => b.createdAtMillis - a.createdAtMillis);
  return Response.json({ users, total: countSnap.data().count });
});
