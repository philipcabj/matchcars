// portal/scripts/seed-emulator.mjs
// Siembra datos de prueba en el Firebase Emulator Suite local (Auth + Firestore).
// Nunca toca producción: requiere que FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST
// estén seteados (ver .env.local) y que los emuladores estén corriendo.
//
// Uso: npm run seed:emulator   (con los emuladores ya levantados)
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error(
    "❌ Este script solo corre contra el Emulator Suite. Faltan FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST.\n" +
      "   Corré con: node --env-file=.env.local scripts/seed-emulator.mjs"
  );
  process.exit(1);
}

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "matchcars-a7847";
const app = getApps().length ? getApps()[0] : initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);

const DEMO_UID = "demo-dealer-uid";
const DEMO_EMAIL = "dealer@demo.matchcars.local";
const DEMO_PASSWORD = "Demo1234!";

async function main() {
  console.log("🌱 Sembrando datos de prueba en el emulador...");

  // 1) Usuario de Auth (agencia demo)
  try {
    await auth.getUser(DEMO_UID);
    console.log("  · Usuario demo ya existe, se reusa.");
  } catch {
    await auth.createUser({
      uid: DEMO_UID,
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      displayName: "Demo Motors",
    });
    console.log(`  · Usuario creado: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  }

  // 2) Perfil en /users (como lo espera la app real)
  await db.doc(`users/${DEMO_UID}`).set(
    {
      email: DEMO_EMAIL,
      role: "user",
      plan: "pro_dealer_monthly",
      agencyName: "Demo Motors",
      city: "CABA",
      province: "CABA",
      createdAt: new Date(),
    },
    { merge: true }
  );

  // 3) Un par de vehículos para probar el contador de uso
  const vehicles = [
    { brand: "Toyota", model: "Corolla", year: 2022, price: 25000, currency: "USD", status: "available" },
    { brand: "VW", model: "Amarok", year: 2021, price: 32000, currency: "USD", status: "available" },
    { brand: "Fiat", model: "Cronos", year: 2023, price: 18000, currency: "USD", status: "pending_review" },
  ];
  for (const v of vehicles) {
    await db.collection("vehicles").add({ ...v, userId: DEMO_UID, userName: "Demo Motors", createdAt: new Date() });
  }

  // Nota: a propósito NO creamos /agencies/{uid}/members todavía — así se prueba
  // el fallback de "dueño implícito" de /api/agency/me tal como lo va a ver
  // cualquier agencia real que hoy no tiene ese doc.

  console.log("✅ Listo. Login de prueba:");
  console.log(`   email:    ${DEMO_EMAIL}`);
  console.log(`   password: ${DEMO_PASSWORD}`);
}

main().then(() => process.exit(0));
