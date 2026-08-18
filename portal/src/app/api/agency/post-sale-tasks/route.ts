// portal/src/app/api/agency/post-sale-tasks/route.ts
// GET -> tareas de postventa de la agencia (Módulo B). Las crea la Cloud
// Function onSaleConfirmed, no este endpoint — acá solo se listan/gestionan.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { requireCRMAccess, resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_PERMISSIONS } from "@/lib/plans";

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageLeads) {
    return Response.json({ error: "Tu rol no tiene permiso para ver postventa." }, { status: 403 });
  }
  await requireCRMAccess(agencyId);

  const snap = await adminDb.collection("postSaleTasks").where("sellerId", "==", agencyId).get();
  const buyerIds = Array.from(new Set(snap.docs.map((d) => d.data().buyerId).filter(Boolean)));
  const buyerDocs = buyerIds.length > 0 ? await adminDb.getAll(...buyerIds.map((id) => adminDb.doc(`users/${id}`))) : [];
  const buyerNames = new Map(
    buyerDocs.map((d) => [
      d.id,
      `${d.data()?.firstName ?? ""} ${d.data()?.lastName ?? ""}`.trim() || d.data()?.displayName || d.data()?.email || "Comprador",
    ])
  );

  const tasks = snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        vehicleId: data.vehicleId,
        buyerId: data.buyerId,
        buyerLabel: buyerNames.get(data.buyerId) ?? "Comprador",
        vehicleSnapshot: data.vehicleSnapshot ?? null,
        tipo: data.tipo,
        programadaPara: toIso(data.programadaPara),
        estado: data.estado,
        canal: data.canal,
        sentAt: toIso(data.sentAt),
        doneAt: toIso(data.doneAt),
      };
    })
    .sort((a, b) => (a.programadaPara ?? "").localeCompare(b.programadaPara ?? ""));

  return Response.json({ tasks });
});
