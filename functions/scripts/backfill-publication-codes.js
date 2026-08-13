// functions/scripts/backfill-publication-codes.js
//
// Corre UNA VEZ para asignarle `publicationCode` a los vehículos que ya
// existían antes de que assignPublicationCode (Cloud Function) empezara a
// asignarlo automáticamente en las altas nuevas. Ordena por createdAt
// ascendente (los más viejos primero) y numera secuencial desde 1, dejando
// el contador (counters/vehicles.value) en el último número usado para que
// la Cloud Function siga justo desde ahí en la próxima alta.
//
// Idempotente: salta cualquier doc que YA tenga publicationCode, así que es
// seguro re-ejecutarlo si se corta a la mitad.
//
// Uso: node functions/scripts/backfill-publication-codes.js
// (requiere ../../credentials.json en la raíz del repo, la misma service
// account que ya usan portal/ y marketplace/)
const { cert, initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "../../credentials.json"));
const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

(async () => {
  const snap = await db.collection("vehicles").orderBy("createdAt", "asc").get();
  console.log(`Total de vehículos: ${snap.size}`);

  let next = 0;
  let assigned = 0;
  let skipped = 0;
  let batch = db.batch();
  let opsInBatch = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.publicationCode) {
      next = Math.max(next, data.publicationCode);
      skipped++;
      continue;
    }
    next += 1;
    batch.update(doc.ref, { publicationCode: next });
    opsInBatch++;
    assigned++;

    if (opsInBatch >= 400) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) await batch.commit();

  await db.doc("counters/vehicles").set({ value: next }, { merge: true });

  console.log(`Asignados: ${assigned}, ya tenían: ${skipped}, contador final: ${next}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
