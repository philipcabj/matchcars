"use client";

import { trackWebEvent } from "@/lib/ga";

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || "http://localhost:3000";

// Mismo criterio visual que AppDownloadCard (sidebar del home) pero para
// reclutar agencias nuevas en vez de compradores — hasta ahora el único
// link al portal en todo el marketplace público estaba en el menú del
// NavBar, chico y fácil de pasar por alto.
export function AgencyPromoCard({ source }: { source?: string } = {}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-base font-extrabold">🏢 ¿Tenés una agencia?</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Publicá tu stock, gestioná leads y ventas, y sumá a tu equipo con comisiones automáticas — todo desde el
        Portal de Agencias.
      </p>
      <a
        href={`${PORTAL_URL}/planes`}
        onClick={() => trackWebEvent("web_cta_portal_click", { source })}
        className="rounded-lg bg-accent px-3 py-2.5 text-center text-xs font-bold text-accent-foreground transition hover:opacity-90"
      >
        Ver planes →
      </a>
    </div>
  );
}
