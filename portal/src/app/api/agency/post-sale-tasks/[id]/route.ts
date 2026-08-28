// portal/src/app/api/agency/post-sale-tasks/[id]/route.ts
// PATCH -> marcar una tarea de postventa como hecha a mano — el único caso
// pensado para esto es "recontacto" (canal "manual", nunca se auto-envía),
// pero se permite para cualquier tarea por si la agencia ya hizo el
// seguimiento por otro medio antes de que dispare el envío automático.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { requireCRMAccess, resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_PERMISSIONS } from "@/lib/plans";
import { hasSection } from "@/lib/sections";
import { FieldValue } from "firebase-admin/firestore";

export const PATCH = withApiErrors(async (request, ctx: RouteContext<"/api/agency/post-sale-tasks/[id]">) => {
  const uid = await requireUid(request);
  const membership = await resolveMembership(uid);
  const { agencyId, role } = membership;
  if (!AGENCY_ROLE_PERMISSIONS[role].manageLeads || !hasSection(membership, "postventa")) {
    return Response.json({ error: "Tu rol no tiene permiso para gestionar postventa." }, { status: 403 });
  }
  await requireCRMAccess(agencyId);

  const { id } = await ctx.params;
  const ref = adminDb.doc(`postSaleTasks/${id}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.sellerId !== agencyId) return Response.json({ error: "No encontrado" }, { status: 404 });

  const body = await request.json();
  if (body.action !== "mark_done") return Response.json({ error: "Acción inválida." }, { status: 400 });

  await ref.update({ estado: "hecha", doneAt: FieldValue.serverTimestamp() });
  return Response.json({ ok: true });
});
