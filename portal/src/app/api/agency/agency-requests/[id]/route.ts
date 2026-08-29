// portal/src/app/api/agency/agency-requests/[id]/route.ts
// PATCH -> cerrar/reabrir un pedido propio (ya se consiguió el auto, o ya
// no hace falta más). Solo quien lo publicó puede tocarlo.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { requireCRMAccess, resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { hasSection } from "@/lib/sections";
import { FieldValue } from "firebase-admin/firestore";

export const PATCH = withApiErrors(async (request, ctx: RouteContext<"/api/agency/agency-requests/[id]">) => {
  const uid = await requireUid(request);
  const membership = await resolveMembership(uid);
  const { agencyId } = membership;
  if (!hasSection(membership, "entreAgencias")) {
    return Response.json({ error: "No tenés acceso a esta sección." }, { status: 403 });
  }
  await requireCRMAccess(agencyId);

  const { id } = await ctx.params;
  const ref = adminDb.doc(`agencyRequests/${id}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.agencyId !== agencyId) {
    return Response.json({ error: "No encontrado" }, { status: 404 });
  }

  const body = await request.json();
  const status = body.status === "closed" ? "closed" : "open";
  await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });

  return Response.json({ ok: true });
});
