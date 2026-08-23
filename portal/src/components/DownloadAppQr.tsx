// portal/src/components/DownloadAppQr.tsx
// Bloque oscuro "Descargá la app" con QR reales (mismo paquete qrcode que ya
// usa DeliveryQrCode.tsx) — compartido entre /planes y /login para que el
// mensaje de "los planes se contratan desde la app" se vea igual en los dos
// lugares donde aparece.
"use client";

import { Big_Shoulders } from "next/font/google";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

const display = Big_Shoulders({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-download-display" });

const APPLE_URL = "https://apps.apple.com/ar/app/matchcars/id6757968664";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.matchcars.app";

function useQrDataUrl(url: string): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, width: 180, color: { dark: "#1C1A16", light: "#FFFFFF" } }).then((d) => {
      if (!cancelled) setDataUrl(d);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return dataUrl;
}

export function DownloadAppQr({
  id,
  title = "Descargá la app de MatchCars",
  description = "Los planes se contratan y gestionan desde la app — creá tu cuenta, elegí tu plan, y entrá al portal desde acá con el mismo mail.",
}: {
  id?: string;
  title?: string;
  description?: string;
}) {
  const appleQr = useQrDataUrl(APPLE_URL);
  const playQr = useQrDataUrl(PLAY_URL);

  return (
    <div
      id={id}
      className={`${display.variable} flex flex-col items-center gap-6 rounded-[20px] bg-foreground p-8 text-background sm:flex-row sm:justify-between`}
    >
      <div className="max-w-sm text-center sm:text-left">
        <p className="[font-family:var(--font-download-display)] text-[11px] font-semibold tracking-widest text-accent uppercase">
          Para contratar
        </p>
        <h3 className="mt-1.5 text-2xl font-extrabold" style={{ fontFamily: "var(--font-download-display)" }}>
          {title}
        </h3>
        <p className="mt-1.5 text-[13px] text-background/70">{description}</p>
      </div>
      <div className="flex gap-4">
        <a href={APPLE_URL} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2">
          <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-white p-2">
            {appleQr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={appleQr} alt="Código QR para descargar en App Store" width={80} height={80} />
            ) : (
              <div className="h-20 w-20 animate-pulse rounded bg-muted/30" />
            )}
          </div>
          <span className="text-[11px] font-semibold text-background/80">🍏 App Store</span>
        </a>
        <a href={PLAY_URL} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2">
          <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-white p-2">
            {playQr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={playQr} alt="Código QR para descargar en Google Play" width={80} height={80} />
            ) : (
              <div className="h-20 w-20 animate-pulse rounded bg-muted/30" />
            )}
          </div>
          <span className="text-[11px] font-semibold text-background/80">🤖 Google Play</span>
        </a>
      </div>
    </div>
  );
}
