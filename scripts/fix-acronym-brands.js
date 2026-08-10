// scripts/fix-acronym-brands.js
// Corrige un efecto colateral de scripts/dedupe-catalog.js (2026-08-10): al
// aplicar Title Case también sobre marcas SIN duplicado, varias siglas reales
// quedaron mal escritas (ej. "Bmw" en vez de "BMW"). Renombra esos docs
// puntuales en catalog/default/makes/**, moviendo su subcolección `models`
// tal cual — no toca `vehicles` (mismo alcance que el script original).
const admin = require("firebase-admin");
const serviceAccount = require("../credentials.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const RENAMES = {
  Bmw: "BMW",
  Baic: "BAIC",
  Byd: "BYD",
  Dfsk: "DFSK",
  "Ds Automobiles": "DS Automobiles",
  Faw: "FAW",
  Jac: "JAC",
  Jmc: "JMC",
  Jmev: "JMEV",
  Mg: "MG",
};

async function run() {
  for (const [oldName, newName] of Object.entries(RENAMES)) {
    const oldRef = db.doc(`catalog/default/makes/${oldName}`);
    const oldSnap = await oldRef.get();
    if (!oldSnap.exists) {
      console.log(`- SKIP ${oldName}: no existe (¿ya corregido?)`);
      continue;
    }
    const newRef = db.doc(`catalog/default/makes/${newName}`);
    await newRef.set({ name: newName }, { merge: true });

    const modelsSnap = await oldRef.collection("models").get();
    for (const m of modelsSnap.docs) {
      await newRef.collection("models").doc(m.id).set(m.data(), { merge: false });
      await m.ref.delete();
    }
    await oldRef.delete();
    console.log(`- OK ${oldName} -> ${newName} (${modelsSnap.size} modelos movidos)`);
  }
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
