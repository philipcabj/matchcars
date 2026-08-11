"use client";

import { useState } from "react";

export function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // Usuario canceló el share nativo — no es un error real, no hacer nada.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard puede fallar (permisos) — sin fallback ulterior, no es crítico.
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-accent hover:text-accent"
    >
      {copied ? "¡Copiado!" : "↗ Compartir publicación"}
    </button>
  );
}
