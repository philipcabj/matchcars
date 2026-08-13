// portal/src/lib/api-auth.ts
import "server-only";

import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { NextRequest } from "next/server";

export class ApiAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Verifica el Authorization: Bearer <idToken> de un request. Tira ApiAuthError si falla. */
export async function requireUid(request: NextRequest): Promise<string> {
  const authHeader = request.headers.get("authorization");
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) throw new ApiAuthError("No autenticado", 401);

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    throw new ApiAuthError("Token inválido o expirado", 401);
  }
}

export type PlatformRole = "admin" | "moderator";

// Rol de plataforma (users/{uid}.role) — sin relación con AgencyRole (owner/
// manager/sales), que es el rol dentro de UNA agencia. Este es el mismo
// campo que usa la app en AuthContext (profile.role) para el panel de
// administración global (app/(admin)/_layout.tsx: admin o moderator). El
// Admin SDK bypassea firestore.rules, así que la app NO puede confiar en
// las security rules acá — el chequeo de rol tiene que hacerse a mano en
// cada route handler, por eso este helper.
export async function requireAdminRole(request: NextRequest): Promise<{ uid: string; role: PlatformRole }> {
  const uid = await requireUid(request);
  const snap = await adminDb.doc(`users/${uid}`).get();
  const role = snap.data()?.role;
  if (role !== "admin" && role !== "moderator") throw new ApiAuthError("No autorizado", 403);
  return { uid, role };
}

// Gestión de usuarios (rol/plan de CUALQUIER cuenta de la plataforma) es más
// sensible que moderación/reportes — en la app esto está detrás de un
// segundo chequeo (isAdmin = profile.role === "admin", ni moderator puede),
// se replica igual acá.
export async function requireSuperAdmin(request: NextRequest): Promise<{ uid: string }> {
  const { uid, role } = await requireAdminRole(request);
  if (role !== "admin") throw new ApiAuthError("Requiere rol admin", 403);
  return { uid };
}
