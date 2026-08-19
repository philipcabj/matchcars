// portal/src/components/DeliveryQrCode.tsx
// QR para que el comprador confirme la entrega + puntúe al vendedor en el
// momento físico de la entrega — apunta a una página pública del
// marketplace (marketplace/src/app/confirmar-entrega/[vehicleId]/page.tsx),
// sin necesitar que el comprador tenga sesión propia (el token del link es
// la autorización). Mismo paquete `qrcode` que ya usa FlyerButton.tsx.
"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

const MARKETPLACE_URL = process.env.NEXT_PUBLIC_MARKETPLACE_URL || "https://matchcars.app";

export function DeliveryQrCode({ vehicleId, token }: { vehicleId: string; token: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const url = `${MARKETPLACE_URL}/confirmar-entrega/${vehicleId}?token=${token}`;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, width: 200, color: { dark: "#0E1117", light: "#FFFFFF" } }).then((d) => {
      if (!cancelled) setDataUrl(d);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-border bg-background p-3">
      <p className="text-xs font-semibold text-foreground">Mostrale este código al comprador al entregarle el auto</p>
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUrl} alt="Código QR para confirmar la entrega" width={160} height={160} />
      ) : (
        <div className="flex h-40 w-40 items-center justify-center text-xs text-muted-foreground">Generando…</div>
      )}
      <p className="text-center text-[11px] text-muted-foreground">
        Al escanearlo, confirma que recibió el auto y puntúa al vendedor — sin necesitar tener sesión abierta.
      </p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-accent">
        Abrir el link →
      </a>
    </div>
  );
}
