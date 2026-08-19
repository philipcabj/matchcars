// scripts/fix-agency-attribution.js
// Backfill puntual para el bug arreglado en add-car.tsx/WebDealerAddCarForm.tsx
// (2026-08-18): un vendedor invitado a una agencia del Portal que publicaba
// desde la app quedaba con vehicles/{id}.userId = su propio uid personal en
// vez del uid del dueño de la agencia (agencyId), y lo mismo se propagaba a
// leads/{id}.sellerId al copiarse de vehicle.userId. Este script busca todos
// los vehicles/leads/sales de una cuenta puntual (por email) que sea miembro
// invitado de una agencia, y los reasigna al agencyId correcto.
//
// Uso: node scripts/fix-agency-attribution.js <email>
const admin = require("firebase-admin");
const serviceAccount = require("../credentials.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function run() {
  const email = process.argv[2];
  if (!email) {
    console.error("Uso: node scripts/fix-agency-attribution.js <email>");
    process.exit(1);
  }

  const usersSnap = await db.collection("users").where("email", "==", email.trim().toLowerCase()).get();
  if (usersSnap.empty) {
    console.log(`- No se encontró ningún usuario con email ${email}`);
    return;
  }
  const uid = usersSnap.docs[0].id;
  console.log(`Usuario encontrado: uid=${uid}`);

  const membershipSnap = await db.doc(`agencyMemberships/${uid}`).get();
  if (!membershipSnap.exists) {
    console.log(`- ${uid} no tiene membresía de agencia (agencyMemberships/${uid} no existe). Nada que corregir.`);
    return;
  }
  const agencyId = membershipSnap.data().agencyId;
  console.log(`Miembro de la agencia: agencyId=${agencyId}`);

  if (agencyId === uid) {
    console.log("- agencyId == uid propio, no hay nada que reasignar.");
    return;
  }

  const vehiclesSnap = await db.collection("vehicles").where("userId", "==", uid).get();
  console.log(`\nVehículos publicados con userId=${uid}: ${vehiclesSnap.size}`);
  for (const d of vehiclesSnap.docs) {
    const v = d.data();
    console.log(`  - ${d.id}: ${v.brand} ${v.model} ${v.year ?? ""} (status=${v.status})`);
    await d.ref.update({ userId: agencyId });
    console.log(`    -> userId actualizado a ${agencyId}`);
  }

  const leadsSnap = await db.collection("leads").where("sellerId", "==", uid).get();
  console.log(`\nLeads con sellerId=${uid}: ${leadsSnap.size}`);
  for (const d of leadsSnap.docs) {
    const l = d.data();
    console.log(`  - ${d.id}: vehicleId=${l.vehicleId} buyerId=${l.buyerId}`);
    await d.ref.update({ sellerId: agencyId });
    console.log(`    -> sellerId actualizado a ${agencyId}`);
  }

  const salesSnap = await db.collection("sales").where("sellerId", "==", uid).get();
  console.log(`\nVentas con sellerId=${uid}: ${salesSnap.size}`);
  for (const d of salesSnap.docs) {
    console.log(`  - ${d.id}`);
    await d.ref.update({ sellerId: agencyId });
    console.log(`    -> sellerId actualizado a ${agencyId}`);
  }

  console.log("\nListo.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
