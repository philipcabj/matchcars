// portal/src/app/api/invite/[id]/accept/route.ts
// POST -> acepta una invitación. Requiere estar logueado (recién registrado
// o con una cuenta ya existente) — valida que el email de esa cuenta
// coincida con el de la invitación antes de sumarlo al equipo, para que
// nadie pueda "aceptar" una invitación ajena con otra cuenta.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";
import { sanitizeSections } from "@/lib/sections";
import { FieldValue } from "firebase-admin/firestore";

export const POST = withApiErrors(async (request, ctx: RouteContext<"/api/invite/[id]/accept">) => {
  const uid = await requireUid(request);
  const { id } = await ctx.params;

  const [inviteSnap, userSnap] = await Promise.all([adminDb.doc(`agencyInvites/${id}`).get(), adminDb.doc(`users/${uid}`).get()]);

  if (!inviteSnap.exists) return Response.json({ error: "Invitación no encontrada." }, { status: 404 });
  const invite = inviteSnap.data()!;
  if (invite.status !== "pending") return Response.json({ error: "Esta invitación ya no está disponible." }, { status: 400 });

  const expiresAt: Date | null = invite.expiresAt?.toDate ? invite.expiresAt.toDate() : invite.expiresAt ? new Date(invite.expiresAt) : null;
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    return Response.json({ error: "Esta invitación venció." }, { status: 400 });
  }

  const myEmail = String(userSnap.data()?.email || "").trim().toLowerCase();
  if (!myEmail || myEmail !== String(invite.email).trim().toLowerCase()) {
    return Response.json({ error: "Esta invitación es para otra dirección de email." }, { status: 403 });
  }

  const { agencyId, role } = invite;
  const sections = sanitizeSections(invite.sections);
  if (uid === agencyId) {
    return Response.json({ error: "Ya sos el dueño/a de esa agencia." }, { status: 400 });
  }

  const existingMember = await adminDb.doc(`agencies/${agencyId}/members/${uid}`).get();
  if (existingMember.exists) {
    await inviteSnap.ref.update({ status: "accepted", acceptedAt: FieldValue.serverTimestamp(), acceptedUid: uid });
    return Response.json({ ok: true, agencyId });
  }

  const memberData = {
    role,
    sections,
    email: myEmail,
    name: userSnap.data()?.displayName || `${userSnap.data()?.firstName ?? ""} ${userSnap.data()?.lastName ?? ""}`.trim() || myEmail,
    addedAt: FieldValue.serverTimestamp(),
    addedBy: invite.invitedBy,
  };

  await Promise.all([
    adminDb.doc(`agencies/${agencyId}`).set({ updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    adminDb.doc(`agencies/${agencyId}/members/${uid}`).set(memberData),
    adminDb.doc(`agencyMemberships/${uid}`).set({ agencyId, role, sections }),
    inviteSnap.ref.update({ status: "accepted", acceptedAt: FieldValue.serverTimestamp(), acceptedUid: uid }),
  ]);

  return Response.json({ ok: true, agencyId });
});
