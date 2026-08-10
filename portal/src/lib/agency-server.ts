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

import { adminDb } from "@/lib/firebase-admin";
import { AgencyRole } from "@/lib/plans";

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
