// portal/src/app/api/agency/stock-views/[id]/route.ts
// DELETE -> borra una vista guardada propia.
import { ApiAuthError, requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";

export const DELETE = withApiErrors(async (request, ctx: RouteContext<"/api/agency/stock-views/[id]">) => {
  const uid = await requireUid(request);
  const { id } = await ctx.params;
  const ref = adminDb.doc(`users/${uid}/stockViews/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiAuthError("No encontrada", 404);
  await ref.delete();
  return Response.json({ ok: true });
});
