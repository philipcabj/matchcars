// portal/src/app/api/admin/vehicles/bulk-delete/route.ts
// POST { ids: string[], reason: string } — elimina varias publicaciones de
// una, con el mismo motivo aplicado a todas. Mismo mecanismo que el borrado
// individual (ver deleteVehicleAsAdmin), solo que en lote. Admin only.
import { deleteVehicleAsAdmin } from "@/lib/admin-vehicle-actions";
import { requireSuperAdmin } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";

const MAX_IDS = 100;

export const POST = withApiErrors(async (request) => {
  await requireSuperAdmin(request);
  const body = await request.json();

  const ids: unknown = body.ids;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string")) {
    return Response.json({ error: "Faltan las publicaciones a eliminar." }, { status: 400 });
  }
  if (!reason) return Response.json({ error: "Ingresá un motivo de eliminación." }, { status: 400 });
  if (ids.length > MAX_IDS) return Response.json({ error: `Máximo ${MAX_IDS} por vez.` }, { status: 400 });

  const results = await Promise.all(
    (ids as string[]).map(async (id) => ({ id, ...(await deleteVehicleAsAdmin(id, reason)) }))
  );

  const failed = results.filter((r) => !r.ok);
  return Response.json({ deleted: results.length - failed.length, failed });
});
