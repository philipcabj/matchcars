// scripts/dedupe-catalog.js
// Depura duplicados case-insensitive en catalog/default/makes/{make}/models/{model}
// (marcas, modelos y versiones). Por defecto corre en modo DRY RUN (no escribe
// nada) — pasar --apply para ejecutar los cambios de verdad.
//
// Uso:
//   node scripts/dedupe-catalog.js            (dry run, solo reporta)
//   node scripts/dedupe-catalog.js --apply     (aplica los cambios)
//
// Criterio de fusión (por grupo de duplicados case-insensitive):
//   - Se elige como "canónico" el que tiene más modelos/versiones cargadas
//     (proxy de "más usado" -> se pierde menos al conservarlo).
//   - Empate -> Title Case ("Volkswagen" en vez de "VOLKSWAGEN"/"volkswagen").
//   - Todo lo que tenían los demás duplicados (modelos, versiones) se fusiona
//     al canónico antes de borrar los duplicados.
//   - Mismo criterio un nivel más abajo: modelos duplicados dentro de una
//     marca, y versiones duplicadas dentro de un modelo.
//   - NO toca la colección `vehicles` — esto es solo el catálogo de
//     sugerencias/autocompletado, no las publicaciones reales.
const admin = require("firebase-admin");
const serviceAccount = require("../credentials.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const APPLY = process.argv.includes("--apply");

function normalizeKey(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function titleCase(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/(^|\s|-)([a-záéíóúñ])/g, (m, sep, c) => sep + c.toUpperCase());
}

function pickCanonical(variants) {
  // variants: [{ name, score }] -> siempre gana Title Case si alguna variante
  // ya está así (aunque tenga menos datos cargados — la forma de display le
  // gana a la cantidad); si ninguna lo está, se genera Title Case a partir de
  // la variante con más datos. Nota: esto asume que el nombre "correcto" de
  // la marca/modelo es Title Case estándar — no distingue siglas (BMW, DS)
  // porque ningún grupo de duplicados detectado hoy es una sigla; si en el
  // futuro aparece uno, revisar a mano.
  const alreadyTitled = variants.find((v) => v.name === titleCase(v.name));
  if (alreadyTitled) return alreadyTitled.name;
  const sorted = [...variants].sort((a, b) => b.score - a.score);
  return titleCase(sorted[0].name);
}

async function run() {
  const report = {
    makeGroups: 0,
    makesDeleted: 0,
    modelGroups: 0,
    modelsDeleted: 0,
    versionDupesRemoved: 0,
    details: [],
  };

  const makesSnap = await db.collection("catalog/default/makes").get();

  // Agrupar makes por clave normalizada
  const makeGroups = new Map(); // normKey -> [{ id, name }]
  for (const doc of makesSnap.docs) {
    const name = doc.data().name || doc.id;
    const key = normalizeKey(name);
    if (!makeGroups.has(key)) makeGroups.set(key, []);
    makeGroups.get(key).push({ id: doc.id, name });
  }

  for (const [key, makeVariants] of makeGroups) {
    // Cargar modelos de cada variante de marca
    const variantModels = new Map(); // makeId -> [{ id, name, versions }]
    for (const mv of makeVariants) {
      const modelsSnap = await db.collection(`catalog/default/makes/${mv.id}/models`).get();
      variantModels.set(
        mv.id,
        modelsSnap.docs.map((d) => ({ id: d.id, name: d.data().name || d.id, versions: d.data().versions || [] }))
      );
    }

    if (makeVariants.length > 1) {
      report.makeGroups++;
    }

    // Elegir marca canónica (ver pickCanonical) — el doc ID final es siempre
    // el propio nombre canónico (así lo busca el resto del código, doc ID ==
    // string de marca), nunca el ID de "la variante que ganó por puntaje".
    const scored = makeVariants.map((mv) => ({ name: mv.name, score: variantModels.get(mv.id).length }));
    const canonicalName = pickCanonical(scored);
    const otherVariants = makeVariants.filter((mv) => mv.id !== canonicalName);

    // Fusionar modelos: juntar todos los modelos de todas las variantes de esta marca
    const allModels = makeVariants.flatMap((mv) => variantModels.get(mv.id));
    const modelGroupsForMake = new Map(); // normKey -> [{ name, versions }]
    for (const m of allModels) {
      const mk = normalizeKey(m.name);
      if (!modelGroupsForMake.has(mk)) modelGroupsForMake.set(mk, []);
      modelGroupsForMake.get(mk).push(m);
    }

    const mergedModels = []; // { name, versions: string[] }
    for (const [, modelVariants] of modelGroupsForMake) {
      if (modelVariants.length > 1) {
        report.modelGroups++;
        report.modelsDeleted += modelVariants.length - 1;
      }
      const modelScored = modelVariants.map((mv) => ({ name: mv.name, score: mv.versions.length }));
      const modelCanonicalName = pickCanonical(modelScored);

      // Fusionar versiones (dedupe case-insensitive, Title Case como forma final)
      const versionMap = new Map(); // normKey -> display version
      for (const mv of modelVariants) {
        for (const v of mv.versions) {
          const vk = normalizeKey(v);
          if (!versionMap.has(vk)) versionMap.set(vk, v);
        }
      }
      const beforeCount = modelVariants.reduce((s, mv) => s + mv.versions.length, 0);
      const afterCount = versionMap.size;
      report.versionDupesRemoved += Math.max(0, beforeCount - afterCount);

      mergedModels.push({ name: modelCanonicalName, versions: Array.from(versionMap.values()) });
    }

    if (makeVariants.length > 1 || [...modelGroupsForMake.values()].some((v) => v.length > 1)) {
      report.details.push({
        make: canonicalName,
        duplicateMakeVariants: otherVariants.map((v) => v.name),
        modelCount: mergedModels.length,
      });
    }

    if (APPLY) {
      const canonicalRef = db.doc(`catalog/default/makes/${canonicalName}`);
      await canonicalRef.set({ name: canonicalName }, { merge: true });

      for (const model of mergedModels) {
        await canonicalRef.collection("models").doc(model.name).set({ name: model.name, versions: model.versions }, { merge: false });
      }

      // Borrar modelos viejos que ya no correspondan al set final (nombres con otra casing)
      const finalModelNames = new Set(mergedModels.map((m) => m.name));
      const currentModelsSnap = await canonicalRef.collection("models").get();
      for (const d of currentModelsSnap.docs) {
        if (!finalModelNames.has(d.id)) await d.ref.delete();
      }

      // Borrar variantes de marca duplicadas (con sus modelos)
      for (const ov of otherVariants) {
        const ovRef = db.doc(`catalog/default/makes/${ov.id}`);
        const ovModelsSnap = await ovRef.collection("models").get();
        for (const d of ovModelsSnap.docs) await d.ref.delete();
        await ovRef.delete();
        report.makesDeleted++;
      }
    }
  }

  console.log(`\n=== ${APPLY ? "APLICADO" : "DRY RUN (nada se escribió)"} ===`);
  console.log(`Marcas totales (antes): ${makesSnap.size}`);
  console.log(`Grupos de marcas duplicadas: ${report.makeGroups}`);
  console.log(`Docs de marca a borrar: ${report.makesDeleted || (APPLY ? 0 : "(ver detalle)")}`);
  console.log(`Grupos de modelos duplicados (dentro de una marca): ${report.modelGroups}`);
  console.log(`Docs de modelo a borrar: ${report.modelsDeleted}`);
  console.log(`Versiones duplicadas removidas: ${report.versionDupesRemoved}`);
  console.log(`\nDetalle (primeros 30 grupos con duplicados):`);
  for (const d of report.details.slice(0, 30)) {
    console.log(`- ${d.make}${d.duplicateMakeVariants.length ? ` (fusiona con: ${d.duplicateMakeVariants.join(", ")})` : ""} — ${d.modelCount} modelos`);
  }
  if (report.details.length > 30) console.log(`... y ${report.details.length - 30} más`);
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
