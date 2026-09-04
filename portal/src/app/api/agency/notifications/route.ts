// portal/src/app/api/agency/notifications/route.ts
// GET -> "cosas que necesitan tu atención ahora", calculado en vivo a partir
// de leads/sales/stock existentes — no es un log de eventos persistido (eso
// requeriría escribir desde las Cloud Functions que ya mandan mail/push, un
// cambio de infra aparte). Se recalcula en cada request; el cliente hace
// polling liviano. Alimenta la campanita y el panel "Para hacer hoy" del
// dashboard. Categorías: leads nuevos, leads sin abrir/seguir, ofertas
// esperando respuesta, ventas sin confirmar, trámites por vencer, fichas de
// stock incompletas y autos parados en stock sin consultas.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { NotificationItem } from "@/lib/notifications";
import { AGENCY_ROLE_PERMISSIONS, canAccessCRM } from "@/lib/plans";
import { hasSection } from "@/lib/sections";

const DAY = 24 * 60 * 60 * 1000;
const LEAD_UNOPENED_DAYS = 1; // lead "new" sin abrir
const LEAD_FOLLOWUP_DAYS = 3; // lead "contacted" sin seguimiento (= STALE_FOLLOWUP_DAYS en /dashboard/leads)
const STOCK_STALE_DAYS = 45; // auto activo, sin consultas, hace mucho en stock
const STOCK_EXCLUDED_STATUSES = ["deleted", "rejected", "rejected_limit", "blocked", "sold", "reserved", "a_preparar", "pending_review"];

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

function toMillis(ts: unknown): number | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().getTime();
  return null;
}

function daysAgo(ms: number | null): number | null {
  return ms === null ? null : Math.floor((Date.now() - ms) / DAY);
}

