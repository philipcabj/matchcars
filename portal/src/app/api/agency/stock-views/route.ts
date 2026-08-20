// portal/src/app/api/agency/stock-views/route.ts
// GET/POST -> vistas guardadas de Stock, personales por usuario (no por
// agencia — cada miembro del equipo puede querer mirar Stock distinto).
// Viven en users/{uid}/stockViews, una colección chica que la app nunca lee
// ni escribe — es exclusiva del portal.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export interface StockViewFilters {
  statusFilter: string;
  agingFilter: string;
  sort: string;
  search: string;
  priceMin: string;
  priceMax: string;
}

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const snap = await adminDb.collection(`users/${uid}/stockViews`).orderBy("createdAt", "asc").get();
  const views = snap.docs.map((d) => ({ id: d.id, name: d.data().name as string, filters: d.data().filters as StockViewFilters }));
  return Response.json({ views });
});

export const POST = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const body = await request.json();
  const name = String(body.name || "").trim();
  if (!name) return Response.json({ error: "Ponele un nombre a la vista." }, { status: 400 });
  const filters = body.filters as StockViewFilters;

  const ref = await adminDb.collection(`users/${uid}/stockViews`).add({ name, filters, createdAt: FieldValue.serverTimestamp() });
  return Response.json({ id: ref.id }, { status: 201 });
});
