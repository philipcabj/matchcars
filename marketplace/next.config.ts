import type { NextConfig } from "next";
import path from "node:path";

// Dominio default de Firebase Hosting del sitio clásico (export web de Expo
// + función ogPreview) — existe siempre, independiente de si matchcars.app
// apunta ahí o no. Server Hosting (App Hosting) no puede convivir con
// Hosting clásico en el mismo dominio con reglas por ruta, así que en vez de
// migrar /app, /user-profile y /agencia, este Next.js hace de proxy hacia
// el sitio viejo sin tocarlo — sigue sirviendo exactamente lo mismo que hoy.
const LEGACY_SITE = "https://matchcars-a7847.web.app";

const nextConfig: NextConfig = {
  // El repo raíz también tiene su propio package-lock.json (la app Expo) y
  // portal/ tiene el suyo. Fijamos la raíz acá para que Next.js no intente
  // inferirla y no rastree archivos fuera de marketplace/ al armar el build.
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    return [
      { source: "/app/:path*", destination: `${LEGACY_SITE}/:path*` },
      { source: "/user-profile/:path*", destination: `${LEGACY_SITE}/user-profile/:path*` },
      { source: "/agencia/:path*", destination: `${LEGACY_SITE}/agencia/:path*` },
    ];
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
