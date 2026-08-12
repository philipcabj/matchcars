import type { NextConfig } from "next";
import path from "node:path";

// Dominio default de Firebase Hosting del sitio clásico (export web de Expo)
// — existe siempre, independiente de si matchcars.app apunta ahí o no.
// Server Hosting (App Hosting) no puede convivir con Hosting clásico en el
// mismo dominio con reglas por ruta, así que en vez de migrar /app, este
// Next.js hace de proxy hacia el sitio viejo sin tocarlo — sigue sirviendo
// exactamente lo mismo que hoy. (/user-profile y /agencia usan un proxy
// manual aparte — src/lib/legacy-proxy.ts — porque el rewrite automático acá
// no garantizaba pasar el User-Agent real a la función ogPreview.)
const LEGACY_SITE = "https://matchcars-a7847.web.app";

// El portal vive en su propio subdominio (portal.matchcars.app), no
// proxeado desde acá — se probó como /portal primero, pero las llamadas
// servidor-a-servidor entre dos backends de App Hosting chocan con un
// chequeo de identidad interno de Google Cloud (401) que no se pudo
// resolver sin acceso a la consola de IAM. Ver NavBar.tsx / Sidebar.tsx del
// portal para el link cruzado.

const nextConfig: NextConfig = {
  // El repo raíz también tiene su propio package-lock.json (la app Expo) y
  // portal/ tiene el suyo. Fijamos la raíz acá para que Next.js no intente
  // inferirla y no rastree archivos fuera de marketplace/ al armar el build.
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    return [{ source: "/app/:path*", destination: `${LEGACY_SITE}/:path*` }];
  },
  images: {
    // Las fotos de autos viven en Firebase Storage (uploads/{uid}/...) —
    // dominio fijo del bucket del proyecto, sin comodines innecesarios.
    remotePatterns: [
      { hostname: "firebasestorage.googleapis.com" },
      { hostname: "storage.googleapis.com" },
    ],
  },
};

export default nextConfig;
