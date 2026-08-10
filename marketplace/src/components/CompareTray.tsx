"use client";

import { useCompare } from "@/contexts/CompareContext";
import Link from "next/link";

// Barra flotante — colapsada (no renderiza nada) hasta que hay 1+ auto
// elegido para comparar. Contextual, no un panel lateral permanente (ver
// nota de layout en el plan de esta fase).
export function CompareTray() {
  const { ids, clear } = useCompare();

  if (ids.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card shadow-lg">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-3">
        <p className="text-sm font-semibold">
          {ids.length} auto{ids.length === 1 ? "" : "s"} para comparar
        </p>
        <div className="flex items-center gap-3">
          <button type="button" onClick={clear} className="text-xs font-semibold text-muted-foreground underline">
            Vaciar
          </button>
          <Link
            href={ids.length >= 2 ? `/comparar?ids=${ids.join(",")}` : "#"}
            aria-disabled={ids.length < 2}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              ids.length >= 2 ? "bg-accent text-accent-foreground" : "cursor-not-allowed bg-border text-muted-foreground"
            }`}
          >
            {ids.length >= 2 ? "Ver comparación" : "Elegí 1 auto más"}
          </Link>
        </div>
      </div>
    </div>
  );
}
