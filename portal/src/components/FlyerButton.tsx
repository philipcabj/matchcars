"use client";

import QRCode from "qrcode";
import { useState } from "react";

const MARKETPLACE_URL = process.env.NEXT_PUBLIC_MARKETPLACE_URL || "https://matchcars.app";
const ACCENT = "#f97316"; // mismo naranja que --accent en globals.css

interface FlyerVehicle {
  id: string;
  brand?: string | null;
  model?: string | null;
  year?: number | string | null;
  price?: number | string | null;
  currency?: string | null;
  coverImage?: string | null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen."));
    img.src = src;
  });
}

// Genera una imagen 1080x1350 (foto + precio + QR al catálogo público) lista
// para compartir en WhatsApp/Instagram — reusa la ficha pública del
// marketplace (que ya tiene su propio QR/compartir) como destino del QR acá,
// pero pensado para promoción activa (mandarlo a un grupo, subirlo a una
// story) en vez de solo compartir un link.
export function FlyerButton({ vehicle }: { vehicle: FlyerVehicle }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!vehicle.coverImage) {
      setError("Este auto no tiene foto de portada.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const W = 1080;
      const H = 1350;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas no soportado.");

      const photo = await loadImage(`/api/image-proxy?url=${encodeURIComponent(vehicle.coverImage)}`);
      const scale = Math.max(W / photo.width, H / photo.height);
      const sw = W / scale;
      const sh = H / scale;
      const sx = (photo.width - sw) / 2;
      const sy = (photo.height - sh) / 2;
      ctx.drawImage(photo, sx, sy, sw, sh, 0, 0, W, H);

      const grad = ctx.createLinearGradient(0, H * 0.4, 0, H);
      grad.addColorStop(0, "rgba(14,17,23,0)");
      grad.addColorStop(1, "rgba(14,17,23,0.94)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, H * 0.4, W, H * 0.6);

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 40px Arial, sans-serif";
      ctx.fillText("MatchCars", 48, 76);

      const title = `${vehicle.brand ?? ""} ${vehicle.model ?? ""}`.trim() || "Auto en venta";
      ctx.font = "bold 56px Arial, sans-serif";
      ctx.fillText(title, 48, H - 220, W - 340);

      if (vehicle.year) {
        ctx.font = "36px Arial, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillText(String(vehicle.year), 48, H - 170);
      }

      ctx.font = "bold 64px Arial, sans-serif";
      ctx.fillStyle = ACCENT;
      const priceText = vehicle.price
        ? `${vehicle.currency ?? "ARS"} ${Number(vehicle.price).toLocaleString("es-AR")}`
        : "Consultar precio";
      ctx.fillText(priceText, 48, H - 92);

      const link = `${MARKETPLACE_URL}/car/${vehicle.id}`;
      const qrDataUrl = await QRCode.toDataURL(link, { margin: 1, width: 220, color: { dark: "#0E1117", light: "#FFFFFF" } });
      const qrImg = await loadImage(qrDataUrl);
      const qrSize = 190;
      const qrX = W - qrSize - 48;
      const qrY = H - qrSize - 48;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32);
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("No se pudo generar la imagen.");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flyer-${(vehicle.brand ?? "auto").toString().toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${vehicle.id}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo generar el flyer — probá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground disabled:opacity-60"
      >
        {busy ? "Generando…" : "📸 Flyer para compartir"}
      </button>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
