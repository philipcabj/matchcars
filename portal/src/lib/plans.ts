// portal/src/lib/plans.ts
//
// Fuente única de verdad de qué desbloquea cada plan, para el Portal de Agencias.
//
// NOTA IMPORTANTE: esto es una copia extendida de lib/planChecks.ts (raíz del
// proyecto), no un paquete compartido. Se decidió así a propósito para no tocar
// la app existente (ni convertir el repo en un monorepo con npm workspaces)
// mientras el portal está en construcción. Si el portal prospera, vale la pena
// mover esto a un paquete compartido real para que la app y el portal lean
// siempre la misma definición.
//
// Lo nuevo acá respecto del original: `getIncludedSeats` (cuántos usuarios de
// equipo incluye cada plan) y el modelo de roles de agencia — no existía nada
// de esto en la app, es la base para "gestión de equipo" del portal.

export type SubscriptionPlan =
  | "free"
  | "pro_monthly"
  | "pro_annual"
  | "pro_plus_monthly"
  | "pro_plus_annual"
  | "pro_dealer_monthly"
  | "pro_dealer_annual"
  | "dealer_pro_plus_monthly"
  | "dealer_pro_plus_annual"
  | "pro_dealer"; // Fallback/legacy

export const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  free: "Gratis",
  pro_monthly: "Pro Mensual",
  pro_annual: "Pro Anual",
  pro_plus_monthly: "Pro+ Mensual",
  pro_plus_annual: "Pro+ Anual",
  pro_dealer_monthly: "Dealer Mensual",
  pro_dealer_annual: "Dealer Anual",
  dealer_pro_plus_monthly: "Dealer Pro+ Mensual",
  dealer_pro_plus_annual: "Dealer Pro+ Anual",
  pro_dealer: "Pro Dealer",
};

// ─── Roles de agencia (nuevo) ────────────────────────────────────────────────
//
// Modelo v1 de datos: una agencia vive en /agencies/{agencyId}, donde
// agencyId == uid del usuario dueño original (el mismo que ya existe en
// /users con plan pro_dealer*). Así no hace falta migrar nada: el doc de
// agencia se crea recién cuando el dueño entra por primera vez al portal.
// Los miembros adicionales viven en /agencies/{agencyId}/members/{uid}.

export type AgencyRole = "owner" | "manager" | "sales";

export const AGENCY_ROLE_LABELS: Record<AgencyRole, string> = {
  owner: "Dueño/a",
  manager: "Gerente",
  sales: "Vendedor/a",
};

export interface AgencyRolePermissions {
  manageTeam: boolean; // invitar/quitar miembros, cambiar roles
  manageBilling: boolean; // ver/gestionar el plan y la facturación
  manageStock: boolean; // alta/edición/baja de autos
  manageLeads: boolean; // ver y responder leads del CRM
  viewStats: boolean; // ver estadísticas de la agencia
}

export const AGENCY_ROLE_PERMISSIONS: Record<AgencyRole, AgencyRolePermissions> = {
  owner: { manageTeam: true, manageBilling: true, manageStock: true, manageLeads: true, viewStats: true },
  manager: { manageTeam: true, manageBilling: false, manageStock: true, manageLeads: true, viewStats: true },
  sales: { manageTeam: false, manageBilling: false, manageStock: true, manageLeads: true, viewStats: false },
};

export function can(role: AgencyRole, permission: keyof AgencyRolePermissions): boolean {
  return AGENCY_ROLE_PERMISSIONS[role][permission];
}

/**
 * Asientos de equipo incluidos por plan (cuántos usuarios puede tener la agencia).
 * Valores iniciales razonables para poder construir la pantalla de equipo — hay
 * que validarlos con el negocio antes de habilitar la función de invitar de verdad.
 */
export function getIncludedSeats(plan: SubscriptionPlan | string): number {
  if (!plan) return 1;
  if (plan.includes("dealer_pro_plus")) return 5;
  if (plan.includes("pro_dealer")) return 2;
  return 1; // Planes no-dealer: solo el dueño de la cuenta, sin equipo.
}

// ─── Feature checks (copia de lib/planChecks.ts) ────────────────────────────

export function getMaxCars(plan: SubscriptionPlan | string): number {
  if (!plan) return 1;
  if (plan.includes("dealer_pro_plus")) return Infinity;
  if (plan.includes("pro_dealer")) return 30;
  if (plan.includes("pro_plus")) return 7;
  if (plan.includes("pro_monthly") || plan.includes("pro_annual") || plan === "pro") return 3;
  return 1;
}

export function isDealerPlan(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return ["pro_dealer", "dealer_pro_plus"].some((p) => plan.includes(p));
}

export function canBulkImport(plan: SubscriptionPlan | string): boolean {
  return isDealerPlan(plan);
}

export function canAccessCRM(plan: SubscriptionPlan | string): boolean {
  return isDealerPlan(plan);
}

export function canUploadVideo(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return ["pro", "pro_plus", "pro_dealer", "dealer_pro_plus"].some((p) => plan.includes(p));
}

export function canExportPDF(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return ["pro_plus", "pro_dealer", "dealer_pro_plus"].some((p) => plan.includes(p));
}

export function canUseWatermark(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return ["pro", "pro_plus", "pro_dealer", "dealer_pro_plus"].some((p) => plan.includes(p));
}

export function getMonthlyFeaturedAllowance(plan: SubscriptionPlan | string): number {
  if (!plan) return 0;
  if (plan.includes("dealer_pro_plus")) return Infinity;
  if (plan.includes("pro_dealer")) return Infinity;
  if (plan.includes("pro_plus")) return 5;
  if (plan.includes("pro_monthly") || plan.includes("pro_annual") || plan === "pro") return 2;
  return 0;
}

export function getPlanLabel(plan: SubscriptionPlan | string): string {
  return PLAN_LABELS[plan as SubscriptionPlan] || plan || "Sin plan";
}

/**
 * Lista de features en texto plano, para mostrar en la pantalla "Mi Agencia".
 * Espejo de getPlanFeatures() en lib/planChecks.ts.
 */
export function getPlanFeatures(plan: SubscriptionPlan | string): string[] {
  if (!plan || plan === "free") return ["1 auto activo"];

  const features: string[] = [];
  const maxCars = getMaxCars(plan);
  features.push(maxCars === Infinity ? "🚗 Autos ilimitados" : `🚗 Hasta ${maxCars} autos`);

  const featured = getMonthlyFeaturedAllowance(plan);
  if (featured === Infinity) features.push("⭐ Destacados ilimitados");
  else if (featured > 0) features.push(`⭐ ${featured} destacados/mes`);

  if (canUploadVideo(plan)) features.push("📹 Video Walkaround");
  if (canExportPDF(plan)) features.push("📄 Ficha PDF con QR");
  if (canAccessCRM(plan)) features.push("📞 CRM de Leads");
  if (canBulkImport(plan)) features.push("💻 Carga Masiva (CSV)");

  const seats = getIncludedSeats(plan);
  if (seats > 1) features.push(`👥 Hasta ${seats} usuarios de equipo`);

  return features;
}
