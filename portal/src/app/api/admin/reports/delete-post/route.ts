// portal/src/app/api/admin/reports/delete-post/route.ts
// POST { vehicleId, reportId } — rechaza la publicación reportada y resuelve
// el reporte. Espeja handleDeletePost.
import { requireAdminRole } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";

export const POST = withApiErrors(async (request) => {
  await requireAdminRole(request);
  const { vehicleId, reportId } = await request.json();
  if (!vehicleId || !reportId) return Response.json({ error: "Faltan vehicleId/reportId" }, { status: 400 });

  const batch = adminDb.batch();
  batch.update(adminDb.doc(`vehicles/${vehicleId}`), {
    status: "rejected",
    published: false,
    rejectedAt: new Date(),
    rejectionReason: "Eliminado por administración (Reporte)",
  });
  batch.update(adminDb.doc(`reports/${reportId}`), { status: "resolved", resolution: "post_deleted" });

  await batch.commit();
  return Response.json({ ok: true });
});
