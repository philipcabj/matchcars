// portal/src/app/api/admin/reports/route.ts
// GET /api/admin/reports — reportes pendientes agrupados por usuario
// denunciado (resolviendo dueño del vehículo cuando el reporte es sobre un
// auto, no sobre un usuario directo) — mismo criterio que el efecto de
// agrupación de app/(admin)/dashboard.tsx.
import { requireAdminRole } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

export const GET = withApiErrors(async (request) => {
  await requireAdminRole(request);

  const snap = await adminDb.collection("reports").where("status", "==", "pending").get();
  const rawReports = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      targetId: data.targetId ?? "",
      targetType: data.targetType ?? "",
      reason: data.reason ?? "",
      details: data.details ?? "",
      reportedBy: data.reportedBy ?? null,
      createdAt: toIso(data.createdAt),
    };
  });

  // uid denunciado -> lista de sus reportes, enriquecidos con el nombre del
  // denunciante y, si el reporte es sobre un auto, sus datos básicos — así
  // el detalle por usuario no necesita otro round-trip.
  const byUser = new Map<string, (typeof rawReports[number] & { reporterName: string | null; vehicle: { id: string; brand: string; model: string; year: number | null } | null })[]>();
  for (const r of rawReports) {
    let uid: string | null = null;
    let vehicle: { id: string; brand: string; model: string; year: number | null } | null = null;
    if (r.targetType === "user") {
      uid = r.targetId;
    } else if (r.targetType === "vehicle") {
      const vSnap = await adminDb.doc(`vehicles/${r.targetId}`).get();
      if (vSnap.exists) {
        const vData = vSnap.data()!;
        uid = vData.userId ?? null;
        vehicle = { id: vSnap.id, brand: vData.brand ?? "", model: vData.model ?? "", year: vData.year ?? null };
      }
    }
    if (!uid) continue;

    let reporterName: string | null = null;
    if (r.reportedBy) {
      const rSnap = await adminDb.doc(`users/${r.reportedBy}`).get();
      if (rSnap.exists) {
        const rData = rSnap.data()!;
        reporterName = [rData.firstName, rData.lastName].filter(Boolean).join(" ") || null;
      }
    }

    const list = byUser.get(uid) ?? [];
    list.push({ ...r, reporterName, vehicle });
    byUser.set(uid, list);
  }

  const reportedUsers = [];
  for (const [uid, userReports] of byUser.entries()) {
    const uSnap = await adminDb.doc(`users/${uid}`).get();
    if (!uSnap.exists) continue;
    const data = uSnap.data()!;
    reportedUsers.push({
      user: {
        id: uSnap.id,
        firstName: data.firstName ?? "",
        lastName: data.lastName ?? "",
        email: data.email ?? "",
        isBlocked: !!data.isBlocked,
      },
      reports: userReports,
    });
  }

  return Response.json({ reportedUsers, totalPending: rawReports.length });
});
