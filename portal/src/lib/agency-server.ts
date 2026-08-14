// portal/src/lib/agency-server.ts
// Resuelve "a qué agencia pertenece este uid" — necesario porque un miembro de
// equipo invitado (no dueño) tiene su propio uid de Firebase Auth, distinto del
// agencyId (que sigue siendo uid del dueño, ver firestore.rules/plans.ts).
//
// Modelo: /agencyMemberships/{uid} -> { agencyId, role } es un índice inverso
// que se escribe junto con /agencies/{agencyId}/members/{uid} al invitar a
// alguien (server.ts en team/route.ts). Si no existe, el uid es dueño de su
// propia agencia (agencyId == uid) — el caso por defecto de hoy, sin invitar
// a nadie todavía.
import "server-only";

import { ApiAuthError } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { AgencyRole, canAccessCRM } from "@/lib/plans";

export interface AgencyMembership {
  agencyId: string;
  role: AgencyRole;
}

export async function resolveMembership(uid: string): Promise<AgencyMembership> {
  const membershipSnap = await adminDb.doc(`agencyMemberships/${uid}`).get();
  if (membershipSnap.exists) {
    const data = membershipSnap.data()!;
    return { agencyId: data.agencyId, role: data.role };
  }
  return { agencyId: uid, role: "owner" };
}

// El CRM de Leads es una feature de plan (canAccessCRM en plans.ts: Pro Plus
// en adelante), no de rol — AGENCY_ROLE_PERMISSIONS.manageLeads solo dice
// QUIÉN dentro de la agencia puede usarlo, no SI la agencia lo tiene
// contratado. Sin este chequeo, cualquier plan (incluido gratis) podía usar
// el CRM completo desde el portal aunque getPlanFeatures() lo muestre como
// exclusivo — gap real, no a propósito.
export async function requireCRMAccess(agencyId: string): Promise<string> {
  const snap = await adminDb.doc(`users/${agencyId}`).get();
  const plan: string = snap.data()?.plan || "free";
  if (!canAccessCRM(plan)) {
    throw new ApiAuthError("El CRM de Leads está disponible desde el plan Pro Plus.", 403);
  }
  return plan;
}
