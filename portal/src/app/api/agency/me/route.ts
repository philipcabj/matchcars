// portal/src/app/api/agency/me/route.ts
// GET /api/agency/me
// Devuelve la agencia (a la que pertenece el uid autenticado, sea dueño o
// miembro invitado), plan, uso vs. límites, equipo y mis permisos ahí.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_PERMISSIONS, canAccessCRM, getIncludedSeats, getMaxCars, getPlanFeatures, getPlanLabel } from "@/lib/plans";

const EXCLUDED_STATUSES = ["deleted", "rejected", "rejected_limit", "blocked", "sold", "a_preparar"];

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const { agencyId, role: myRole } = await resolveMembership(uid);

  // Datos de plan/nombre/logo viven en la cuenta del dueño (agencyId), no en la
  // del miembro que consulta — un vendedor invitado no tiene plan propio.
  const ownerUserSnap = await adminDb.doc(`users/${agencyId}`).get();
  if (!ownerUserSnap.exists) {
    return Response.json({ error: "Agencia no encontrada" }, { status: 404 });
  }
  const ownerData = ownerUserSnap.data() ?? {};
  const plan: string = ownerData.plan || "free";

  const [agencySnap, membersSnap, vehiclesSnap, pendingInvitesSnap, leadsSnap] = await Promise.all([
    adminDb.doc(`agencies/${agencyId}`).get(),
    adminDb.collection(`agencies/${agencyId}/members`).get(),
    adminDb.collection("vehicles").where("userId", "==", agencyId).get(),
    adminDb.collection("agencyInvites").where("agencyId", "==", agencyId).where("status", "==", "pending").get(),
    adminDb.collection("leads").where("sellerId", "==", agencyId).get(),
  ]);

  // Suma de mensajes sin leer en todos los leads — para el punto rojo de
  // "Leads" en el sidebar (Sidebar.tsx ya llama a este endpoint vía
  // useAgencyMe, así que no hace falta un fetch aparte).
  const unreadLeadsCount = leadsSnap.docs.reduce((sum, d) => sum + (d.data().unreadCount || 0), 0);
  // Cantidad total (no el detalle) — se muestra igual sin CRM, como gancho
  // de upgrade ("tenés 3 consultas esperando") en vez de una sección vacía
  // que no explica por qué no hay nada. Es la misma query de arriba, ya
  // corre para cualquier plan — no cuesta nada extra exponer el total.
  const leadsCount = leadsSnap.docs.length;

  const pendingInvites = pendingInvitesSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      email: data.email,
      role: data.role,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
    };
  });

  const activeVehicles = vehiclesSnap.docs.filter((d) => {
    const status = d.data().status || "available";
    return !EXCLUDED_STATUSES.includes(status);
  }).length;

  const explicitMembers = membersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  const ownerAlreadyListed = explicitMembers.some((m) => m.uid === agencyId);
  const members = ownerAlreadyListed
    ? explicitMembers
    : [
        {
          uid: agencyId,
          role: "owner",
          email: ownerData.email ?? null,
          // Nombre y apellido de la persona, no el nombre comercial de la
          // agencia (ese ya se ve arriba, en el header) — importante sobre
          // todo para el selector de "quién sigue este lead".
          name:
            `${ownerData.firstName ?? ""} ${ownerData.lastName ?? ""}`.trim() ||
            ownerData.displayName ||
            ownerData.agencyName ||
            ownerData.email ||
            "Dueño/a",
          isImplicitOwner: true, // Todavía no tiene doc propio en /members — es normal en v1.
        },
        ...explicitMembers,
      ];

  const maxCars = getMaxCars(plan);
  const includedSeats = getIncludedSeats(plan);

  return Response.json({
    agencyId,
    agencyExists: agencySnap.exists,
    agencyName: ownerData.agencyName || ownerData.displayName || ownerData.email || "Mi agencia",
    // logoUrl es el logo propio que carga la agencia (edit-profile.tsx); photoURL es el
    // avatar genérico de cuenta. Preferimos el logo cuando existe, como hace la app.
    avatarUrl: ownerData.logoUrl || ownerData.photoURL || null,
    plan,
    planLabel: getPlanLabel(plan),
    isDealerPlan: /pro_dealer|dealer_pro_plus/.test(plan),
    hasCRM: canAccessCRM(plan),
    features: getPlanFeatures(plan),
    usage: {
      vehicles: { used: activeVehicles, limit: Number.isFinite(maxCars) ? maxCars : null },
      seats: { used: members.length + pendingInvites.length, limit: includedSeats },
    },
    members,
    pendingInvites,
    unreadLeadsCount,
    leadsCount,
    myUid: uid,
    myRole,
    myPermissions: AGENCY_ROLE_PERMISSIONS[myRole],
  });
});
