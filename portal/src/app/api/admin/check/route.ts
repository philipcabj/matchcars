// portal/src/app/api/admin/check/route.ts
// GET /api/admin/check
// Cualquier usuario autenticado puede pegarle — a propósito no usa
// requireAdminRole acá (que tira 403), porque esto lo consume el Sidebar
// para decidir si mostrar el link "Administración" y no queremos que la
// carga normal del portal explote con un error para el 99% de las agencias
// que no son admin/moderador.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const snap = await adminDb.doc(`users/${uid}`).get();
  const role = snap.data()?.role;
  return Response.json({ role: role === "admin" || role === "moderator" ? role : null });
});
