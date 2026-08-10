// portal/src/lib/firebase-client.ts
// Firebase client SDK — mismo proyecto que la app (matchcars-a7847).
// Se conecta al Emulator Suite local cuando NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true,
// para que el desarrollo del portal nunca lea/escriba datos reales de producción.
import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// HMR-safe: sin esto, cada recarga en caliente intenta reconectar el emulador
// y firebase tira "already connected".
const g = globalThis as unknown as { __MC_PORTAL_EMULATORS_CONNECTED__?: boolean };

if (
  typeof window !== "undefined" &&
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" &&
  !g.__MC_PORTAL_EMULATORS_CONNECTED__
) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  g.__MC_PORTAL_EMULATORS_CONNECTED__ = true;
  console.info("[portal] Conectado a Firebase Emulator Suite (local, no toca producción).");
}
