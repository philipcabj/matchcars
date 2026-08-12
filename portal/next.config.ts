import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // El repo raíz también tiene su propio package-lock.json (la app Expo).
  // Fijamos la raíz acá para que Next.js no intente inferirla y no rastree
  // archivos fuera de portal/ al armar el build.
  turbopack: {
    root: path.join(__dirname),
  },
  // El portal vive en su propio subdominio (portal.matchcars.app) — se
  // probó primero como matchcars.app/portal proxeado desde marketplace/,
  // pero las llamadas servidor-a-servidor entre dos backends de App Hosting
  // chocan con un chequeo de identidad interno de Google Cloud (401,
  // "access token could not be verified") que no se pudo resolver sin
  // acceso a la consola de IAM. Subdominio propio lo evita del todo.
};

export default nextConfig;
