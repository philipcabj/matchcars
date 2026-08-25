import { SubscriptionPlan } from "@/types/user";

/**
 * Centralized plan feature checks
 * Single source of truth for all plan-based feature access
 */

/**
 * Get maximum number of active vehicles for a plan
 */
export function getMaxCars(plan: SubscriptionPlan | string): number {
  if (!plan) return 1; // Default for free/undefined

  if (plan.includes("pro_dealer") || plan === "pro_internal") return 100;
  if (plan.includes("pro_plus")) return 40;
  if (plan.includes("pro_monthly") || plan.includes("pro_annual") || plan === "pro") return 15;
  return 1; // Free or unknown
}

/**
 * Check if plan allows video walkaround
 */
export function canUploadVideo(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return ["pro", "pro_plus", "pro_dealer"].some(p => plan.includes(p));
}

/**
 * Check if plan allows "Mejorar foto" (recorte/encuadre IA manual en el editor).
 * Disponible en cualquier plan pago.
 */
export function canEnhancePhoto(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return ["pro", "pro_plus", "pro_dealer"].some(p => plan.includes(p));
}

/**
 * Check if plan allows AI tools (tapar patente automáticamente).
 * Disponible en cualquier plan pago.
 */
export function canUseAITools(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return plan !== "free";
}

/**
 * Check if plan allows the logo watermark on vehicle photos.
 * Disponible en cualquier plan pago (desde PRO).
 */
export function canUseWatermark(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return ["pro", "pro_plus", "pro_dealer"].some(p => plan.includes(p));
}

/**
 * Check if plan allows PDF export with QR. Disponible en cualquier plan pago.
 */
export function canExportPDF(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return plan !== "free";
}

/**
 * Check if plan has access to dealer/agency tools (identidad de negocio —
 * nombre de fantasía, auto-featured al publicar. NO gatea funciones del
 * Portal de Agencias ni la ficha pública de agencia, esas son universales
 * en cualquier plan pago desde la reestructuración de planes — ver
 * canHavePublicAgencyPage).
 */
export function isDealerPlan(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return plan.includes("pro_dealer");
}

/**
 * Ficha pública de agencia en el marketplace (badge "Agencia Verificada",
 * página /agencia/[slug], listado en /agencias) — disponible en cualquier
 * plan pago desde la reestructuración de planes. Antes era exclusivo
 * pro_dealer (isDealerPlan); se separa en una función propia porque
 * isDealerPlan sigue siendo pro_dealer-only para otras cosas (auto-featured,
 * nombre de fantasía).
 */
export function canHavePublicAgencyPage(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  if (plan === "pro_internal") return false; // asignado solo por admin, nunca público
  return plan !== "free";
}

/**
 * Check if plan allows bulk import via CSV. Disponible en cualquier plan pago.
 */
export function canBulkImport(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return plan !== "free";
}

/**
 * Check if plan has access al Portal de Agencias / CRM de Leads.
 * Disponible en cualquier plan pago.
 */
export function canAccessCRM(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return plan !== "free";
}

/**
 * Check if plan allows unlimited featured listings
 */
export function hasUnlimitedFeatured(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return plan.includes("pro_dealer") || plan === "pro_internal";
}

/**
 * Check if plan allows featured (any amount)
 */
export function canFeatureListings(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return ["pro", "pro_plus", "pro_dealer"].some(p => plan.includes(p));
}

/**
 * Get number of featured listings allowed per month
 * Returns Infinity for unlimited
 */
export function getMonthlyFeaturedAllowance(plan: SubscriptionPlan | string): number {
  if (!plan) return 0; // Free

  if (plan.includes("pro_dealer") || plan === "pro_internal") return Infinity;
  if (plan.includes("pro_plus")) return 15;
  if (plan.includes("pro_monthly") || plan.includes("pro_annual") || plan === "pro") return 5;
  return 0; // Free
}

/**
 * Check if plan gets weekend boost
 */
export function hasWeekendBoost(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return ["pro_plus", "pro_dealer"].some(p => plan.includes(p));
}

/**
 * Get boost score multiplier for search ranking
 * Higher = more visible in listings
 */
