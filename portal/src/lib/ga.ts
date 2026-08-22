"use client";
// portal/src/lib/ga.ts
// Mismo GA4 que ya usan marketplace/ y la app (G-W062XQ8Z0L) — no una
// propiedad aparte: son solo dos agencias hoy, separar datos ahora
// complicaría más de lo que ordena. Los eventos van prefijados "portal_"
// para poder filtrarlos aparte del tráfico de compradores en el marketplace.
type Gtag = (...args: unknown[]) => void;

export function trackPortalEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  gtag?.("event", name, params);
}
