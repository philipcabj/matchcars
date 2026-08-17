// portal/src/app/api/agency/vehicles/[id]/expenses/route.ts
// GET  -> lista de gastos cargados a un auto (Módulo C — control de gastos
//         por unidad, para calcular el margen real de la venta).
// POST -> agrega un gasto. Mantiene vehicles/{id}.expensesTotal denormalizado
//         (misma moneda que el auto, sin selector de moneda por gasto — así
//         el margen no mezcla monedas) para no tener que sumar la
//         subcolección entera cada vez que se necesita el margen (ej. al
//         cerrar una venta y calcular la comisión).
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_PERMISSIONS, canTrackExpenses } from "@/lib/plans";
import { FieldValue } from "firebase-admin/firestore";

export const EXPENSE_TYPES = ["compra", "reparacion", "detailing", "tramite", "publicidad", "otro"] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

async function requireOwnedVehicle(agencyId: string, id: string) {
  const ref = adminDb.doc(`vehicles/${id}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  if (snap.data()?.userId !== agencyId) return null;
  return ref;
}

export const GET = withApiErrors(async (request, ctx: RouteContext<"/api/agency/vehicles/[id]/expenses">) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageStock) {
    return Response.json({ error: "Tu rol no tiene permiso para ver el stock." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const vehicleRef = await requireOwnedVehicle(agencyId, id);
  if (!vehicleRef) return Response.json({ error: "No encontrado" }, { status: 404 });

  const snap = await vehicleRef.collection("expenses").orderBy("createdAt", "desc").get();
  const expenses = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      tipo: data.tipo,
      monto: data.monto,
      descripcion: data.descripcion ?? "",
      createdAt: toIso(data.createdAt),
    };
  });

  return Response.json({ expenses });
});

export const POST = withApiErrors(async (request, ctx: RouteContext<"/api/agency/vehicles/[id]/expenses">) => {
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
  const vehicleRef = await requireOwnedVehicle(agencyId, id);
  if (!vehicleRef) return Response.json({ error: "No encontrado" }, { status: 404 });

  const body = await request.json();
  const tipo = EXPENSE_TYPES.includes(body.tipo) ? (body.tipo as ExpenseType) : "otro";
  const monto = Number(body.monto);
  if (!monto || monto <= 0) return Response.json({ error: "Ingresá un monto válido." }, { status: 400 });
  const descripcion = typeof body.descripcion === "string" ? body.descripcion.trim().slice(0, 200) : "";

  const expenseRef = vehicleRef.collection("expenses").doc();
  await adminDb.runTransaction(async (t) => {
    t.set(expenseRef, { tipo, monto, descripcion, createdAt: FieldValue.serverTimestamp(), createdBy: uid });
    t.update(vehicleRef, { expensesTotal: FieldValue.increment(monto) });
  });

  return Response.json({ id: expenseRef.id }, { status: 201 });
});