export function getBoostScoreMultiplier(plan: SubscriptionPlan | string): number {
  if (!plan) return 0; // Free

  if (plan.includes("pro_dealer")) return 1000;
  if (plan.includes("pro_plus")) return 200;
  if (plan.includes("pro_monthly") || plan.includes("pro_annual") || plan === "pro") return 100;
  return 0; // Free
}

/**
 * Check if plan shows PRO badge on listings
 */
export function shouldShowPlanBadge(plan: SubscriptionPlan | string): boolean {
  if (!plan) return false;
  return plan !== "free";
}

/**
 * Get badge display name and color
 */
export function getPlanBadgeInfo(plan: SubscriptionPlan | string): {
  label: string;
  color: string;
  textColor: string;
} | null {
  if (!plan || plan === "free") return null;

  if (plan.includes("pro_dealer")) {
    return {
      label: "AGENCIA",
      color: "#9013FE",
      textColor: "#FFF",
    };
  }
  
  if (plan.includes("pro_plus")) {
    return {
      label: "PRO PLUS",
      color: "#50E3C2",
      textColor: "#000",
    };
  }
  
  if (plan.includes("pro")) {
    return {
      label: "PRO",
      color: "#4A90E2",
      textColor: "#FFF",
    };
  }
  
  return null;
}

/**
 * Check if user should be asked to upgrade for a specific feature
 */
export function shouldPromptUpgrade(
  plan: SubscriptionPlan | string,
  feature: "video" | "ai" | "pdf" | "crm"
): boolean {
  if (!plan || plan === "free") return false; // Can ask for any feature if free

  switch (feature) {
    case "video":
    case "ai":
      return !canUseAITools(plan);
    case "pdf":
      return !canExportPDF(plan);
    case "crm":
      return !canAccessCRM(plan);
    default:
      return false;
  }
}

/**
 * Get suggested upgrade plan based on current plan and feature needed
 */
export function getSuggestedUpgrade(
  currentPlan: SubscriptionPlan | string,
  reason?: "hit_car_limit" | "need_ai" | "need_crm"
): SubscriptionPlan | null {
  if (!currentPlan) return "pro_monthly";

  if (currentPlan.includes("pro_dealer")) return null; // Already at top
  if (currentPlan.includes("pro_plus")) return "pro_dealer_monthly";
  if (currentPlan.includes("pro")) return "pro_plus_monthly";
  return "pro_monthly"; // Free
}

/**
 * Check if plan require authentication to be viewed
 * (Some features only visible to owner)
 */
export function requiresOwnershipCheck(feature: string): boolean {
  return ["edit", "delete", "crm", "analytics", "bulk_import"].includes(feature);
}

/**
 * Get list of features for a plan (for display purposes)
 */
export function getPlanFeatures(plan: SubscriptionPlan | string): string[] {
  if (!plan || plan === "free") {
    return ["1 auto activo"];
  }
  
  const features: string[] = [];
  
  // Add car limit
  const maxCars = getMaxCars(plan);
  if (maxCars === Infinity) {
    features.push("🚗 Autos ilimitados");
  } else {
    features.push(`🚗 Hasta ${maxCars} autos`);
  }
  
  // Add featured
  const featured = getMonthlyFeaturedAllowance(plan);
  if (featured === Infinity) {
    features.push("⭐ Destacados ilimitados");
  } else if (featured > 0) {
    features.push(`⭐ ${featured} destacados/mes`);
  }
  
  // Add features specific to plan
  if (canUploadVideo(plan)) {
    features.push("📹 Video Walkaround");
  }
  
  if (hasWeekendBoost(plan)) {
    features.push("🚀 Boost fines de semana");
  }

  if (canExportPDF(plan)) {
    features.push("📄 Ficha PDF con QR");
  }
  
  if (canUseAITools(plan)) {
    features.push("✨ Herramientas IA (Foto/Patente)");
  }
  
  if (canAccessCRM(plan)) {
    features.push("💻 Portal de Agencias completo: CRM, gestión de venta, comisiones y reportes");
  }

  return features;
}
