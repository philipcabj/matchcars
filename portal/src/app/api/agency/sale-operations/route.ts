// portal/src/app/api/agency/sale-operations/route.ts
// GET -> lista de operaciones de venta de la agencia, para el panel
// /dashboard/operaciones (Kanban simple por estado del checklist).
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
    return Response.json({ error: "Tu rol no tiene permiso para ver operaciones." }, { status: 403 });
  }
  await requireCRMAccess(agencyId);

  const DUE_SOON_DAYS = 3;
  const now = Date.now();
  const dueSoonThreshold = now + DUE_SOON_DAYS * 24 * 60 * 60 * 1000;

  const snap = await adminDb.collection("saleOperations").where("sellerId", "==", agencyId).get();
  const operations = snap.docs
    .map((d) => {
      const data = d.data();
      const checklist = data.checklist ?? [];
      const doneCount = checklist.filter((c: { status: string }) => c.status === "hecho").length;

      // Peor severidad entre los pasos pendientes con fecha límite — para
      // pintar un aviso en la fila sin tener que abrir cada operación.
      let dueSeverity: "overdue" | "soon" | null = null;
      for (const c of checklist as { status: string; dueAt?: { toMillis?: () => number } | null }[]) {
        if (c.status !== "pendiente" || !c.dueAt?.toMillis) continue;
        const dueMillis = c.dueAt.toMillis();
        if (dueMillis < now) dueSeverity = "overdue";
        else if (dueMillis <= dueSoonThreshold && dueSeverity !== "overdue") dueSeverity = "soon";
      }

      return {
        id: d.id,
        leadId: data.leadId,
        status: data.status ?? "en_curso",
        assignedTo: data.assignedTo ?? null,
        vehicleSnapshot: data.vehicleSnapshot ?? null,
        buyerLabel: data.buyerLabel ?? "Comprador",
        stepsDone: doneCount,
        stepsTotal: checklist.length,
        dueSeverity,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    })
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

  return Response.json({ operations });
});
