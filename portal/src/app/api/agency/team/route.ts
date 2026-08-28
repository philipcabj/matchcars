// portal/src/app/api/agency/team/route.ts
// POST -> si el email ya tiene cuenta en Matchcars, la suma directo como
// miembro (comportamiento original). Si no tiene cuenta todavía, crea una
// invitación pendiente (agencyInvites/) y le manda un mail con un link para
// aceptarla y crear su cuenta (ver /invite/[id] y /api/invite/[id]/accept).
// En ambos casos respeta los asientos del plan (miembros + invitaciones
// pendientes cuentan contra `includedSeats`).
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { logActivity } from "@/lib/activity-log";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { sendNotificationEmail } from "@/lib/notify-mail";
import { AGENCY_ROLE_LABELS, AGENCY_ROLE_PERMISSIONS, AgencyRole, getIncludedSeats } from "@/lib/plans";
import { defaultSectionsForNewMember, sanitizeSections } from "@/lib/sections";
import { FieldValue } from "firebase-admin/firestore";

const VALID_ROLES: AgencyRole[] = ["owner", "manager", "sales"];
const INVITE_TTL_DAYS = 7;

export const POST = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const { agencyId, role: myRole } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[myRole].manageTeam) {
    return Response.json({ error: "Tu rol no tiene permiso para gestionar el equipo." }, { status: 403 });
  }

  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const role: AgencyRole = VALID_ROLES.includes(body.role) ? body.role : "sales";
  if (!email) return Response.json({ error: "Falta el email." }, { status: 400 });
  if (role === "owner") return Response.json({ error: "No se puede asignar el rol 'Dueño/a' a un miembro." }, { status: 400 });
  const sections = sanitizeSections(body.sections) ?? defaultSectionsForNewMember(role);

  const ownerSnap = await adminDb.doc(`users/${agencyId}`).get();
  const ownerData = ownerSnap.data() ?? {};
  const plan: string = ownerData.plan || "free";
  const includedSeats = getIncludedSeats(plan);
  const inviterName = ownerData.agencyName || ownerData.displayName || ownerData.email || "Tu agencia";

  const [membersSnap, pendingInvitesSnap, targetSnap] = await Promise.all([
    adminDb.collection(`agencies/${agencyId}/members`).get(),
    adminDb.collection("agencyInvites").where("agencyId", "==", agencyId).where("status", "==", "pending").get(),
    adminDb.collection("users").where("email", "==", email).limit(1).get(),
  ]);

  // +1 porque el dueño cuenta como un asiento aunque no tenga doc explícito en /members.
  const currentSeatsUsed =
    (membersSnap.docs.some((d) => d.id === agencyId) ? membersSnap.size : membersSnap.size + 1) + pendingInvitesSnap.size;
  if (currentSeatsUsed >= includedSeats) {
    return Response.json(
      { error: `Tu plan incluye hasta ${includedSeats} usuario${includedSeats === 1 ? "" : "s"} de equipo. Actualizá tu plan para sumar más.` },
      { status: 400 }
    );
  }

  // Camino 1: la cuenta ya existe -> se suma directo, como antes.
  if (!targetSnap.empty) {
    const targetDoc = targetSnap.docs[0];
    const targetUid = targetDoc.id;

    if (targetUid === agencyId) {
      return Response.json({ error: "Esa cuenta ya es la dueña de la agencia." }, { status: 400 });
    }
    if (membersSnap.docs.some((d) => d.id === targetUid)) {
      return Response.json({ error: "Esa persona ya es parte del equipo." }, { status: 400 });
    }

    const targetData = targetDoc.data();
    const memberData = {
      role,
      sections,
      email,
      // Nombre y apellido de la persona primero — agencyName es su nombre
      // comercial (si lo tiene), no quién es, y confunde en listas de equipo.
      name:
        `${targetData.firstName ?? ""} ${targetData.lastName ?? ""}`.trim() ||
        targetData.displayName ||
        targetData.agencyName ||
        email,
      addedAt: FieldValue.serverTimestamp(),
      addedBy: uid,
    };

    await Promise.all([
      adminDb.doc(`agencies/${agencyId}`).set({ updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      adminDb.doc(`agencies/${agencyId}/members/${targetUid}`).set(memberData),
      adminDb.doc(`agencyMemberships/${targetUid}`).set({ agencyId, role, sections }),
    ]);

    await logActivity({
      agencyId,
      actorUid: uid,
      entityType: "team",
      entityId: targetUid,
      summary: `Sumó a ${memberData.name} al equipo como ${AGENCY_ROLE_LABELS[role]}`,
    });

    return Response.json({ ok: true, invited: false, uid: targetUid }, { status: 201 });
  }

  // Camino 2: no tiene cuenta -> invitación pendiente por email.
  if (pendingInvitesSnap.docs.some((d) => d.data().email === email)) {
    return Response.json({ error: "Ya hay una invitación pendiente para ese email." }, { status: 400 });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const inviteRef = await adminDb.collection("agencyInvites").add({
    agencyId,
    agencyName: inviterName,
    email,
    role,
    sections,
    invitedBy: uid,
    invitedByName: inviterName,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  await sendNotificationEmail("team_invite", {
    recipientEmail: email,
    senderName: inviterName,
    agencyName: inviterName,
    roleLabel: AGENCY_ROLE_LABELS[role],
    ctaLink: `${siteUrl}/invite/${inviteRef.id}`,
  });

  await logActivity({
    agencyId,
    actorUid: uid,
    entityType: "team",
    entityId: inviteRef.id,
    summary: `Invitó a ${email} al equipo como ${AGENCY_ROLE_LABELS[role]}`,
  });

  return Response.json({ ok: true, invited: true, inviteId: inviteRef.id }, { status: 201 });
});
