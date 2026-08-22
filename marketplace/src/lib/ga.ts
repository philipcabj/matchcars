"use client";
// marketplace/src/lib/ga.ts
// Eventos custom sobre el GA4 que YA está cargado en app/layout.tsx
// (G-W062XQ8Z0L, el mismo que usa el export web de la app — ver comentario
// ahí). No inicializa nada nuevo, solo llama al `gtag` global que ese script
// ya deja en window.
type Gtag = (...args: unknown[]) => void;

export function trackWebEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  gtag?.("event", name, params);
}
