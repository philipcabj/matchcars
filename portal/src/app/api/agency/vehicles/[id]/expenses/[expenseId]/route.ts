// portal/src/app/api/agency/vehicles/[id]/expenses/[expenseId]/route.ts
// DELETE -> saca un gasto y descuenta su monto de vehicles/{id}.expensesTotal
// (mismo mecanismo denormalizado que el POST de la ruta padre).
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { hasSection } from "@/lib/sections";
import { FieldValue } from "firebase-admin/firestore";

export const DELETE = withApiErrors(async (request, ctx: RouteContext<"/api/agency/vehicles/[id]/expenses/[expenseId]">) => {
  const uid = await requireUid(request);
  const membership = await resolveMembership(uid);
  const { agencyId } = membership;
  if (!hasSection(membership, "costos")) {
    return Response.json({ error: "No tenés acceso a esta sección." }, { status: 403 });
  }

  const { id, expenseId } = await ctx.params;
  const vehicleRef = adminDb.doc(`vehicles/${id}`);
  const expenseRef = vehicleRef.collection("expenses").doc(expenseId);

  await adminDb.runTransaction(async (t) => {
    const [vehicleSnap, expenseSnap] = await Promise.all([t.get(vehicleRef), t.get(expenseRef)]);
    if (!vehicleSnap.exists || vehicleSnap.data()?.userId !== agencyId) throw new Error("No autorizado");
    if (!expenseSnap.exists) throw new Error("Gasto no encontrado");
    t.delete(expenseRef);
    t.update(vehicleRef, { expensesTotal: FieldValue.increment(-(expenseSnap.data()!.monto || 0)) });
  });

  return Response.json({ ok: true });
});
