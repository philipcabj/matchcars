// marketplace/src/lib/firebase-admin.ts
// Firebase Admin SDK — SOLO server-side (Server Components / rutas). Mismo
// patrón que portal/src/lib/firebase-admin.ts. Acá solo se usa para LEER
// (vehicles/catalog/users) — no hay ninguna ruta de escritura en esta fase.
import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";

function createAdminApp() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({ projectId });
  }

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

export const adminDb = getFirestore(adminApp);
