// scripts/fix-published-deleted.js
// Baja `published` en los autos que quedaron con published:true pero un
// status que NO debería estar visible (deleted/sold/reserved/...). Pasa
// porque el borrado del dueño en la app (app/car/[id].tsx, corregido en
// e75d46f) seteaba status:"deleted" sin tocar published.
//
// DRY RUN por defecto. Para escribir:  node scripts/fix-published-deleted.js --apply
const admin = require("firebase-admin");
const serviceAccount = require("../credentials.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const APPLY = process.argv.includes("--apply");
const HIDDEN = ["deleted", "sold", "reserved", "rejected", "rejected_limit", "blocked", "paused", "archived"];

(async () => {
  const snap = await db.collection("vehicles").where("published", "==", true).get();
  const bad = snap.docs.filter((d) => HIDDEN.includes(d.data().status));
  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — ${bad.length} docs con published:true + status oculto\n`);
  for (const d of bad) {
    const v = d.data();
    console.log(`${APPLY ? "fixing " : ""}#${v.publicationCode ?? "?"}  ${d.id}  ${v.status}  ${v.brand} ${v.model} ${v.year}  (${v.userName})`);
    if (APPLY) {
      await d.ref.update({ published: false, isFeatured: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
  }
  console.log(`\n${APPLY ? "done" : "run with --apply to write"}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
