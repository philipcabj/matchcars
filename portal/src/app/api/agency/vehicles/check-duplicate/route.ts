// portal/src/app/api/agency/vehicles/check-duplicate/route.ts
// GET -> ¿ya existe un auto propio con esta patente? Antes no había ninguna
// forma de detectar una carga duplicada (misma unidad cargada dos veces por
// error, o reingresada sin darse cuenta de que ya estaba). Solo avisa, no
// bloquea — la agencia decide si sigue igual (ej. patente vieja reutilizada
// a propósito en un dato de prueba).
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const { agencyId } = await resolveMembership(uid);

  const { searchParams } = new URL(request.url);
  const licensePlate = (searchParams.get("licensePlate") || "").trim().toUpperCase();
  const excludeId = searchParams.get("excludeId") || "";
  if (!licensePlate) return Response.json({ matches: [] });

  // Un solo where() + filtro en memoria (mismo criterio que el resto del
  // portal, ver /api/agency/vehicles) para no necesitar un índice compuesto
  // por licensePlate — el volumen de stock por agencia es chico.
  const snap = await adminDb.collection("vehicles").where("userId", "==", agencyId).get();

  const matches = snap.docs
    .filter((d) => d.id !== excludeId && d.data().licensePlate === licensePlate && d.data().status !== "deleted")
    .map((d) => ({ id: d.id, brand: d.data().brand ?? "", model: d.data().model ?? "", status: d.data().status ?? "available" }));

  return Response.json({ matches });
});
