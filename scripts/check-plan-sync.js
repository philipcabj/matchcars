// scripts/check-plan-sync.js
// Uso: node scripts/check-plan-sync.js  (o `npm run check-plan-sync`)
//
// Los cupos y gates de cada plan pago están duplicados a mano en 4 lugares
// (lib/planChecks.ts, portal/src/lib/plans.ts, functions/src/index.ts,
// marketplace/src/lib/agencies.ts) porque no es un monorepo con paquetes
// compartidos — ver el comentario de cabecera de portal/src/lib/plans.ts.
// Esto NO lo soluciona: solo compara los 4 archivos entre sí (texto, sin
// importar nada — cada proyecto tiene su propio tsconfig/paths y no se
// pueden requerir cruzados) y avisa si alguno quedó desincronizado, como ya
// pasó una vez con el gate de Comisiones del Sidebar del portal. Solo lee
// archivos fuente, no toca nada de RevenueCat/tiendas ni de producción.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FILES = {
  root: path.join(ROOT, "lib/planChecks.ts"),
  portal: path.join(ROOT, "portal/src/lib/plans.ts"),
  functions: path.join(ROOT, "functions/src/index.ts"),
  marketplace: path.join(ROOT, "marketplace/src/lib/agencies.ts"),
};

const src = {};
for (const [key, file] of Object.entries(FILES)) {
  src[key] = fs.readFileSync(file, "utf8");
}

let failures = 0;
function check(label, ok, detail) {
  if (ok) {
    console.log(`✅ ${label}`);
  } else {
    failures++;
    console.log(`❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// Extrae el cuerpo de una función (busca "function <name>(" sea "export
// function" o no, y corta en el primer "}" que cierra al mismo nivel que el
// que abrió la función — asume que no hay funciones anidadas, cierto en los
// 4 archivos hoy).
function fnBody(text, name) {
  const start = text.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const braceStart = text.indexOf("{", start);
  let depth = 0;
  for (let i = braceStart; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(braceStart + 1, i);
    }
  }
  return null;
}

// Dentro de un cuerpo de función, busca el primer "return <valor>" que
// aparece después de la primera ocurrencia de `needle` (ej: '"pro_dealer"').
function returnAfter(body, needle) {
  if (!body) return undefined;
  const idx = body.indexOf(needle);
  if (idx === -1) return undefined;
  const m = body.slice(idx).match(/return\s+(\d+|Infinity)/);
  return m ? m[1] : undefined;
}

function quotas(text, fnName) {
  const body = fnBody(text, fnName);
  return {
    dealer: returnAfter(body, '"pro_dealer"'),
    plus: returnAfter(body, '"pro_plus"'),
    pro: returnAfter(body, '"pro_monthly"'),
  };
}

function sameQuotas(a, b) {
  return a.dealer === b.dealer && a.plus === b.plus && a.pro === b.pro;
}
function fmt(q) {
  return `dealer=${q.dealer} plus=${q.plus} pro=${q.pro}`;
}

// ── getMaxCars: root vs portal vs functions ─────────────────────────────────
{
  const root = quotas(src.root, "getMaxCars");
  const portal = quotas(src.portal, "getMaxCars");
  const functions = quotas(src.functions, "getMaxCars");
  check(
    "getMaxCars: root === portal",
    sameQuotas(root, portal),
    `root(${fmt(root)}) vs portal(${fmt(portal)})`
  );
  check(
    "getMaxCars: root === functions",
    sameQuotas(root, functions),
    `root(${fmt(root)}) vs functions(${fmt(functions)})`
  );
}

// ── getMonthlyFeaturedAllowance: root vs portal ─────────────────────────────
{
  const root = quotas(src.root, "getMonthlyFeaturedAllowance");
  const portal = quotas(src.portal, "getMonthlyFeaturedAllowance");
  check(
    "getMonthlyFeaturedAllowance: root === portal",
    sameQuotas(root, portal),
    `root(${fmt(root)}) vs portal(${fmt(portal)})`
  );
}

// ── getIncludedSeats: solo existe en portal, se deja documentado ──────────
{
  const portal = quotas(src.portal, "getIncludedSeats");
  check(
    "getIncludedSeats (portal, sin equivalente en la app): dealer=30 plus=10 pro=5",
    portal.dealer === "30" && portal.plus === "10" && portal.pro === "5",
    fmt(portal)
  );
}

// ── isDealerPlan / isDealerPlanServer: mismo criterio (pro_dealer only) ────
{
  const checks = [
    ["root.isDealerPlan", fnBody(src.root, "isDealerPlan")],
    ["portal.isDealerPlan", fnBody(src.portal, "isDealerPlan")],
    ["functions.isDealerPlanServer", fnBody(src.functions, "isDealerPlanServer")],
  ];
  for (const [label, body] of checks) {
    check(`${label} usa includes("pro_dealer")`, !!body && body.includes('includes("pro_dealer")'));
  }
}

// ── Gates universales (cualquier plan pago, "!== \"free\""): CRM, bulk
// import, ficha pública, PDF, comisiones, reportes, etc. ────────────────────
{
  const universalFns = {
    root: ["canHavePublicAgencyPage", "canBulkImport", "canAccessCRM", "canExportPDF"],
    portal: [
      "canBulkImport",
      "canAccessCRM",
      "hasAdvancedReports",
      "hasPeerComparison",
      "canExportPDF",
      "canTrackExpenses",
      "canManageCommissions",
    ],
    functions: ["canBulkImportServer"],
  };
  for (const [project, fns] of Object.entries(universalFns)) {
    for (const fn of fns) {
      const body = fnBody(src[project], fn);
      check(`${project}.${fn} es universal (!== "free")`, !!body && body.includes('!== "free"'));
    }
  }
}

// ── marketplace PAID_PLANS vs los ids de plan pago reales (portal) ─────────
{
  const portalTypeMatch = src.portal.match(/export type SubscriptionPlan =([\s\S]*?);/);
  const portalPlans = portalTypeMatch
    ? Array.from(portalTypeMatch[1].matchAll(/"([a-z_]+)"/g)).map((m) => m[1])
    : [];
  // pro_internal es intencionalmente NO público — asignado solo por un admin
  // para dar acceso al portal sin aparecer como agencia, así que a propósito
  // no está (ni debe estar) en marketplace.PAID_PLANS.
  const portalPaidPlans = portalPlans.filter((p) => p !== "free" && p !== "pro_internal").sort();

  const marketplaceMatch = src.marketplace.match(/const PAID_PLANS = \[([\s\S]*?)\];/);
  const marketplacePlans = marketplaceMatch
    ? Array.from(marketplaceMatch[1].matchAll(/"([a-z_]+)"/g)).map((m) => m[1])
    : [];
  const marketplaceSorted = [...marketplacePlans].sort();

  check(
    "marketplace.PAID_PLANS === ids de plan pago de portal.SubscriptionPlan",
    JSON.stringify(portalPaidPlans) === JSON.stringify(marketplaceSorted),
    `portal(${portalPaidPlans.join(",")}) vs marketplace(${marketplaceSorted.join(",")})`
  );
}

console.log("");
if (failures > 0) {
  console.log(`${failures} desincronización(es) encontrada(s) entre los 4 archivos de planes.`);
  process.exit(1);
} else {
  console.log("Los 4 archivos de planes están sincronizados.");
}
