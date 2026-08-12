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
      className="flex shrink-0 items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground shadow transition hover:bg-accent/90"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 8v5.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V8M8 1v9M8 1L5 4M8 1l3 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {copied ? "¡Copiado!" : "Compartir"}
    </button>
  );
}
