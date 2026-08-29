// portal/src/app/api/agency/agency-requests/[id]/respond/route.ts
// POST -> "Tengo uno" — abre (o reusa, si ya existía) el hilo privado entre
// la agencia que responde y la que publicó el pedido, e incrementa
// responseCount. Uno por par pedido+agencia-que-responde (dos agencias
// distintas respondiendo al mismo pedido tienen cada una su propio hilo,
// no es grupal).
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { requireCRMAccess, resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { sendNotificationEmail } from "@/lib/notify-mail";
import { sendPushNotification } from "@/lib/notify-push";
import { hasSection } from "@/lib/sections";
import { FieldValue } from "firebase-admin/firestore";

export const POST = withApiErrors(async (request, ctx: RouteContext<"/api/agency/agency-requests/[id]/respond">) => {
  const uid = await requireUid(request);
  const membership = await resolveMembership(uid);
  const { agencyId } = membership;
  if (!hasSection(membership, "entreAgencias")) {
    return Response.json({ error: "No tenés acceso a esta sección." }, { status: 403 });
  }
  await requireCRMAccess(agencyId);

  const { id: requestId } = await ctx.params;
  const reqSnap = await adminDb.doc(`agencyRequests/${requestId}`).get();
  if (!reqSnap.exists) return Response.json({ error: "No encontrado" }, { status: 404 });
  const req = reqSnap.data()!;
  if (req.agencyId === agencyId) {
    return Response.json({ error: "No podés responder tu propio pedido." }, { status: 400 });
  }
  if (req.status === "closed") {
    return Response.json({ error: "Este pedido ya está cerrado." }, { status: 400 });
  }

  const existingSnap = await adminDb
    .collection("agencyThreads")
    .where("requestId", "==", requestId)
    .where("responderAgencyId", "==", agencyId)
    .limit(1)
    .get();
  if (!existingSnap.empty) {
    return Response.json({ id: existingSnap.docs[0].id, alreadyExisted: true });
  }

  const body = await request.json().catch(() => ({}));
  const vehicleId = typeof body.vehicleId === "string" && body.vehicleId ? body.vehicleId : null;

  const ownerSnap = await adminDb.doc(`users/${agencyId}`).get();
  const ownerData = ownerSnap.data() ?? {};
  const responderAgencyName = ownerData.agencyName || ownerData.displayName || ownerData.email || "Agencia";

  const now = FieldValue.serverTimestamp();
  const threadRef = await adminDb.collection("agencyThreads").add({
    requestId,
    requesterAgencyId: req.agencyId,
    requesterAgencyName: req.agencyName ?? "Agencia",
    responderAgencyId: agencyId,
    responderAgencyName,
    vehicleId,
    requestSummary: {
      brand: req.brand ?? "",
      model: req.model ?? "",
      yearMin: req.yearMin ?? null,
      yearMax: req.yearMax ?? null,
      priceMax: req.priceMax ?? null,
      currency: req.currency === "USD" ? "USD" : "ARS",
    },
    status: "open",
    lastMessage: null,
    lastMessageAt: null,
    lastSenderId: null,
    unreadByRequester: 0,
    unreadByResponder: 0,
    createdAt: now,
  });

  await adminDb.doc(`agencyRequests/${requestId}`).update({ responseCount: FieldValue.increment(1) });

  const carLabel = `${req.brand ?? ""} ${req.model ?? ""}`.trim() || "tu pedido";
  const ctaLink = `https://portal.matchcars.app/dashboard/entre-agencias`;
  sendNotificationEmail("agency_request_response", {
    recipientUid: req.agencyId,
    senderName: responderAgencyName,
    carModel: carLabel,
    ctaLink,
  }).catch(() => {});
  adminDb
    .doc(`users/${req.agencyId}`)
    .get()
    .then((s) => {
      const pushToken = s.data()?.pushToken;
      if (pushToken) {
        sendPushNotification(pushToken, "Te respondieron un pedido", `${responderAgencyName} tiene un auto para tu pedido de ${carLabel}.`, {}).catch(
          () => {}
        );
      }
    })
    .catch(() => {});

  return Response.json({ id: threadRef.id, alreadyExisted: false }, { status: 201 });
});
