// marketplace/src/lib/qrcode.ts
// Genera el QR de compartir en el servidor (SVG inline, sin JS de cliente
// ni servicio externo) — se llama desde el Server Component de la página.
import "server-only";

import QRCode from "qrcode";

export async function generateQrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    margin: 1,
    color: { dark: "#0E1117", light: "#FFFFFF" },
  });
}
