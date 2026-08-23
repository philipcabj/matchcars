// scripts/grant-portal-access.js
// Puntual: le da acceso al Portal de Agencias a una cuenta existente
// seteándole un plan pago en users/{uid}.plan — resolveMembership (portal/
// src/lib/agency-server.ts) exige plan pago (o invitación de equipo) para
// entrar como dueño de su propia agencia.
// Uso: node scripts/grant-portal-access.js <email> <plan>
const admin = require("firebase-admin");
const serviceAccount = require("../credentials.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const auth = admin.auth();

const VALID_PLANS = [
  "pro_monthly", "pro_annual",
  "pro_plus_monthly", "pro_plus_annual",
  "pro_dealer_monthly", "pro_dealer_annual",
];

async function run() {
  const email = process.argv[2];
  const plan = process.argv[3];
  if (!email || !plan) {
    console.error("Uso: node scripts/grant-portal-access.js <email> <plan>");
    process.exit(1);
  }
  if (!VALID_PLANS.includes(plan)) {
    console.error(`Plan inválido. Válidos: ${VALID_PLANS.join(", ")}`);
    process.exit(1);
  }

  const userRecord = await auth.getUserByEmail(email).catch(() => null);
  if (!userRecord) {
    console.error("No existe cuenta de Firebase Auth con ese email.");
    process.exit(1);
  }
  const uid = userRecord.uid;

  const ref = db.doc(`users/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`users/${uid} no existe.`);
    process.exit(1);
  }

  await ref.update({ plan });
  console.log(`✓ users/${uid}.plan actualizado a "${plan}" (${email})`);

  const resetLink = await auth.generatePasswordResetLink(email);
  console.log("\nLink para que el usuario setee su propia contraseña (por si no la sabe/nunca la usó):");
  console.log(resetLink);
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
