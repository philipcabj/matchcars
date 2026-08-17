// portal/src/app/api/agency/vehicles/[id]/purchase-price/route.ts
// PATCH -> guarda el costo de adquisición del auto (Módulo C — margen real).
// Ruta chica aparte del PATCH grande de vehicles/[id] a propósito: la
// pestaña "Costos" del detalle de Stock no reenvía el formulario completo,
// solo este único campo.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_PERMISSIONS, canTrackExpenses } from "@/lib/plans";

export const PATCH = withApiErrors(async (request, ctx: RouteContext<"/api/agency/vehicles/[id]/purchase-price">) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageStock) {
    return Response.json({ error: "Tu rol no tiene permiso para editar el stock." }, { status: 403 });
  }

  const ownerSnap = await adminDb.doc(`users/${agencyId}`).get();
  if (!canTrackExpenses(ownerSnap.data()?.plan || "free")) {
    return Response.json({ error: "El control de gastos está disponible desde el plan Pro." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const ref = adminDb.doc(`vehicles/${id}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.userId !== agencyId) return Response.json({ error: "No encontrado" }, { status: 404 });

  const body = await request.json();
  const purchasePrice = body.purchasePrice === null ? null : Number(body.purchasePrice);
  if (purchasePrice !== null && (!Number.isFinite(purchasePrice) || purchasePrice < 0)) {
    return Response.json({ error: "Ingresá un costo válido." }, { status: 400 });
  }

  await ref.update({ purchasePrice });
  return Response.json({ ok: true });
});
