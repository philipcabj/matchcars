// portal/src/lib/firebase-admin.ts
// Firebase Admin SDK — SOLO server-side (route handlers). El paquete
// "server-only" hace fallar el build si esto se importa por error desde un
// componente cliente, para no filtrar la service account al browser.
import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";

function createAdminApp() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  // Contra el Emulator Suite local: no hace falta una service account real,
  // el Admin SDK detecta FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST
  // automáticamente. Este es el modo por defecto mientras el portal está en
  // construcción — nunca toca datos de producción.
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({ projectId });
  }

  // Modo producción real (recién cuando se decida deployar de verdad): usa la
  // misma service account que ya usa el proyecto (credentials.json en la raíz,
  // gitignored). Reutilizamos el archivo existente en vez de duplicar la key.
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!serviceAccountPath) {
    throw new Error(
      "Falta FIREBASE_SERVICE_ACCOUNT_PATH (o FIRESTORE_EMULATOR_HOST para desarrollo local) en .env.local"
    );
  }
  const resolvedPath = path.resolve(/* turbopackIgnore: true */ process.cwd(), serviceAccountPath);
  const serviceAccount = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ resolvedPath, "utf-8"));
  return initializeApp({ credential: cert(serviceAccount) });
}

const adminApp = getApps().length ? getApps()[0] : createAdminApp();

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
