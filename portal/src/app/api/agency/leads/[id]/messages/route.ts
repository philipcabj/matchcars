// portal/src/app/api/agency/leads/[id]/messages/route.ts
// GET  -> hilo de conversación real de un lead orgánico (conversations/{id}/messages,
//         mismo shape que ya escribe la app en app/(screens)/chat/[uid].tsx).
// POST -> responde como la agencia. El senderId del mensaje es siempre lead.sellerId
//         (el uid dueño de la agencia), nunca el uid del miembro de equipo logueado —
//         así el comprador ve la respuesta como viniendo del mismo vendedor con el
//         que ya venía hablando en la app. Espeja syncLeadOnMessage (rama "seller
//         responde") de chat/[uid].tsx: contacted+contactedAt si el lead estaba "new",
//         y actualiza lastMessage/lastMessageAt/lastSenderId/messageCount/unreadCount.
//
// Leads manuales (sin conversationId, cargados a mano desde el portal) no tienen
// hilo de chat — no aplica.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { requireCRMAccess, resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_PERMISSIONS } from "@/lib/plans";
import { hasSection } from "@/lib/sections";
import { FieldValue } from "firebase-admin/firestore";

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

async function loadOwnedLead(agencyId: string, id: string) {
  const ref = adminDb.doc(`leads/${id}`);
  const snap = await ref.get();
  if (!snap.exists) return { ref, lead: null };
  const lead = snap.data()!;
  if (lead.sellerId !== agencyId) return { ref, lead: null };
  return { ref, lead };
}

export const GET = withApiErrors(async (request, ctx: RouteContext<"/api/agency/leads/[id]/messages">) => {
  const uid = await requireUid(request);
  const membership = await resolveMembership(uid);
  const { agencyId, role } = membership;
  if (!AGENCY_ROLE_PERMISSIONS[role].manageLeads || !hasSection(membership, "leads")) {
    return Response.json({ error: "Tu rol no tiene permiso para ver los leads." }, { status: 403 });
  }
  await requireCRMAccess(agencyId);

  const { id } = await ctx.params;
  const { lead } = await loadOwnedLead(agencyId, id);
  if (!lead) return Response.json({ error: "No encontrado" }, { status: 404 });
  if (!lead.conversationId) return Response.json({ messages: [] });

  const snap = await adminDb
    .collection(`conversations/${lead.conversationId}/messages`)
    .orderBy("createdAt", "asc")
    .get();

  const messages = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      senderId: data.senderId,
      text: data.text,
      createdAt: toIso(data.createdAt),
      isAgency: data.senderId === lead.sellerId,
    };
  });

  return Response.json({ messages });
});

export const POST = withApiErrors(async (request, ctx: RouteContext<"/api/agency/leads/[id]/messages">) => {
  const uid = await requireUid(request);
  const membership = await resolveMembership(uid);
  const { agencyId, role } = membership;
  if (!AGENCY_ROLE_PERMISSIONS[role].manageLeads || !hasSection(membership, "leads")) {
    return Response.json({ error: "Tu rol no tiene permiso para gestionar leads." }, { status: 403 });
  }
  await requireCRMAccess(agencyId);

  const { id } = await ctx.params;
  const { ref, lead } = await loadOwnedLead(agencyId, id);
  if (!lead) return Response.json({ error: "No encontrado" }, { status: 404 });
  if (!lead.conversationId) {
    return Response.json({ error: "Este lead no tiene una conversación de la app (es un lead cargado a mano)." }, { status: 400 });
  }

  const body = await request.json();
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "El mensaje no puede estar vacío." }, { status: 400 });

  const now = FieldValue.serverTimestamp();
  await adminDb.collection(`conversations/${lead.conversationId}/messages`).add({
    senderId: lead.sellerId,
    text,
    createdAt: now,
  });
  await adminDb.doc(`conversations/${lead.conversationId}`).set(
    { lastMessage: text, lastSenderId: lead.sellerId, updatedAt: now },
    { merge: true }
  );

  const leadUpdates: Record<string, unknown> = {
    lastMessage: text,
    lastMessageAt: now,
    lastSenderId: lead.sellerId,
    messageCount: FieldValue.increment(1),
    unreadCount: 0,
  };
  if (lead.status === "new") {
    leadUpdates.status = "contacted";
    if (!lead.contactedAt) leadUpdates.contactedAt = now;
  }
  await ref.update(leadUpdates);

  return Response.json({ ok: true }, { status: 201 });
});
