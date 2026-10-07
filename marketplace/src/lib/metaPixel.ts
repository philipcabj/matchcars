"use client";
// marketplace/src/lib/metaPixel.ts
// Eventos sobre el Meta Pixel que YA está cargado en app/layout.tsx. Igual que
// ga.ts: no inicializa nada, solo llama al `fbq` global que ese script deja.
type Fbq = (...args: unknown[]) => void;

export function trackMetaEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const fbq = (window as unknown as { fbq?: Fbq }).fbq;
  fbq?.("track", name, params);
}
