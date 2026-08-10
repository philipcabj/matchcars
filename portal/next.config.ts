import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // El repo raíz también tiene su propio package-lock.json (la app Expo).
  // Fijamos la raíz acá para que Next.js no intente inferirla y no rastree
  // archivos fuera de portal/ al armar el build.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
