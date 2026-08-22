// portal/src/lib/activity-log.ts
// Registro de actividad del equipo — quién hizo qué y cuándo, para agencias
// con más de un usuario ("¿quién tocó esto?"). Vive en
// agencies/{agencyId}/activity/{id}, aparte de cada entidad (vehicle/lead/
// operation) para poder listarlo todo junto ordenado por fecha con una sola
// query, en vez de tener que ir entidad por entidad.
//
// A propósito NO registra absolutamente todo (ej. cada tilde de un ítem del
// checklist sería demasiado ruido) — solo eventos que cambian algo que le
// importa al resto del equipo: precio, estado de un lead/operación,
// visibilidad de una publicación, y altas/bajas/cambios de rol del equipo.
import "server-only";

import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export type ActivityEntityType = "vehicle" | "lead" | "operation" | "team";

export interface LogActivityParams {
  agencyId: string;
  actorUid: string;
  entityType: ActivityEntityType;
  entityId: string;
  summary: string;
}

// Resuelve el nombre a mostrar del actor una sola vez acá, así cada call
// site no tiene que repetir la lógica de "nombre o email o uid".
async function resolveActorName(uid: string): Promise<string> {
  const snap = await adminDb.doc(`users/${uid}`).get();
  const data = snap.data();
  if (!data) return uid;
  return (
    `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() ||
    data.displayName ||
    data.agencyName ||
    data.email ||
    uid
  );
}

// No lanza si falla — un evento de auditoría que no se pudo escribir no debe
// hacer fallar la acción real del usuario (cambiar un precio, mover un lead).
export async function logActivity({ agencyId, actorUid, entityType, entityId, summary }: LogActivityParams): Promise<void> {
  try {
    const actorName = await resolveActorName(actorUid);
    await adminDb.collection(`agencies/${agencyId}/activity`).add({
      actorUid,
      actorName,
      entityType,
      entityId,
      summary,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error("[logActivity] no se pudo registrar", e);
  }
}
