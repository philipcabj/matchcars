// portal/src/lib/plan-pricing.ts
//
// Copia de los datos de PLAN_DEFINITIONS de app/(screens)/subscribe.tsx (raíz
// del repo) — mismo criterio que plans.ts: copia extendida, no paquete
// compartido, para no tocar la app existente. Los planes se contratan y
// gestionan únicamente desde la app (RevenueCat/App Store/Google Play); acá
// solo se muestran para que el dealer pueda ver qué incluye cada uno sin
// salir del portal. Si cambian precios o features en subscribe.tsx, hay que
// replicarlo acá a mano.
export interface PlanPricing {
  id: string; // Coincide con el prefijo de SubscriptionPlan en plans.ts (pro, pro_plus, pro_dealer)
  title: string;
  subtitle: string;
  priceMonthly: number;
  priceAnnual: number;
  features: string[];
  color: string;
  recommended?: boolean;
  comingSoon?: boolean;
}

export const FREE_PLAN: Omit<PlanPricing, "priceMonthly" | "priceAnnual" | "color"> = {
  id: "free",
  title: "Gratis",
  subtitle: "Para empezar",
  features: ["🚗 1 auto activo", "📊 Métricas básicas"],
};

export const PLAN_PRICING: PlanPricing[] = [
  {
    id: "pro",
    title: "Plan PRO",
    subtitle: "Ideal para particulares activos",
    priceMonthly: 9.99,
    priceAnnual: 79.99,
    features: [
      "🚗 Hasta 15 autos activos",
      "⭐ 5 destacados por mes (7 días c/u)",
      "🚀 Posicionamiento mejorado",
      "🏷️ Badge PRO",
      "📹 Video Walkaround",
      "✨ Mejorar foto y tapar patente (IA)",
      "💵 Control de gastos y margen por unidad",
      "👥 Hasta 5 usuarios de portal",
      "💻 Portal de Agencias completo: CRM de leads, gestión de venta, comisiones automáticas y reportes",
    ],
    color: "#4A90E2",
  },
  {
    id: "pro_plus",
    title: "Plan PRO Plus",
    subtitle: "Todo lo de PRO + más potencia",
    priceMonthly: 19.99,
    priceAnnual: 169.99,
    features: [
      "🚗 Hasta 40 autos activos",
      "⭐ 15 destacados por mes",
      "🚀 Boost automático fines de semana",
      "🏷️ Badge PRO Plus",
      "📹 Video Walkaround",
      "✨ Mejorar foto y tapar patente (IA)",
      "📄 Ficha PDF con QR",
      "💵 Control de gastos y margen por unidad",
      "👥 Hasta 10 usuarios de portal",
      "💻 Portal de Agencias completo: CRM de leads, gestión de venta, comisiones automáticas y reportes",
    ],
    color: "#50E3C2",
    recommended: true,
  },
  {
    id: "pro_dealer",
    title: "Plan PRO Dealer",
    subtitle: "Solución para Agencias",
    priceMonthly: 59.99,
    priceAnnual: 499.99,
    features: [
      "🚗 Hasta 100 autos activos",
      "⭐ Destacados ilimitados",
      "🚀 Boost automático fines de semana",
      "✅ Badge Agencia Verificada",
      "📸 Generador de flyers para redes/WhatsApp",
      "📹 Video Walkaround",
      "✨ Mejorar foto y tapar patente (IA)",
      "📄 Ficha PDF con QR",
      "💵 Control de gastos y margen por unidad",
      "👥 Hasta 30 usuarios de portal",
      "💻 Portal de Agencias completo: CRM de leads, gestión de venta, comisiones automáticas y reportes",
    ],
    color: "#9013FE",
  },
];
