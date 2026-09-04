// marketplace/src/lib/mail-server.ts
// Encola un email escribiendo a la colección `mail` (extensión Trigger Email),
// mismo mecanismo que usan portal/src/lib/notify-mail.ts y lib/mail.ts (raíz).
// Acá solo hace falta un tipo: aviso de consulta nueva desde la web pública.
import "server-only";

import { adminDb } from "@/lib/firebase-admin";

const APP_NAME = "MatchCars";
const ACCENT = "#F97316";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://matchcars.app";
const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || "https://portal.matchcars.app";
const APPLE_URL = "https://apps.apple.com/app/id6757968664";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.matchcars.app";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface WebLeadMail {
  to: string;
  toUid?: string;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  message: string;
  carLabel?: string;
  ctaLink: string;
  ctaText: string;
  isPaidSeller?: boolean;
}

export async function sendWebLeadEmail(data: WebLeadMail): Promise<void> {
  const name = escapeHtml(data.contactName);
  const car = data.carLabel ? escapeHtml(data.carLabel) : "";
  const contactBits = [data.contactPhone, data.contactEmail].filter(Boolean).map((b) => escapeHtml(b!)).join(" · ");
  const subject = car ? `Nueva consulta por ${data.carLabel}` : `Nueva consulta de ${data.contactName}`;

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 16px;"><tr><td align="center">
    <table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:#0E1117;padding:24px 32px;text-align:center;">
        <span style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-0.5px;">Match<span style="color:${ACCENT};">Cars</span></span>
      </td></tr>
      <tr><td style="padding:32px 40px 8px;text-align:center;">
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0E1117;">Nueva consulta desde la web</h1>
        ${car ? `<p style="margin:0;font-size:15px;color:#555;">por <strong>${car}</strong></p>` : ""}
      </td></tr>
      <tr><td style="padding:16px 40px 8px;">
        <table width="100%" style="border-collapse:collapse;font-size:14px;color:#333;">
          <tr><td style="padding:6px 0;color:#888;width:90px;">Nombre</td><td style="padding:6px 0;font-weight:600;">${name}</td></tr>
          ${contactBits ? `<tr><td style="padding:6px 0;color:#888;">Contacto</td><td style="padding:6px 0;font-weight:600;">${contactBits}</td></tr>` : ""}
        </table>
        <div style="margin-top:12px;padding:14px 16px;background:#f7f9fb;border-radius:10px;font-size:14px;color:#444;font-style:italic;">"${escapeHtml(data.message)}"</div>
      </td></tr>
      <tr><td style="padding:24px 40px 12px;text-align:center;">
        <a href="${data.ctaLink}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;padding:14px 32px;border-radius:50px;font-weight:700;font-size:15px;">${escapeHtml(data.ctaText)}</a>
      </td></tr>
      <tr><td style="padding:8px 40px 4px;text-align:center;">
        <p style="margin:0 0 10px;font-size:13px;color:#888;">También podés responder desde:</p>
        ${data.isPaidSeller ? `<a href="${PORTAL_URL}/dashboard/leads" style="display:inline-block;margin:0 6px;color:${ACCENT};font-size:13px;font-weight:600;text-decoration:none;">💻 Portal</a><span style="color:#ccc;">·</span>` : ""}
        <a href="${APPLE_URL}" style="display:inline-block;margin:0 6px;color:${ACCENT};font-size:13px;font-weight:600;text-decoration:none;">📱 App Store</a>
        <span style="color:#ccc;">·</span>
        <a href="${PLAY_URL}" style="display:inline-block;margin:0 6px;color:${ACCENT};font-size:13px;font-weight:600;text-decoration:none;">🤖 Google Play</a>
        <span style="color:#ccc;">·</span>
        <a href="${SITE_URL}" style="display:inline-block;margin:0 6px;color:${ACCENT};font-size:13px;font-weight:600;text-decoration:none;">🌐 matchcars.app</a>
      </td></tr>
      <tr><td style="background:#f8f9fa;padding:20px 40px;text-align:center;border-top:1px solid #eee;margin-top:12px;">
        <p style="margin:0;font-size:12px;color:#aaa;line-height:1.5;">Recibís este correo porque tenés una publicación en ${APP_NAME}.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  await adminDb.collection("mail").add({
    to: [data.to],
    ...(data.toUid ? { toUids: [data.toUid] } : {}),
    from: `${APP_NAME} <noreply@matchcars.app>`,
    message: { subject, html },
    createdAt: new Date(),
  });
}
