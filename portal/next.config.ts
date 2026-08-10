import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // El repo raíz también tiene su propio package-lock.json (la app Expo).
  // Fijamos la raíz acá para que Next.js no intente inferirla y no rastree
  // archivos fuera de portal/ al armar el build.
  turbopack: {
    root: path.join(__dirname),
  },
  // El portal vive en matchcars.app/portal (proxeado desde marketplace/,
  // que es dueño exclusivo del dominio en App Hosting) — basePath hace que
  // Next.js arme todas sus rutas y assets con ese prefijo automáticamente,
  // sin necesitar dominio/subdominio propio.
  basePath: "/portal",
};

export default nextConfig;
