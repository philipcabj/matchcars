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
// Los 3 números (autos/destacados/usuarios) son el ÚNICO eje real de
// diferenciación entre planes desde la reestructuración de planes — todo lo
// demás (PORTAL_ITEMS) es idéntico en pro/pro_plus/pro_dealer, por eso se
// cuenta una sola vez en una banda compartida en vez de repetirse por card.
// "Boost automático fines de semana" queda deliberadamente afuera de esta
// lista — sigue funcionando igual en el producto (pro_plus+), pero no se
// promociona en la página de planes (decisión del 2026-08-23: no aportaba
// claridad como diferenciador).
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

// Banda "Portal de Agencias completo" — un ícono + label corto por ítem,
// mismo contenido en los 3 planes pagos. Incluye tanto el portal (CRM,
// ventas, comisiones, reportes) como el resto de herramientas que también
// son universales hoy (video, IA, PDF, flyers, ficha pública de agencia).
export const PORTAL_ITEMS: { icon: string; label: string; sub: string }[] = [
  { icon: "💬", label: "CRM de leads", sub: "WhatsApp, Instagram, teléfono" },
  { icon: "📋", label: "Gestión de venta", sub: "y postventa automática" },
  { icon: "🧮", label: "Comisiones", sub: "automáticas por vendedor" },
  { icon: "📊", label: "Reportes avanzados", sub: "+ performance de equipo" },
  { icon: "📈", label: "Panel comparativo", sub: "vs. otras agencias" },
  { icon: "📥", label: "Carga masiva", sub: "por CSV" },
  { icon: "🏅", label: "Ficha pública", sub: "de agencia en el marketplace" },
  { icon: "📸", label: "Generador de flyers", sub: "para redes y WhatsApp" },
  { icon: "📹", label: "Video Walkaround", sub: "en cada publicación" },
  { icon: "✨", label: "Mejora de fotos (IA)", sub: "y tapado de patente" },
  { icon: "📄", label: "Ficha PDF", sub: "con QR para compartir" },
];

// Mismo contenido que PORTAL_ITEMS, agrupado en categorías con más detalle
// — para la sección expandible "Ver el detalle completo".
export const PORTAL_CAPABILITIES: { title: string; items: string[] }[] = [
  {
    title: "CRM de leads",
    items: [
      "Leads orgánicos desde el chat de la app (mensaje u oferta)",
      "Leads manuales: WhatsApp, Instagram, teléfono, presencial",
      "Historial de actividad por lead y edición de contacto",
      "Asignación de leads a vendedores del equipo",
    ],
  },
  {
    title: "Gestión de venta",
    items: [
      "Checklist de trámites (transferencia, verificación, etc.)",
      "Financiación y parte de pago (usado como parte del pago)",
      "Documentos y ficha PDF con QR",
      "Postventa automática con confirmación del comprador",
    ],
  },
  {
    title: "Equipo y comisiones",
    items: [
      "Roles: dueño/a, gerente, vendedor/a",
      "Registro de actividad del equipo (quién hizo qué)",
      "Reglas de comisión configurables (%, fijo, escalonado)",
      "Cálculo automático de comisión por venta cerrada",
    ],
  },
  {
    title: "Reportes",
    items: [
      "Métricas de stock: vistas, likes, días publicado",
      "Reportes avanzados de qué necesita atención",
      "Performance de vendedores: leads, conversión, tiempo de cierre",
      "Panel comparativo vs. el promedio de otras agencias",
    ],
  },
  {
    title: "Marketing y presencia",
    items: [
      "Ficha pública de agencia en el marketplace",
      "Generador de flyers para redes y WhatsApp",
      "Video Walkaround en cada publicación",
      "Mejora de fotos y tapado de patente automático (IA)",
      "Ficha PDF con QR para compartir",
    ],
  },
  {
    title: "Stock y publicaciones",
    items: [
      "Alta, edición y baja de vehículos",
      "Carga masiva por CSV",
      "Control de gastos y margen por unidad",
      "Historial de precios por vehículo",
    ],
  },
];

export const PLAN_PRICING: PlanPricing[] = [
  {
    id: "pro",
    title: "Plan PRO",
    subtitle: "Para agencias chicas",
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
    subtitle: "Para agencias en crecimiento",
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
    subtitle: "Para agencias de alto volumen",
    priceMonthly: 59.99,
    priceAnnual: 499.99,
    maxCars: 100,
    featuredPerMonth: Infinity,
    seats: 30,
    color: "#9013FE",
  },
];
