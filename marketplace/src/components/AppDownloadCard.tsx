"use client";

import { APPLE_URL, PLAY_URL } from "@/lib/app-links";
import { trackWebEvent } from "@/lib/ga";

// Se usa en el sidebar de desktop (home) y también inline en mobile, donde
// el sidebar entero queda oculto — antes esto significaba que en mobile
// nunca se veía ninguna promoción para bajar la app.
export function AppDownloadCard({ source }: { source?: string } = {}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-accent/50 bg-gradient-to-br from-[#1a2030] to-[#0E1117] p-5 text-white shadow-lg">
      <p className="text-base font-extrabold">
        📲 Llevá Match<span className="text-accent">Cars</span> en el bolsillo
      </p>
      <p className="text-xs leading-relaxed text-white/70">
        Ofertar, mensajear con vendedores, guardar favoritos y publicar tu auto gratis: todo eso es exclusivo de la app.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href={APPLE_URL}
          onClick={() => trackWebEvent("web_cta_download_app_click", { store: "apple", source })}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-xs font-bold text-[#0E1117] transition hover:bg-white/90"
        >
          🍏 App Store
        </a>
        <a
          href={PLAY_URL}
          onClick={() => trackWebEvent("web_cta_download_app_click", { store: "google", source })}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-xs font-bold text-[#0E1117] transition hover:bg-white/90"
        >
          🤖 Google Play
        </a>
      </div>
    </div>
  );
}
