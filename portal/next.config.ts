import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

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

// Sin SENTRY_AUTH_TOKEN el plugin no sube sourcemaps (los errores igual
// llegan a Sentry, solo que con el código minificado) — no rompe el build
// si todavía no cargamos ese token en apphosting.yaml.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
});
