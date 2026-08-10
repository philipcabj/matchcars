// portal/src/app/api/agency/leads/route.ts
// GET  -> lista de leads de la agencia + KPIs (mismo cálculo que dealerStats
//         en app/(screens)/leads.tsx).
// POST -> crea un lead a mano (llamada, local, WhatsApp fuera de la app). Esto
//         no existe en la app hoy: ahí los leads son 100% automáticos (primer
//         mensaje de chat u oferta formal), y el portal no tiene chat, así que
//         sin esto la pantalla de Leads nunca se llenaría sola.
//
// Gap conocido a propósito: acá no se replica la negociación de ofertas
// (aceptar/rechazar/contraofertar) ni marcar "vendido" con precio de cierre —
// eso queda ligado al flujo de venta de la app (mycars.tsx), no portado.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_PERMISSIONS } from "@/lib/plans";
import { CreateManualLeadInput, SalesByMonth } from "@/lib/leads";
import { FieldValue } from "firebase-admin/firestore";

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Últimos 6 meses (incluido el actual), en orden cronológico, arrancando en 0
// para que los meses sin ventas también aparezcan en el gráfico.
function buildSalesByMonth(wonDocs: { wonAt: unknown; dealPrice?: number; dealCurrency?: string }[]): SalesByMonth[] {
  const now = new Date();
  const months: SalesByMonth[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ month: monthKey(d), count: 0, ars: 0, usd: 0 });
  }
  const byMonth = new Map(months.map((m) => [m.month, m]));

  for (const doc of wonDocs) {
    const ts = doc.wonAt as { toDate?: () => Date } | undefined;
    const wonAt = ts?.toDate ? ts.toDate() : null;
    if (!wonAt) continue;
    const bucket = byMonth.get(monthKey(wonAt));
    if (!bucket) continue; // fuera de la ventana de 6 meses
    bucket.count += 1;
    if ((doc.dealCurrency || "ARS") === "USD") bucket.usd += doc.dealPrice || 0;
    else bucket.ars += doc.dealPrice || 0;
  }

  return months;
}

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageLeads) {
    return Response.json({ error: "Tu rol no tiene permiso para ver los leads." }, { status: 403 });
  }

  const snap = await adminDb.collection("leads").where("sellerId", "==", agencyId).get();

  const leads = snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        status: data.status || "new",
        vehicleSnapshot: data.vehicleSnapshot ?? null,
        buyerSnapshot: data.buyerSnapshot ?? null,
        manualContact: data.manualContact ?? null,
        lastMessage: data.lastMessage ?? null,
        lastMessageAt: toIso(data.lastMessageAt),
        unreadCount: data.unreadCount ?? 0,
        dealPrice: data.dealPrice ?? null,
        dealCurrency: data.dealCurrency ?? null,
        createdAt: toIso(data.createdAt),
      };
    })
    .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));

  const total = leads.length;
  const newCount = leads.filter((l) => l.status === "new").length;
  const contactedCount = leads.filter((l) => l.status === "contacted").length;
  const negotiationCount = leads.filter((l) => l.status === "negotiation").length;
  const wonLeads = leads.filter((l) => l.status === "won");
  const wonCount = wonLeads.length;
  const lostCount = leads.filter((l) => l.status === "lost").length;
  const arsTotal = wonLeads.filter((l) => (l.dealCurrency || "ARS") !== "USD").reduce((s, l) => s + (l.dealPrice || 0), 0);
  const usdTotal = wonLeads.filter((l) => l.dealCurrency === "USD").reduce((s, l) => s + (l.dealPrice || 0), 0);
  const conversionRate = total > 0 ? Math.round((wonCount / total) * 100) : 0;

  const salesByMonth = buildSalesByMonth(
    snap.docs.filter((d) => d.data().status === "won").map((d) => d.data() as { wonAt: unknown; dealPrice?: number; dealCurrency?: string })
  );

  return Response.json({
    leads,
    stats: { total, newCount, contactedCount, negotiationCount, wonCount, lostCount, conversionRate, arsTotal, usdTotal },
    salesByMonth,
  });
});

export const POST = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageLeads) {
    return Response.json({ error: "Tu rol no tiene permiso para gestionar leads." }, { status: 403 });
  }

  const body = (await request.json()) as Partial<CreateManualLeadInput>;
  const name = body.name?.trim();
  if (!name) return Response.json({ error: "Falta el nombre del contacto." }, { status: 400 });

  let vehicleSnapshot = null;
  if (body.vehicleId) {
    const vehicleSnap = await adminDb.doc(`vehicles/${body.vehicleId}`).get();
    const vehicleData = vehicleSnap.data();
    if (vehicleSnap.exists && vehicleData?.userId === agencyId) {
      vehicleSnapshot = {
        brand: vehicleData.brand ?? null,
        model: vehicleData.model ?? null,
        year: vehicleData.year ?? null,
        price: vehicleData.price ?? null,
        currency: vehicleData.currency ?? null,
        coverUrl: vehicleData.images?.cover ?? null,
      };
    }
  }

  const leadData = {
    sellerId: agencyId,
    buyerId: "",
    vehicleId: body.vehicleId || null,
    conversationId: "",
    status: "new",
    source: "other",
    manualContact: {
      name,
      phone: body.phone?.trim() || null,
      email: body.email?.trim() || null,
      notes: body.notes?.trim() || null,
    },
    vehicleSnapshot,
    unreadCount: 0,
    messageCount: 0,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    lastMessageAt: FieldValue.serverTimestamp(),
  };

  const docRef = await adminDb.collection("leads").add(leadData);
  return Response.json({ id: docRef.id }, { status: 201 });
});
