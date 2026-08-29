// portal/src/app/api/agency/agency-threads/[id]/messages/route.ts
// GET/POST -> mensajes de un hilo de "Entre agencias". A diferencia de los
// mensajes de leads (donde senderId siempre es el uid del dueño de la
// agencia, para que el comprador vea una sola identidad), acá SÍ importa
// distinguir qué agencia mandó cada mensaje, así que senderId es
// literalmente el agencyId de quien escribe (requesterAgencyId o
// responderAgencyId, nunca el uid del miembro de equipo logueado — mismo
// criterio de "una sola voz por agencia").
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { requireCRMAccess, resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { sendNotificationEmail } from "@/lib/notify-mail";
import { sendPushNotification } from "@/lib/notify-push";
import { hasSection } from "@/lib/sections";
import { FieldValue } from "firebase-admin/firestore";

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

async function loadMyThread(agencyId: string, id: string) {
  const ref = adminDb.doc(`agencyThreads/${id}`);
  const snap = await ref.get();
  if (!snap.exists) return { ref, thread: null, myRole: null as "requester" | "responder" | null };
  const thread = snap.data()!;
  if (thread.requesterAgencyId === agencyId) return { ref, thread, myRole: "requester" as const };
  if (thread.responderAgencyId === agencyId) return { ref, thread, myRole: "responder" as const };
  return { ref, thread: null, myRole: null };
}

export const GET = withApiErrors(async (request, ctx: RouteContext<"/api/agency/agency-threads/[id]/messages">) => {
  const uid = await requireUid(request);
  const membership = await resolveMembership(uid);
  const { agencyId } = membership;
  if (!hasSection(membership, "entreAgencias")) {
    return Response.json({ error: "No tenés acceso a esta sección." }, { status: 403 });
  }
  await requireCRMAccess(agencyId);

  const { id } = await ctx.params;
  const { ref, thread, myRole } = await loadMyThread(agencyId, id);
  if (!thread || !myRole) return Response.json({ error: "No encontrado" }, { status: 404 });

  const snap = await ref.collection("messages").orderBy("createdAt", "asc").get();
  const messages = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      senderId: data.senderId,
      text: data.text,
      createdAt: toIso(data.createdAt),
      isMe: data.senderId === agencyId,
    };
  });

  // Marca como leído del lado de quien consulta.
  const unreadField = myRole === "requester" ? "unreadByRequester" : "unreadByResponder";
  if ((thread[unreadField] ?? 0) > 0) {
    await ref.update({ [unreadField]: 0 });
  }

  return Response.json({ messages, thread: { ...thread, id } });
});

export const POST = withApiErrors(async (request, ctx: RouteContext<"/api/agency/agency-threads/[id]/messages">) => {
  const uid = await requireUid(request);
  const membership = await resolveMembership(uid);
  const { agencyId } = membership;
  if (!hasSection(membership, "entreAgencias")) {
    return Response.json({ error: "No tenés acceso a esta sección." }, { status: 403 });
  }
  await requireCRMAccess(agencyId);

  const { id } = await ctx.params;
  const { ref, thread, myRole } = await loadMyThread(agencyId, id);
  if (!thread || !myRole) return Response.json({ error: "No encontrado" }, { status: 404 });

  const body = await request.json();
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "El mensaje no puede estar vacío." }, { status: 400 });

  const now = FieldValue.serverTimestamp();
  await ref.collection("messages").add({ senderId: agencyId, text, createdAt: now });

  const otherUnreadField = myRole === "requester" ? "unreadByResponder" : "unreadByRequester";
  const otherAgencyId = myRole === "requester" ? thread.responderAgencyId : thread.requesterAgencyId;
  const myAgencyName = myRole === "requester" ? thread.requesterAgencyName : thread.responderAgencyName;
  await ref.update({
    lastMessage: text,
    lastMessageAt: now,
    lastSenderId: agencyId,
    [otherUnreadField]: FieldValue.increment(1),
  });

  const ctaLink = `https://portal.matchcars.app/dashboard/entre-agencias`;
  sendNotificationEmail("agency_thread_message", {
    recipientUid: otherAgencyId,
    senderName: myAgencyName ?? "Una agencia",
    messagePreview: text.slice(0, 140),
    ctaLink,
  }).catch(() => {});
  adminDb
    .doc(`users/${otherAgencyId}`)
    .get()
    .then((s) => {
      const pushToken = s.data()?.pushToken;
      if (pushToken) {
        sendPushNotification(pushToken, `${myAgencyName ?? "Una agencia"} te escribió`, text.slice(0, 140), {}).catch(() => {});
      }
    })
    .catch(() => {});

  return Response.json({ ok: true }, { status: 201 });
});
