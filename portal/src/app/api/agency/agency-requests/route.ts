// portal/src/app/api/agency/agency-requests/route.ts
// GET  -> board de pedidos abiertos de OTRAS agencias + los propios (para
//         "Mis pedidos"), cada uno con sugerencias de autos que ya podrían
//         servir (matches, calculado al vuelo — ver computeMatches).
// POST -> publica un pedido nuevo.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { requireCRMAccess, resolveMembership } from "@/lib/agency-server";
import { AgencyRequestMatch, AgencyRequestWithMatches } from "@/lib/agency-requests";
import { adminDb } from "@/lib/firebase-admin";
import { hasSection } from "@/lib/sections";
import { FieldValue } from "firebase-admin/firestore";

const MAX_MATCHES = 5;

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

// Mismo criterio que analyzeMarketPrice (lib/pricing.ts): buscar en TODO el
// stock publicado por marca, sin filtrar por dueño, y resolver el resto
// (modelo/año/precio) en memoria — acá además se excluye el stock de la
// propia agencia que pidió (no tiene sentido sugerirle su propio auto).
async function computeMatches(req: {
  agencyId: string;
  brand: string;
  model: string;
  yearMin: number | null;
  yearMax: number | null;
  priceMax: number | null;
  currency: string;
}): Promise<AgencyRequestMatch[]> {
  if (!req.brand) return [];
  const brandCandidates = Array.from(new Set([req.brand, req.brand.toUpperCase(), req.brand.toLowerCase()]));
  const snap = await adminDb.collection("vehicles").where("brand", "in", brandCandidates).where("published", "==", true).get();
  const modelLower = req.model.trim().toLowerCase();
  const matches: AgencyRequestMatch[] = [];
  for (const d of snap.docs) {
    const v = d.data();
    if (v.userId === req.agencyId) continue;
    if (modelLower && !String(v.model || "").toLowerCase().includes(modelLower)) continue;
    if (req.yearMin && (v.year || 0) < req.yearMin) continue;
    if (req.yearMax && (v.year || 0) > req.yearMax) continue;
    if (req.priceMax && (v.currency || "ARS") === req.currency && (v.price || 0) > req.priceMax) continue;
    matches.push({
      vehicleId: d.id,
      brand: v.brand ?? "",
      model: v.model ?? "",
      year: v.year ?? null,
      price: v.price ?? 0,
      currency: v.currency ?? "ARS",
      coverImage: v.images?.cover ?? null,
      agencyId: v.userId,
      agencyName: v.userName ?? "Agencia",
    });
    if (matches.length >= MAX_MATCHES) break;
  }
  return matches;
}

function serialize(id: string, data: FirebaseFirestore.DocumentData): Omit<AgencyRequestWithMatches, "matches"> {
  return {
    id,
    agencyId: data.agencyId,
    agencyName: data.agencyName ?? "Agencia",
    brand: data.brand ?? "",
    model: data.model ?? "",
    yearMin: data.yearMin ?? null,
    yearMax: data.yearMax ?? null,
    priceMax: data.priceMax ?? null,
    currency: data.currency === "USD" ? "USD" : "ARS",
    notes: data.notes ?? "",
    status: data.status === "closed" ? "closed" : "open",
    responseCount: data.responseCount ?? 0,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const membership = await resolveMembership(uid);
  const { agencyId } = membership;
  if (!hasSection(membership, "entreAgencias")) {
    return Response.json({ error: "No tenés acceso a esta sección." }, { status: 403 });
  }
  await requireCRMAccess(agencyId);

  // Volumen esperado bajo (pedidos puntuales, no autos en stock) — se trae
  // todo y se separa en memoria, mismo criterio que el resto del portal.
  const snap = await adminDb.collection("agencyRequests").get();
  const all = snap.docs.map((d) => ({ id: d.id, data: d.data() }));

  const board = all.filter((r) => r.data.agencyId !== agencyId && (r.data.status ?? "open") === "open");
  const mine = all.filter((r) => r.data.agencyId === agencyId);

  const withMatches = async (r: { id: string; data: FirebaseFirestore.DocumentData }): Promise<AgencyRequestWithMatches> => {
    const base = serialize(r.id, r.data);
    const matches = await computeMatches({
      agencyId: base.agencyId,
      brand: base.brand,
      model: base.model,
      yearMin: base.yearMin,
      yearMax: base.yearMax,
      priceMax: base.priceMax,
      currency: base.currency,
    });
    return { ...base, matches };
  };

  const [boardWithMatches, mineWithMatches] = await Promise.all([
    Promise.all(board.map(withMatches)),
    Promise.all(mine.map(withMatches)),
  ]);

  boardWithMatches.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  mineWithMatches.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  return Response.json({ board: boardWithMatches, mine: mineWithMatches });
});

export const POST = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const membership = await resolveMembership(uid);
  const { agencyId } = membership;
  if (!hasSection(membership, "entreAgencias")) {
    return Response.json({ error: "No tenés acceso a esta sección." }, { status: 403 });
  }
  await requireCRMAccess(agencyId);

  const body = await request.json();
  const brand = typeof body.brand === "string" ? body.brand.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!brand || !model) return Response.json({ error: "Marca y modelo son obligatorios." }, { status: 400 });

  const ownerSnap = await adminDb.doc(`users/${agencyId}`).get();
  const ownerData = ownerSnap.data() ?? {};
  const agencyName = ownerData.agencyName || ownerData.displayName || ownerData.email || "Agencia";

  const yearMin = Number.isFinite(Number(body.yearMin)) && body.yearMin ? Number(body.yearMin) : null;
  const yearMax = Number.isFinite(Number(body.yearMax)) && body.yearMax ? Number(body.yearMax) : null;
  const priceMax = Number.isFinite(Number(body.priceMax)) && body.priceMax ? Number(body.priceMax) : null;
  const currency = body.currency === "USD" ? "USD" : "ARS";
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "";

  const docRef = await adminDb.collection("agencyRequests").add({
    agencyId,
    agencyName,
    brand,
    model,
    yearMin,
    yearMax,
    priceMax,
    currency,
    notes,
    status: "open",
    responseCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const matches = await computeMatches({ agencyId, brand, model, yearMin, yearMax, priceMax, currency });

  return Response.json({ id: docRef.id, matches }, { status: 201 });
});
