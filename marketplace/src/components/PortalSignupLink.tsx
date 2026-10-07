"use client";

import { trackWebEvent } from "@/lib/ga";
import { trackMetaEvent } from "@/lib/metaPixel";
import type { MouseEvent, ReactNode } from "react";

// CTA de /para-agencias hacia el registro en el portal. El portal es otro
// dominio sin Pixel, así que este clic es la última señal que Meta ve del
// embudo de agencias: se manda como `Lead` (evento estándar, se puede usar
// para optimizar campañas) y en GA como `agency_signup_click`.
//
// Cuando el portal tenga Pixel propio, `Lead` debería pasar a ser "completó
// el registro" y este clic a un evento custom (ej. `ClickPlanes`); si no, en
// Ads Manager se mezclan clics con registros reales. Hoy no hay CAPI para
// eventos del marketplace (sendMetaConversionEvent solo lo usa la app), así
// que no hace falta eventID para deduplicar.
//
// La navegación sale a otro dominio en la misma pestaña, lo que puede cortar
// el request del Pixel — por eso se demora la navegación un instante. Con
// Ctrl/Cmd/clic medio el browser abre otra pestaña y no hace falta esperar.
const NAV_DELAY_MS = 150;

export function PortalSignupLink({
  href,
  position,
  className,
  children,
}: {
  href: string;
  position: "hero" | "footer";
  className?: string;
  children: ReactNode;
}) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    trackMetaEvent("Lead", { content_name: "agency_signup", content_category: position });
    trackWebEvent("agency_signup_click", { position });

    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setTimeout(() => {
      window.location.href = href;
    }, NAV_DELAY_MS);
  }

  return (
    <a href={href} onClick={handleClick} className={className}>
      {children}
    </a>
  );
}
