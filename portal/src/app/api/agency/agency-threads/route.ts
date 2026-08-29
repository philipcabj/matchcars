// portal/src/app/api/agency/agency-threads/route.ts
// GET -> mis hilos de "Entre agencias", como quien pidió o como quien
// respondió — dos queries (Firestore no puede hacer un OR sobre dos
// campos distintos) combinadas en memoria.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { requireCRMAccess, resolveMembership } from "@/lib/agency-server";
import { AgencyThread } from "@/lib/agency-requests";
import { adminDb } from "@/lib/firebase-admin";
import { hasSection } from "@/lib/sections";

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

function serializeThread(id: string, data: FirebaseFirestore.DocumentData, myRole: "requester" | "responder"): AgencyThread {
  return {
    id,
    requestId: data.requestId,
    requesterAgencyId: data.requesterAgencyId,
    requesterAgencyName: data.requesterAgencyName ?? "Agencia",
    responderAgencyId: data.responderAgencyId,
    responderAgencyName: data.responderAgencyName ?? "Agencia",
    vehicleId: data.vehicleId ?? null,
    requestSummary: data.requestSummary,
    status: data.status === "closed" ? "closed" : "open",
    lastMessage: data.lastMessage ?? null,
    lastMessageAt: toIso(data.lastMessageAt),
    lastSenderId: data.lastSenderId ?? null,
    unreadByRequester: data.unreadByRequester ?? 0,
    unreadByResponder: data.unreadByResponder ?? 0,
    createdAt: toIso(data.createdAt),
    myRole,
    otherAgencyName: myRole === "requester" ? data.responderAgencyName ?? "Agencia" : data.requesterAgencyName ?? "Agencia",
    unreadForMe: myRole === "requester" ? data.unreadByRequester ?? 0 : data.unreadByResponder ?? 0,
  };
}

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const membership = await resolveMembership(uid);
  const { agencyId } = membership;
  if (!hasSection(membership, "entreAgencias")) {
    return Response.json({ error: "No tenés acceso a esta sección." }, { status: 403 });
  }
  await requireCRMAccess(agencyId);

  const [asRequesterSnap, asResponderSnap] = await Promise.all([
    adminDb.collection("agencyThreads").where("requesterAgencyId", "==", agencyId).get(),
    adminDb.collection("agencyThreads").where("responderAgencyId", "==", agencyId).get(),
  ]);

  const threads: AgencyThread[] = [
    ...asRequesterSnap.docs.map((d) => serializeThread(d.id, d.data(), "requester")),
    ...asResponderSnap.docs.map((d) => serializeThread(d.id, d.data(), "responder")),
  ];

  threads.sort((a, b) => (b.lastMessageAt ?? b.createdAt ?? "").localeCompare(a.lastMessageAt ?? a.createdAt ?? ""));

  return Response.json({ threads });
});
