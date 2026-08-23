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
  | "pro_dealer"; // Fallback/legacy

export const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  free: "Gratis",
  pro_monthly: "Pro Mensual",
  pro_annual: "Pro Anual",
  pro_plus_monthly: "Pro+ Mensual",
  pro_plus_annual: "Pro+ Anual",
  pro_dealer_monthly: "Dealer Mensual",
  pro_dealer_annual: "Dealer Anual",
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
 * Reestructuración de planes: el portal se vende entero desde Pro (nada queda
 * como upsell exclusivo de Dealer) — el único eje de diferenciación entre
 * planes son estos tres números (autos, destacados, usuarios), no el acceso
 * a funciones.
 */
export function getIncludedSeats(plan: SubscriptionPlan | string): number {
  if (!plan) return 1;
  if (plan.includes("pro_dealer")) return 30;
  if (plan.includes("pro_plus")) return 10;
  if (plan.includes("pro_monthly") || plan.includes("pro_annual") || plan === "pro") return 5;
  return 1; // Free.
}

// ─── Feature checks (copia de lib/planChecks.ts) ────────────────────────────

export function getMaxCars(plan: SubscriptionPlan | string): number {
  if (!plan) return 1;
  if (plan.includes("pro_dealer")) return 100;
  if (plan.includes("pro_plus")) return 40;
  if (plan.includes("pro_monthly") || plan.includes("pro_annual") || plan === "pro") return 15;
  return 1;
}

// Identidad de negocio (nombre de fantasía, auto-featured al publicar) — NO
// gatea funciones del portal, esas son universales en cualquier plan pago.
export function isDealerPlan(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return plan.includes("pro_dealer");
}

// Disponible en cualquier plan pago.
export function canBulkImport(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return plan !== "free";
}

// Disponible en cualquier plan pago — el portal se vende entero desde Pro.
export function canAccessCRM(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return plan !== "free";
}

// Disponible en cualquier plan pago.
export function hasAdvancedReports(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return plan !== "free";
}

// Panel comparativo (tu agencia vs. el promedio de otras agencias pagas) —
// disponible en cualquier plan pago; el pool de comparación (reports/route.ts)
// incluye a todas las agencias pagas, no solo Dealer.
export function hasPeerComparison(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return plan !== "free";
}

export function canUploadVideo(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return ["pro", "pro_plus", "pro_dealer"].some((p) => plan.includes(p));
}

// Disponible en cualquier plan pago.
export function canExportPDF(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return plan !== "free";
}

export function canUseWatermark(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return ["pro", "pro_plus", "pro_dealer"].some((p) => plan.includes(p));
}

// Gastos por unidad / margen — útil incluso para un vendedor solo, no
// requiere equipo. Free queda afuera, es una herramienta de gestión.
export function canTrackExpenses(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return plan !== "free";
}

// Disponible en cualquier plan pago — todos tienen equipo (getIncludedSeats)
// a quien pagarle comisión.
export function canManageCommissions(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return plan !== "free";
}

export function getMonthlyFeaturedAllowance(plan: SubscriptionPlan | string): number {
  if (!plan) return 0;
  if (plan.includes("pro_dealer")) return Infinity;
  if (plan.includes("pro_plus")) return 15;
  if (plan.includes("pro_monthly") || plan.includes("pro_annual") || plan === "pro") return 5;
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

  const seats = getIncludedSeats(plan);
  features.push(`👥 Hasta ${seats} usuarios de portal`);

  // El portal se vende entero desde Pro — un solo bloque en vez de listar
  // CRM/gestión de venta/comisiones/reportes como líneas sueltas (eran el
  // mismo producto, no features independientes).
  if (canAccessCRM(plan)) {
    features.push(
      "💻 Portal de Agencias completo: CRM de leads, gestión de venta, comisiones automáticas, reportes avanzados y panel comparativo"
    );
  }
  if (canTrackExpenses(plan)) features.push("💵 Control de gastos y margen por unidad");

  return features;
}
