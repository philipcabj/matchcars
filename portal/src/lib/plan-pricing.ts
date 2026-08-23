// portal/src/lib/plan-pricing.ts
//
// Copia de los datos de PLAN_DEFINITIONS de app/(screens)/subscribe.tsx (raíz
// del repo) — mismo criterio que plans.ts: copia extendida, no paquete
// compartido, para no tocar la app existente. Los planes se contratan y
// gestionan únicamente desde la app (RevenueCat/App Store/Google Play); acá
// solo se muestran para que el dealer pueda ver qué incluye cada uno sin
// salir del portal. Si cambian precios o features en subscribe.tsx, hay que
// replicarlo acá a mano.
//
// Los 3 números (autos/destacados/usuarios) van separados del resto a
// propósito — son el único eje real de diferenciación entre planes desde la
// reestructuración de planes (portal completo en los 3). PORTAL_ITEMS y
// PLAN_EXTRAS son idénticos en pro/pro_plus/pro_dealer (mismo criterio que el
// mockup aprobado: un solo bloque de portal, no una lista larga repetida y
// variada por plan).
export interface PlanPricing {
  id: string; // Coincide con el prefijo de SubscriptionPlan en plans.ts (pro, pro_plus, pro_dealer)
  title: string;
  subtitle: string;
  priceMonthly: number;
  priceAnnual: number;
  maxCars: number; // Infinity = ilimitados
  featuredPerMonth: number; // Infinity = ilimitados
  seats: number;
  color: string;
  recommended?: boolean;
}

export const FREE_PLAN = {
  id: "free",
  title: "Gratis",
  subtitle: "Para empezar",
  features: ["🚗 1 auto activo", "📊 Métricas básicas"],
};

// El bloque destacado "Portal de Agencias — todo incluido" de cada card —
// mismo contenido en los 3 planes pagos.
export const PORTAL_ITEMS = [
  "CRM de leads: WhatsApp, Instagram, teléfono",
  "Gestión de venta y postventa automática",
  "Comisiones automáticas por vendedor",
  "Reportes avanzados + performance de equipo",
  "Panel comparativo vs. otras agencias",
  "Carga masiva (CSV)",
];

// Lo demás que también es igual en los 3 (video, IA, PDF) — chico, sin caja,
// debajo del bloque de portal.
export const PLAN_EXTRAS = ["📹 Video Walkaround", "✨ Mejorar foto y tapar patente (IA)", "📄 Ficha PDF con QR"];

export const PLAN_PRICING: PlanPricing[] = [
  {
    id: "pro",
    title: "Plan PRO",
    subtitle: "Ideal para particulares activos",
    priceMonthly: 9.99,
    priceAnnual: 79.99,
    maxCars: 15,
    featuredPerMonth: 5,
    seats: 5,
    color: "#4A90E2",
  },
  {
    id: "pro_plus",
    title: "Plan PRO Plus",
    subtitle: "Todo lo de PRO + más potencia",
    priceMonthly: 19.99,
    priceAnnual: 169.99,
    maxCars: 40,
    featuredPerMonth: 15,
    seats: 10,
    color: "#50E3C2",
    recommended: true,
  },
  {
    id: "pro_dealer",
    title: "Plan PRO Dealer",
    subtitle: "Solución para Agencias",
    priceMonthly: 59.99,
    priceAnnual: 499.99,
    maxCars: 100,
    featuredPerMonth: Infinity,
    seats: 30,
    color: "#9013FE",
  },
];
