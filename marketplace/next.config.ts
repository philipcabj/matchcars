import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // El repo raíz también tiene su propio package-lock.json (la app Expo) y
  // portal/ tiene el suyo. Fijamos la raíz acá para que Next.js no intente
  // inferirla y no rastree archivos fuera de marketplace/ al armar el build.
  turbopack: {
    root: path.join(__dirname),
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