function buyerLabel(snapshot: { firstName?: string; lastName?: string } | undefined, manual: { name?: string } | undefined) {
  return manual?.name || [snapshot?.firstName, snapshot?.lastName].filter(Boolean).join(" ") || "Comprador";
}

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const membership = await resolveMembership(uid);
  const { agencyId, role } = membership;
  if (!AGENCY_ROLE_PERMISSIONS[role].manageLeads) {
    return Response.json({ items: [] });
  }
  // Campanita compartida entre secciones (leads/ofertas, ventas pendientes
  // de confirmación, trámites de operación por vencer) — en vez de tapar
  // todo el endpoint por una sola sección, cada categoría se arma solo si
  // esta persona tiene la sección correspondiente.
  const hasLeads = hasSection(membership, "leads");
  const hasStock = hasSection(membership, "stock");
  const hasOperaciones = hasSection(membership, "operaciones");
  const hasEntreAgencias = hasSection(membership, "entreAgencias");
  // Silencioso a propósito (a diferencia de requireCRMAccess, que tira
  // error): esto es un poll de fondo para la campanita, no una página — un
  // plan sin CRM simplemente no tiene nada de leads/ofertas que mostrar acá.
  const ownerSnap = await adminDb.doc(`users/${agencyId}`).get();
  if (!canAccessCRM(ownerSnap.data()?.plan || "free")) {
    return Response.json({ items: [] });
  }

  const [allLeadsSnap, pendingSalesSnap, activeOperationsSnap, vehiclesSnap, unreadAsRequesterSnap, unreadAsResponderSnap] = await Promise.all([
    hasLeads ? adminDb.collection("leads").where("sellerId", "==", agencyId).get() : Promise.resolve(null),
    adminDb.collection("sales").where("sellerId", "==", agencyId).where("confirmedByBuyer", "==", null).get(),
    adminDb.collection("saleOperations").where("sellerId", "==", agencyId).where("status", "==", "en_curso").get(),
    hasStock ? adminDb.collection("vehicles").where("userId", "==", agencyId).get() : Promise.resolve(null),
    // Un solo where() por query (igual criterio que el resto de este
    // endpoint) — filtrar "unread > 0" en memoria evita tener que crear un
    // índice compuesto nuevo solo para esto.
    hasEntreAgencias ? adminDb.collection("agencyThreads").where("requesterAgencyId", "==", agencyId).get() : Promise.resolve(null),
    hasEntreAgencias ? adminDb.collection("agencyThreads").where("responderAgencyId", "==", agencyId).get() : Promise.resolve(null),
  ]);

  const items: NotificationItem[] = [];
  const leadDocs = allLeadsSnap?.docs.filter((d) => !d.data().deletedAt) ?? [];
  const vehicleIdsWithLead = new Set(leadDocs.map((d) => d.data().vehicleId).filter(Boolean));

  for (const d of leadDocs) {
    const data = d.data();
    if (data.status !== "new") continue;
    const veh = data.vehicleSnapshot;
    const carLabel = veh?.brand || veh?.model ? `${veh?.brand ?? ""} ${veh?.model ?? ""}`.trim() : "una publicación";
    const who = buyerLabel(data.buyerSnapshot, data.manualContact);
    const age = daysAgo(toMillis(data.createdAt));
    if (age !== null && age >= LEAD_UNOPENED_DAYS) {
      items.push({
        id: `lead_stale_${d.id}`,
        type: "lead_stale",
        title: `Lead sin abrir hace ${age} ${age === 1 ? "día" : "días"}`,
        subtitle: `${who} — ${carLabel}`,
        href: `/dashboard/leads/${d.id}`,
        at: toIso(data.createdAt),
      });
    } else {
      items.push({
        id: `new_lead_${d.id}`,
        type: "new_lead",
        title: data.source === "web" ? `Consulta web: ${who}` : `Nuevo lead: ${who}`,
        subtitle: `Consultó por ${carLabel}`,
        href: `/dashboard/leads/${d.id}`,
        at: toIso(data.createdAt),
      });
    }
  }

  // Leads en negociación/contactados sin seguimiento hace varios días.
  for (const d of leadDocs) {
    const data = d.data();
    if (data.status !== "contacted") continue;
    const days = daysAgo(toMillis(data.lastMessageAt));
    if (days === null || days < LEAD_FOLLOWUP_DAYS) continue;
    const veh = data.vehicleSnapshot;
    const carLabel = veh?.brand || veh?.model ? `${veh?.brand ?? ""} ${veh?.model ?? ""}`.trim() : "un auto";
    items.push({
      id: `lead_followup_${d.id}`,
      type: "lead_stale",
      title: `Sin seguimiento hace ${days} días`,
      subtitle: `${buyerLabel(data.buyerSnapshot, data.manualContact)} — ${carLabel}`,
      href: `/dashboard/leads/${d.id}`,
      at: toIso(data.lastMessageAt),
    });
  }

  // Ofertas formales esperando respuesta de la agencia.
  for (const d of leadDocs) {
    const data = d.data();
    if (data.offer?.status !== "pending") continue;
    const veh = data.vehicleSnapshot;
    const carLabel = veh?.brand || veh?.model ? `${veh?.brand ?? ""} ${veh?.model ?? ""}`.trim() : "un auto";
    items.push({
      id: `pending_offer_${d.id}`,
      type: "pending_offer",
      title: `Oferta por ${carLabel}`,
      subtitle: `${data.offer?.currency ?? ""} ${Number(data.offer?.amount ?? 0).toLocaleString("es-AR")} — esperando tu respuesta`,
      href: `/dashboard/leads/${d.id}`,
      at: toIso(data.offer?.createdAt) ?? toIso(data.lastMessageAt),
    });
  }

  // Stock: fichas incompletas + autos parados sin consultas.
  for (const d of vehiclesSnap?.docs ?? []) {
    const v = d.data();
    const status = v.status || "available";
    if (STOCK_EXCLUDED_STATUSES.includes(status)) continue;
    const carLabel = `${v.brand ?? ""} ${v.model ?? ""}`.trim() || "un auto";
    const cover = v.images?.cover ?? v.coverImage ?? v.cover ?? "";
    const priceOk = typeof v.price === "number" && v.price > 0;
    if (!cover || !priceOk) {
      items.push({
        id: `stock_incomplete_${d.id}`,
        type: "stock_incomplete",
        title: `Ficha incompleta: ${carLabel}`,
        subtitle: !cover && !priceOk ? "Falta foto de portada y precio." : !cover ? "Falta la foto de portada." : "Falta el precio.",
        href: `/dashboard/stock/${d.id}`,
        at: toIso(v.createdAt),
      });
      continue;
    }
    const daysInStock = daysAgo(toMillis(v.createdAt));
    if (daysInStock !== null && daysInStock >= STOCK_STALE_DAYS && !vehicleIdsWithLead.has(d.id)) {
      items.push({
        id: `stock_stale_${d.id}`,
        type: "stock_stale",
        title: `${carLabel}: ${daysInStock} días en stock`,
        subtitle: "Sin consultas todavía — ¿revisás el precio o las fotos?",
        href: `/dashboard/stock/${d.id}`,
        at: toIso(v.createdAt),
      });
    }
  }

  for (const d of hasStock ? pendingSalesSnap.docs : []) {
    const data = d.data();
    const veh = data.vehicleSnapshot;
    const carLabel = veh?.brand || veh?.model ? `${veh?.brand ?? ""} ${veh?.model ?? ""}`.trim() : "un auto";
    items.push({
      id: `pending_sale_${d.id}`,
      type: "pending_sale_confirmation",
      title: `Esperando confirmación de ${carLabel}`,
      subtitle: "El comprador todavía no confirmó que lo recibió.",
      href: `/dashboard/stock/${data.vehicleId}`,
      at: toIso(data.soldAt),
    });
  }

  // Trámites vencidos o por vencer — el checklist vive como array embebido
  // en la propia Operación (no una subcolección), así que se filtra en
  // memoria igual que el resto de este endpoint (un solo where() real).
  const DUE_SOON_DAYS = 3;
  const now = Date.now();
  const dueSoonThreshold = now + DUE_SOON_DAYS * 24 * 60 * 60 * 1000;

  for (const d of hasOperaciones ? activeOperationsSnap.docs : []) {
    const data = d.data();
    const checklist = (data.checklist ?? []) as {
      key: string;
      label: string;
      status: string;
      dueAt?: { toMillis?: () => number } | null;
    }[];
    const veh = data.vehicleSnapshot;
    const carLabel = veh?.brand || veh?.model ? `${veh?.brand ?? ""} ${veh?.model ?? ""}`.trim() : "un auto";

    for (const item of checklist) {
      if (item.status !== "pendiente" || !item.dueAt?.toMillis) continue;
      const dueMillis = item.dueAt.toMillis();
      if (dueMillis > dueSoonThreshold) continue;
      const overdue = dueMillis < now;
      items.push({
        id: `checklist_due_${d.id}_${item.key}`,
        type: "checklist_due",
        title: overdue ? `Vencido: ${item.label}` : `Vence pronto: ${item.label}`,
        subtitle: `${carLabel} — ${new Date(dueMillis).toLocaleDateString("es-AR")}`,
        href: `/dashboard/operaciones/${d.id}`,
        at: new Date(dueMillis).toISOString(),
      });
    }
  }

  // Mensajes sin leer de "Entre agencias" — el mismo GET de mensajes del
  // hilo (agency-threads/[id]/messages/route.ts) ya pone unreadByX en 0 al
  // abrirlo, así que apenas se lee el hilo esto deja de aparecer solo, sin
  // necesitar un estado de "notificación leída" aparte.
  for (const d of unreadAsRequesterSnap?.docs ?? []) {
    const data = d.data();
    if (!((data.unreadByRequester ?? 0) > 0)) continue;
    items.push({
      id: `agency_thread_${d.id}`,
      type: "agency_thread_message",
      title: `${data.responderAgencyName ?? "Una agencia"} te escribió`,
      subtitle: data.lastMessage || `Sobre tu pedido de ${data.requestSummary?.brand ?? ""} ${data.requestSummary?.model ?? ""}`.trim(),
      href: "/dashboard/entre-agencias?tab=threads",
      at: toIso(data.lastMessageAt),
    });
  }
  for (const d of unreadAsResponderSnap?.docs ?? []) {
    const data = d.data();
    if (!((data.unreadByResponder ?? 0) > 0)) continue;
    items.push({
      id: `agency_thread_${d.id}`,
      type: "agency_thread_message",
      title: `${data.requesterAgencyName ?? "Una agencia"} te escribió`,
      subtitle: data.lastMessage || `Sobre el pedido de ${data.requestSummary?.brand ?? ""} ${data.requestSummary?.model ?? ""}`.trim(),
      href: "/dashboard/entre-agencias?tab=threads",
      at: toIso(data.lastMessageAt),
    });
  }

  items.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  // Tope por tipo: que una agencia con 20 fichas incompletas no tape todo lo
  // demás. Los tipos "urgentes" (ofertas, ventas, trámites) no se topean.
  const PER_TYPE_CAP: Partial<Record<NotificationItem["type"], number>> = {
    new_lead: 8,
    lead_stale: 6,
    stock_incomplete: 4,
    stock_stale: 4,
  };
  const seen: Partial<Record<string, number>> = {};
  const capped = items.filter((it) => {
    const cap = PER_TYPE_CAP[it.type];
    if (cap === undefined) return true;
    seen[it.type] = (seen[it.type] ?? 0) + 1;
    return seen[it.type]! <= cap;
  });

  return Response.json({ items: capped.slice(0, 20) });
});
