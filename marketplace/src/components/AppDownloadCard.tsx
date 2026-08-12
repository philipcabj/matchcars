import { APPLE_URL, PLAY_URL } from "@/lib/app-links";

// Se usa en el sidebar de desktop (home) y también inline en mobile, donde
// el sidebar entero queda oculto — antes esto significaba que en mobile
// nunca se veía ninguna promoción para bajar la app.
export function AppDownloadCard() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-accent/50 bg-gradient-to-br from-[#1a2030] to-[#0E1117] p-5 text-white shadow-lg">
      <p className="text-base font-extrabold">
        📲 Llevá Match<span className="text-accent">Cars</span> en el bolsillo
      </p>
      <p className="text-xs leading-relaxed text-white/70">
        Chateá con vendedores, recibí notificaciones al instante y publicá tu auto gratis desde la app.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href={APPLE_URL}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-xs font-bold text-[#0E1117] transition hover:bg-white/90"
        >
          🍏 App Store
        </a>
        <a
          href={PLAY_URL}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-xs font-bold text-[#0E1117] transition hover:bg-white/90"
        >
          🤖 Google Play
        </a>
      </div>
    </div>
  );
}
