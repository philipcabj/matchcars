// portal/src/lib/api-auth.ts
import "server-only";

import { adminAuth } from "@/lib/firebase-admin";
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
