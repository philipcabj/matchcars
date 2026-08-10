// portal/src/lib/api-handler.ts
// Envuelve un route handler para que CUALQUIER excepción no controlada (bug,
// timeout, lo que sea) vuelva como JSON con status 500 en vez de que Next.js
// (en dev) renderice una página de error HTML — que es lo que rompía
// parseJsonResponse en el cliente con "Unexpected token '<'". También evita
// repetir el try/catch de requireUid en cada handler.
import "server-only";

import { ApiAuthError } from "@/lib/api-auth";
import { NextRequest } from "next/server";

export function withApiErrors<Args extends unknown[]>(
  handler: (request: NextRequest, ...args: Args) => Promise<Response>
): (request: NextRequest, ...args: Args) => Promise<Response> {
  return async (request, ...args) => {
    try {
      return await handler(request, ...args);
    } catch (e) {
      if (e instanceof ApiAuthError) {
        return Response.json({ error: e.message }, { status: e.status });
      }
      console.error(`[api] ${request.method} ${request.nextUrl.pathname} falló:`, e);
      const message = e instanceof Error ? e.message : "Error interno del servidor.";
      return Response.json({ error: message }, { status: 500 });
    }
  };
}
