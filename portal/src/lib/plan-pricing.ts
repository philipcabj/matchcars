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
  id: string; // Coincide con el prefijo de SubscriptionPlan en plans.ts (pro, pro_plus, pro_dealer, dealer_pro_plus)
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
      "🚗 Hasta 3 autos activos",
      "⭐ 2 destacados por mes (7 días c/u)",
      "🚀 Posicionamiento mejorado",
      "📊 Métricas básicas (Vistas y Likes)",
      "🏷️ Badge PRO",
      "📹 Video Walkaround",
      "✨ Mejorar foto (encuadre IA)",
      "💻 Acceso al Portal de Agencias",
      "💵 Control de gastos y margen por unidad",
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
      "🚗 Hasta 7 autos activos",
      "⭐ 5 destacados por mes",
      "🚀 Boost automático fines de semana",
      "✨ Tapar patente automáticamente (IA)",
      "📄 Ficha PDF con QR",
      "💻 Acceso al Portal de Agencias",
      "📞 CRM personal de consultas",
      "📋 Gestión de venta: checklist, documentos PDF y postventa automática",
      "📹 Video Walkaround",
      "🏷️ Badge PRO Plus",
      "✨ Mejorar foto (encuadre IA)",
      "💵 Control de gastos y margen por unidad",
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
      "🚗 Hasta 30 autos activos",
      "⭐ Destacados ilimitados",
      "📞 CRM de Leads con equipo (asignación entre vendedores)",
      "💻 Portal web con 5 usuarios incluidos",
      "📥 Carga Masiva (CSV)",
      "📸 Generador de flyers para redes/WhatsApp",
      "📋 Gestión de venta: checklist, documentos PDF y postventa automática",
      "🧮 Comisiones automáticas por vendedor",
      "💵 Control de gastos y margen por unidad",
      "✅ Badge Agencia Verificada",
      "📊 Reportes avanzados",
      "✨ Mejorar foto (encuadre IA)",
      "✨ Tapar patente automáticamente (IA)",
    ],
    color: "#9013FE",
  },
  {
    id: "dealer_pro_plus",
    title: "Dealer PRO Plus",
    subtitle: "Máxima Exposición",
    priceMonthly: 99,
    priceAnnual: 899,
    features: [
      "🚗 Autos activos ILIMITADOS",
      "🚀 Prioridad absoluta en búsquedas",
      "🏠 Presencia destacada en Home",
      "📈 Panel comparativo: tu agencia vs. el promedio",
      "👥 Portal web con 10 usuarios incluidos",
      "📞 CRM de Leads con equipo",
      "📋 Gestión de venta: checklist, documentos PDF y postventa automática",
      "🧮 Comisiones automáticas por vendedor",
      "💵 Control de gastos y margen por unidad",
      "✨ Mejorar foto (encuadre IA)",
      "✨ Tapar patente automáticamente (IA)",
    ],
    color: "#FFD700",
    comingSoon: true,
  },
];
