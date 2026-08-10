// marketplace/src/lib/legacy-proxy.ts
// Proxy manual (no next.config.ts rewrites) para /user-profile/** y /agencia/**
// — esas rutas dependen de que ogPreview (functions/src/index.ts) vea el
// User-Agent real del visitante para devolver meta tags OG específicas del
// perfil/agencia a los bots (Facebook, WhatsApp, etc.). El rewrite automático
// de Next.js (next.config.ts) no estaba garantizando que ese header llegara
// tal cual — verificado: con bot UA, el rewrite devolvía el HTML genérico en
// vez de las meta tags de la agencia, mientras que pegándole directo al sitio
// viejo sí funcionaba. Este proxy explícito reenvía los headers relevantes a mano.
import "server-only";

import type { NextRequest } from "next/server";

const LEGACY_SITE = "https://matchcars-a7847.web.app";

export async function proxyToLegacySite(request: NextRequest, path: string[], prefix: string): Promise<Response> {
  const target = `${LEGACY_SITE}${prefix}/${path.join("/")}${request.nextUrl.search}`;
  const upstream = await fetch(target, {
    headers: {
      "user-agent": request.headers.get("user-agent") ?? "",
      accept: request.headers.get("accept") ?? "",
      "accept-language": request.headers.get("accept-language") ?? "",
    },
    redirect: "manual",
    // Next.js parchea fetch() y lo cachea agresivamente por default (Data
    // Cache del App Router) — sin esto, la primera respuesta (¡de cualquier
    // User-Agent!) queda pegada para todos los pedidos siguientes a la misma
    // URL. Esta ruta debe reflejar el request real cada vez.
    cache: "no-store",
  });
  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "text/html; charset=utf-8" },
  });
}
