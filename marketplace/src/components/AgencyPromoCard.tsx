"use client";

import { trackWebEvent } from "@/lib/ga";
import Link from "next/link";

// Recluta agencias nuevas → lleva a la landing /para-agencias (que después
// deriva al portal). Mismo criterio visual que AppDownloadCard.
export function AgencyPromoCard({ source }: { source?: string } = {}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-base font-extrabold">🏢 ¿Tenés una agencia?</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Publicá tu stock, gestioná leads y ventas, y sumá a tu equipo con comisiones automáticas — todo desde el
        Portal de Agencias.
      </p>
      <Link
        href="/para-agencias"
        onClick={() => trackWebEvent("web_cta_portal_click", { source })}
        className="rounded-lg bg-accent px-3 py-2.5 text-center text-xs font-bold text-accent-foreground transition hover:opacity-90"
      >
        Conocé el Portal de Agencias →
      </Link>
    </div>
  );
}
