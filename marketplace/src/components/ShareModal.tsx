"use client";

import { useState } from "react";

// Modal de compartir con QR, link y WhatsApp — mismo espíritu que el
// ShareCard/ShareSheet de la app vieja, pensado para perfiles (agencia y
// particular) donde un solo botón "Compartir" (Web Share API) se queda
// corto en desktop.
export function ShareModal({ url, title, qrSvg }: { url: string; title: string; qrSvg: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const waLink = `https://wa.me/?text=${encodeURIComponent(`${title} — ${url}`)}`;
  const mailLink = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}\n${url}`)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard puede fallar (permisos) — sin fallback ulterior, no es crítico.
    }
  };

  // Convierte el SVG (generado server-side) a PNG en el browser vía canvas —
  // así se puede descargar/mandar por WhatsApp como imagen, no solo escanear
  // en pantalla. No hay forma de descargar un <img> con dangerouslySetInnerHTML
  // directo, por eso el paso por canvas.
  const handleDownloadQr = () => {
    const svgBlob = new Blob([qrSvg], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const size = 512;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(svgUrl);
      const link = document.createElement("a");
      link.download = `qr-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    img.src = svgUrl;
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Usuario canceló el share nativo — no es un error real.
        return;
      }
    }
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleNativeShare}
        className="flex shrink-0 items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground shadow transition hover:bg-accent/90"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 8v5.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V8M8 1v9M8 1L5 4M8 1l3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Compartir
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex w-full items-center justify-between">
              <p className="text-sm font-bold">Compartir</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-background"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div
              className="h-40 w-40 rounded-xl bg-white p-2 [&_svg]:h-full [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <button type="button" onClick={handleDownloadQr} className="-mt-2 text-xs font-semibold text-accent">
              Descargar QR
            </button>

            <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <p className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground">{url}</p>
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground"
              >
                {copied ? "¡Copiado!" : "Copiar"}
              </button>
            </div>

            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Compartir por WhatsApp
            </a>

            <a
              href={mailLink}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground"
            >
              Compartir por email
            </a>
          </div>
        </div>
      )}
    </>
  );
}
