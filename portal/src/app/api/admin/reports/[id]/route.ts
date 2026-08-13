// portal/src/app/api/admin/reports/[id]/route.ts
// PATCH { action: "dismiss" } — espeja handleDismissReport.
import { requireAdminRole } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";

export const PATCH = withApiErrors(async (request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdminRole(request);
  const { id } = await params;
  const body = await request.json();
  if (body.action !== "dismiss") return Response.json({ error: "Acción inválida" }, { status: 400 });

  await adminDb.doc(`reports/${id}`).update({ status: "resolved", resolution: "dismissed" });
  return Response.json({ ok: true });
});
