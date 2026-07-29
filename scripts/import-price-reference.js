const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");
const admin = require("firebase-admin");

const serviceAccount = require("../credentials.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function run() {
  const csvPath = path.join(__dirname, "..", "data", "price_reference_flat.csv");
  const fileContent = fs.readFileSync(csvPath, "utf8");

  const parsed = Papa.parse(fileContent, {
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
  });

  const rows = parsed.data;

  let processed = 0;
  let skipped = 0;

  // Mapa para construir catálogo: Marca -> Modelo -> Set(Versiones)
  const catalogMap = new Map();

  for (const row of rows) {
    const rawBrand = row.Marca || row.marca;
    const rawModel = row.Modelo || row.modelo;
    const rawVersion = row.Version || row.version;
    const rawYear = row.year;
    const rawCurrency = row.currency || row.moneda || "ARS";
    const rawAvg = row.avg;

    const brand = rawBrand ? String(rawBrand).trim() : "";
    const baseModel = rawModel ? String(rawModel).trim() : "";
    const version = rawVersion ? String(rawVersion).trim() : "";

    // Siempre construimos catálogo si hay Marca y Modelo,
    // aunque esta fila no tenga precio válido.
    if (brand && baseModel) {
      if (!catalogMap.has(brand)) {
        catalogMap.set(brand, new Map());
      }
      const modelsMap = catalogMap.get(brand);
      if (!modelsMap.has(baseModel)) {
        modelsMap.set(baseModel, new Set());
      }
      const versionsSet = modelsMap.get(baseModel);
      if (version) {
        versionsSet.add(version);
      }
    }

    const model = version ? `${baseModel} ${version}` : baseModel;
    const year = rawYear ? Number(String(rawYear).trim()) : NaN;
    const currency = String(rawCurrency).trim().toUpperCase() || "ARS";

    // Para price_reference sí exigimos datos completos y precio válido
    if (!brand || !model || !year || Number.isNaN(year)) {
      skipped++;
      continue;
    }

    if (!rawAvg || String(rawAvg).trim() === "") {
      skipped++;
      continue;
    }

    const rawAvgStr = String(rawAvg).trim();
    let avgNumber = NaN;

    if (/^\d+,\d{2}$/.test(rawAvgStr)) {
      const thousands = Number(rawAvgStr.replace(",", "."));
      if (!Number.isNaN(thousands)) {
        avgNumber = thousands * 1000;
      }
    } else {
      const normalized = rawAvgStr.replace(/\./g, "").replace(",", ".");
      avgNumber = Number(normalized);
    }

    const avg = avgNumber;

    if (!avg || Number.isNaN(avg)) {
      skipped++;
      continue;
    }

    const min = avg;
    const max = avg;
    const count = 1;

    const rawDocId = `${brand}_${model}_${year}_${currency}`;
    const docId = rawDocId.replace(/\//g, "_");

    await db
      .collection("price_reference")
      .doc(docId)
      .set(
        {
          brand,
          model,
          year,
          currency,
          min,
          max,
          avg,
          count,
        },
        { merge: true }
      );

    processed++;
  }

  // Persistir catálogo en /catalog/default/makes/{brand}/models/{model}
  let catalogWrites = 0;
  for (const [brand, modelsMap] of catalogMap.entries()) {
    const makeRef = db.collection("catalog").doc("default").collection("makes").doc(brand);
    await makeRef.set({ name: brand }, { merge: true });
    catalogWrites++;

    for (const [modelName, versionsSet] of modelsMap.entries()) {
      const modelRef = makeRef.collection("models").doc(modelName);
      const versions = Array.from(versionsSet.values());
      await modelRef.set(
        versions.length ? { name: modelName, versions } : { name: modelName },
        { merge: true }
      );
      catalogWrites++;
    }
  }

  console.log("Import completed");
  console.log("Processed price_reference docs:", processed);
  console.log("Skipped rows:", skipped);
  console.log("Catalog writes:", catalogWrites);
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Import error", err);
    process.exit(1);
  });
