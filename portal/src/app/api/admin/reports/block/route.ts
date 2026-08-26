// portal/src/app/api/admin/reports/block/route.ts
// POST { userId, reportId } — bloquea al usuario, despublica todos sus
// autos y resuelve el reporte, en un solo batch. Espeja handleBlockUser.
import { logPlatformActivity } from "@/lib/activity-log";
import { requireAdminRole } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";

export const POST = withApiErrors(async (request) => {
  const { uid: actorUid } = await requireAdminRole(request);
  const { userId, reportId } = await request.json();
  if (!userId || !reportId) return Response.json({ error: "Faltan userId/reportId" }, { status: 400 });

  const batch = adminDb.batch();
  batch.update(adminDb.doc(`users/${userId}`), { isBlocked: true, blockedAt: new Date() });
  batch.update(adminDb.doc(`reports/${reportId}`), { status: "resolved", resolution: "blocked" });

  const vehiclesSnap = await adminDb.collection("vehicles").where("userId", "==", userId).get();
  vehiclesSnap.forEach((v) => batch.update(v.ref, { published: false, status: "blocked" }));

  await batch.commit();
  await logPlatformActivity({ actorUid, action: "user.blocked", summary: `Usuario bloqueado por reporte (${userId})` });
  return Response.json({ ok: true });
});
