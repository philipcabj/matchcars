// scripts/check-user.js
// Uso: node scripts/check-user.js <email>
// Inspección de solo lectura — no modifica nada. Sirve para ver el estado
// real de una cuenta (proveedores de auth, plan, membership de agencia)
// antes de decidir cómo darle acceso al portal.
const admin = require("firebase-admin");
const serviceAccount = require("../credentials.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const auth = admin.auth();

async function run() {
  const email = process.argv[2];
  if (!email) {
    console.error("Uso: node scripts/check-user.js <email>");
    process.exit(1);
  }
  const userRecord = await auth.getUserByEmail(email).catch(() => null);
  if (!userRecord) {
    console.log("No existe cuenta de Firebase Auth con ese email.");
    return;
  }
  console.log("uid:", userRecord.uid);
  console.log("providers:", userRecord.providerData.map((p) => p.providerId));
  console.log("emailVerified:", userRecord.emailVerified);

  const userSnap = await db.doc(`users/${userRecord.uid}`).get();
  console.log("users/{uid} existe:", userSnap.exists);
  if (userSnap.exists) {
    const d = userSnap.data();
    console.log(
      "  plan:", d.plan,
      "| role:", d.role,
      "| agencyName:", d.agencyName,
      "| displayName:", d.displayName || `${d.firstName || ""} ${d.lastName || ""}`.trim()
    );
  }

  const membershipSnap = await db.doc(`agencyMemberships/${userRecord.uid}`).get();
  console.log("agencyMemberships/{uid} existe:", membershipSnap.exists, membershipSnap.exists ? JSON.stringify(membershipSnap.data()) : "");

  const vehiclesSnap = await db.collection("vehicles").where("userId", "==", userRecord.uid).get();
  console.log("vehículos publicados:", vehiclesSnap.size);
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
