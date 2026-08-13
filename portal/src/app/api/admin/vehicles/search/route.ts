// portal/src/app/api/admin/vehicles/search/route.ts
// GET /api/admin/vehicles/search?q=... — lista TODAS las publicaciones no
// eliminadas (más recientes primero), o filtradas por marca/modelo/
// vendedor/código de publicación (#4821 o solo 4821) si viene `q`. Admin
// only. `q` es opcional a propósito: la pantalla carga todo de entrada y el
// input actúa como filtro en vivo sobre esa lista (ver AllVehiclesTab.tsx),
// no como una búsqueda que hay que disparar aparte.
// Mismo patrón pragmático que fetchPublishedVehicles del marketplace: trae
// un lote y filtra en memoria, sin índices nuevos — no hace falta más para
// una herramienta interna de bajo volumen de uso. La paginación (10 por
// página) la resuelve el cliente sobre este mismo lote.
import { requireSuperAdmin } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";

const BATCH_SIZE = 500;

export const GET = withApiErrors(async (request) => {
  await requireSuperAdmin(request);
  const raw = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const q = raw.toLowerCase();

  // Si el filtro es un código (con o sin #), matcheo exacto por número
  // además del texto libre — un "4821" no debería traer de rebote cualquier
  // auto cuyo texto contenga esos dígitos.
  const codeMatch = q.replace(/^#/, "");
  const asCode = /^\d+$/.test(codeMatch) ? Number(codeMatch) : null;

  const snap = await adminDb.collection("vehicles").limit(BATCH_SIZE).get();
  const results = snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        brand: data.brand ?? "",
        model: data.model ?? "",
        version: data.version ?? "",
        year: data.year ?? null,
        price: data.price ?? 0,
        currency: data.currency ?? "ARS",
        coverImage: data.images?.cover ?? data.coverImage ?? data.cover ?? "",
        status: data.status ?? "available",
        userId: data.userId ?? "",
        userName: data.userName ?? "",
        publicationCode: typeof data.publicationCode === "number" ? data.publicationCode : null,
      };
    })
    .filter((v) => v.status !== "deleted")
    .filter((v) => {
      if (!q) return true;
      if (asCode !== null && v.publicationCode === asCode) return true;
      return `${v.brand} ${v.model} ${v.version} ${v.userName}`.toLowerCase().includes(q);
    })
    .sort((a, b) => (b.publicationCode ?? 0) - (a.publicationCode ?? 0));

  return Response.json({ vehicles: results });
});
