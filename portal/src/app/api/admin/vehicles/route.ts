// portal/src/app/api/admin/vehicles/route.ts
// GET /api/admin/vehicles — cola de moderación (status pending/pending_review),
// ordenada por riskScore desc y luego más antiguo primero — mismo criterio
// que app/(admin)/dashboard.tsx.
import { requireAdminRole } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";

function toMillis(ts: unknown): number {
  if (ts && typeof ts === "object" && "toMillis" in ts) return (ts as { toMillis: () => number }).toMillis();
  return 0;
}

export const GET = withApiErrors(async (request) => {
  await requireAdminRole(request);
  const snap = await adminDb.collection("vehicles").where("status", "in", ["pending", "pending_review"]).get();
  const vehicles = snap.docs.map((d) => {
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
      userId: data.userId ?? "",
      userName: data.userName ?? "",
      riskScore: data.riskScore ?? 0,
      riskFlags: Array.isArray(data.riskFlags) ? data.riskFlags : [],
      publicationCode: typeof data.publicationCode === "number" ? data.publicationCode : null,
      createdAtMillis: toMillis(data.createdAt),
    };
  });
  vehicles.sort((a, b) => (b.riskScore !== a.riskScore ? b.riskScore - a.riskScore : a.createdAtMillis - b.createdAtMillis));
  return Response.json({ vehicles });
});
