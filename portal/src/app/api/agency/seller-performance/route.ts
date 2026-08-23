// portal/src/app/api/agency/seller-performance/route.ts
// GET -> performance de cada vendedor del equipo en un mes puntual (leads
// asignados, ganados, tasa de conversión, días promedio de cierre). Vive al
// lado de comisiones (mismo gate de plan/rol, mismo ?month=YYYY-MM, mismo
// concepto de "vendedor" vía assignedTo) pero separado de commissions/
// route.ts para no mezclar el cálculo de $ con el de actividad — dos
// preguntas distintas aunque compartan la misma agrupación por vendedor.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_PERMISSIONS, canManageCommissions } from "@/lib/plans";

function toDate(ts: unknown): Date | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate();
  return null;
}

function inMonth(date: Date | null, monthStart: Date, monthEnd: Date): boolean {
  return !!date && date >= monthStart && date < monthEnd;
}

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].viewStats) {
    return Response.json({ error: "Tu rol no tiene permiso para ver estadísticas." }, { status: 403 });
  }
  const ownerSnap = await adminDb.doc(`users/${agencyId}`).get();
  if (!canManageCommissions(ownerSnap.data()?.plan || "free")) {
    return Response.json({ error: "La performance de equipo está disponible en los planes Dealer." }, { status: 403 });
  }

  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month");
  const now = new Date();
  const [y, m] = monthParam?.match(/^\d{4}-\d{2}$/) ? monthParam.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 1);

  const snap = await adminDb.collection("leads").where("sellerId", "==", agencyId).get();

  interface Acc {
    leadsAssigned: number;
    leadsWon: number;
    totalDaysToClose: number;
  }
  const bySeller = new Map<string, Acc>();
  const getAcc = (sellerUid: string): Acc => {
    const acc = bySeller.get(sellerUid) ?? { leadsAssigned: 0, leadsWon: 0, totalDaysToClose: 0 };
    bySeller.set(sellerUid, acc);
    return acc;
  };

  for (const doc of snap.docs) {
    const data = doc.data();
    const assignedTo: string | null = data.assignedTo ?? null;
    // Sin vendedor asignado no hay a quién atribuírselo — mismo criterio que
    // comisiones (no cuenta como "nadie", simplemente no entra en ningún total.
    if (!assignedTo) continue;

    const createdAt = toDate(data.createdAt);
    const wonAt = toDate(data.wonAt);

    if (inMonth(createdAt, monthStart, monthEnd)) {
      getAcc(assignedTo).leadsAssigned += 1;
    }
    if (data.status === "won" && inMonth(wonAt, monthStart, monthEnd)) {
      const acc = getAcc(assignedTo);
      acc.leadsWon += 1;
      if (createdAt && wonAt) {
        acc.totalDaysToClose += (wonAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      }
    }
  }

  const bySellerArr = Array.from(bySeller.entries()).map(([sellerUid, acc]) => ({
    sellerUid,
    leadsAssigned: acc.leadsAssigned,
    leadsWon: acc.leadsWon,
    conversionRate: acc.leadsAssigned > 0 ? Math.round((acc.leadsWon / acc.leadsAssigned) * 100) : 0,
    avgDaysToClose: acc.leadsWon > 0 ? Math.round((acc.totalDaysToClose / acc.leadsWon) * 10) / 10 : null,
  }));

  return Response.json({ month: `${y}-${String(m).padStart(2, "0")}`, bySeller: bySellerArr });
});
