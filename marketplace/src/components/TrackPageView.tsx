"use client";

import { trackWebEvent } from "@/lib/ga";
import { useEffect } from "react";

// Dispara un evento custom de GA4 al montar — para páginas que son Server
// Components (no pueden llamar a trackWebEvent directo) pero necesitan
// registrar algo más específico que el pageview automático de gtag
// (ej. qué auto/agencia se vio, no solo la URL).
export function TrackPageView({ event, params }: { event: string; params?: Record<string, unknown> }) {
  useEffect(() => {
    trackWebEvent(event, params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  return null;
}
