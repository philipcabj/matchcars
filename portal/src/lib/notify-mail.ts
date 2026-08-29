// portal/src/lib/notify-mail.ts
// Versión servidor (Admin SDK) de sendNotificationEmail en lib/mail.ts (raíz)
// — el portal no puede importar ese archivo (paquete separado, usa el SDK de
// cliente). Recortado a los 4 tipos que hacen falta para ofertas/ventas
// desde el portal; mismo template visual, copiado tal cual.
import "server-only";

import { adminDb } from "@/lib/firebase-admin";

export type PortalEmailType =
  | "offer_accepted"
  | "counter_received"
  | "deal_canceled"
  | "vehicle_sold"
  | "team_invite"
  | "vehicle_approved"
  | "moderation_rejected"
  | "vehicle_deleted_by_admin"
  // Portal del comprador (Módulo A) — firma electrónica de Seña/Boleto y
  // pedidos de documentación, ver portal/src/app/mi-operacion/[token].
  | "buyer_portal_welcome"
  | "signature_requested"
  | "signature_otp"
  | "signature_completed"
  | "document_requested"
  // Entre Agencias — bolsa de pedidos entre agencias, ver
  // portal/src/app/api/agency/agency-requests/**.
  | "agency_request_response"
  | "agency_thread_message";

interface EmailData {
  // Uno de los dos: recipientUid (busca el email en users/{uid}, para
  // notificaciones a cuentas existentes) o recipientEmail directo (para
  // invitaciones a alguien que todavía no tiene cuenta en Matchcars).
  recipientUid?: string;
  recipientEmail?: string;
  senderName: string;
  subject?: string;
  carModel?: string;
  amount?: string;
  ctaLink?: string;
  agencyName?: string;
  roleLabel?: string;
  messagePreview?: string;
  otpCode?: string;
  documentLabel?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const APP_NAME = "MatchCars";
const ACCENT_COLOR = "#00A3FF";
// /app proxeaba al sitio legacy (export web de Expo) — quedó desactualizado
// ("la web vieja") y no tiene sentido mandar a nadie ahí (mismo cambio en
// lib/mail.ts, raíz). Cae en la home del marketplace nuevo hasta que se
// arme un deep link específico (Universal Links hoy solo cubren /car,
// /user-profile, /match y /confirmar-entrega, ver
// public/.well-known/apple-app-site-association).
const APP_URL = "https://matchcars.app";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.matchcars.app";
const APPLE_URL = "https://apps.apple.com/app/id6757968664";

const buildTemplate = (icon: string, title: string, body: string, ctaText: string, ctaLink: string): string => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#0E1117;padding:24px 32px;text-align:center;">
            <span style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-0.5px;">
              Match<span style="color:${ACCENT_COLOR};">Cars</span>
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px 0;text-align:center;">
            <div style="display:inline-block;background:#f0f7ff;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:30px;text-align:center;">
              ${icon}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px 8px;text-align:center;">
            <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0E1117;">${title}</h1>
            <p style="margin:0;font-size:15px;line-height:1.6;color:#555;">${body}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 40px 36px;text-align:center;">
            <a href="${ctaLink}"
               style="display:inline-block;background:${ACCENT_COLOR};color:#fff;text-decoration:none;padding:14px 32px;border-radius:50px;font-weight:700;font-size:15px;">
              ${ctaText}
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px;">
            <hr style="border:none;border-top:1px solid #eee;margin:0;" />
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px;text-align:center;">
            <p style="margin:0 0 12px;font-size:13px;color:#888;">También podés abrir la app desde acá:</p>
            <a href="${APPLE_URL}" style="display:inline-block;margin:0 6px;color:${ACCENT_COLOR};font-size:13px;font-weight:600;text-decoration:none;">📱 App Store</a>
            <span style="color:#ccc;">·</span>
            <a href="${PLAY_URL}" style="display:inline-block;margin:0 6px;color:${ACCENT_COLOR};font-size:13px;font-weight:600;text-decoration:none;">🤖 Google Play</a>
          </td>
        </tr>
        <tr>
          <td style="background:#f8f9fa;padding:20px 40px;text-align:center;border-top:1px solid #eee;">
            <p style="margin:0;font-size:12px;color:#aaa;line-height:1.5;">
              Recibís este correo porque tenés una cuenta en ${APP_NAME}.<br/>
              <a href="${APP_URL}" style="color:#aaa;text-decoration:underline;">${APP_URL}</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

export async function sendNotificationEmail(type: PortalEmailType, data: EmailData) {
  try {
    const ctaLink = data.ctaLink ?? APP_URL;
    let subject = data.subject ?? "";
    let html = "";

    switch (type) {
      case "offer_accepted": {
        const car = escapeHtml(data.carModel || "el auto");
        const amount = data.amount ? escapeHtml(data.amount) : "";
        subject = subject || `¡Tu oferta por ${data.carModel || "el auto"} fue aceptada!`;
        html = buildTemplate(
          "🤝",
          "¡Tu oferta fue aceptada!",
          `Llegaron a un acuerdo${amount ? ` por <strong>${amount}</strong>` : ""} por el <strong>${car}</strong>.<br/>Coordiná los detalles finales por el chat.`,
          "Ir al chat",
          ctaLink
        );
        break;
      }
      case "counter_received": {
        const sender = escapeHtml(data.senderName);
        const car = escapeHtml(data.carModel || "el auto");
        const amount = data.amount ? escapeHtml(data.amount) : "";
        subject = subject || `Te hicieron una contraoferta por ${data.carModel || "el auto"}`;
        html = buildTemplate(
          "🔄",
          "Te hicieron una contraoferta",
          `<strong>${sender}</strong> te contraofertó${amount ? ` <strong>${amount}</strong>` : ""} por el <strong>${car}</strong>.<br/>Entrá a la app para responder.`,
          "Ver contraoferta",
          ctaLink
        );
        break;
      }
      case "deal_canceled": {
        const car = escapeHtml(data.carModel || "el auto");
        subject = subject || `El acuerdo por ${data.carModel || "el auto"} fue cancelado`;
        html = buildTemplate(
          "⚠️",
          "Acuerdo cancelado",
          `El acuerdo por el <strong>${car}</strong> fue cancelado por la otra parte.`,
          "Ver chat",
          ctaLink
        );
        break;
      }
      case "vehicle_sold": {
        const car = escapeHtml(data.carModel || "el auto");
        subject = subject || `¡Venta confirmada! ${data.carModel || ""}`.trim();
        html = buildTemplate(
          "🎉",
          "Confirmá tu compra",
          `El vendedor marcó el <strong>${car}</strong> como entregado.<br/>Entrá a la app y confirmá que lo recibiste para cerrar la venta y calificar al vendedor.`,
          "Confirmar en la app",
          ctaLink
        );
        break;
      }
      case "vehicle_approved": {
        const car = escapeHtml(data.carModel || "Tu publicación");
        subject = subject || "¡Tu publicación ya está activa!";
        html = buildTemplate(
          "✅",
          "¡Tu publicación ya está activa!",
          `<strong>${car}</strong> ya está visible para todos los compradores en MatchCars.`,
          "Ver publicación",
          ctaLink
        );
        break;
      }
      case "moderation_rejected": {
        const car = escapeHtml(data.carModel || "Tu publicación");
        const reason = data.messagePreview ? escapeHtml(data.messagePreview) : "";
        subject = subject || "Tu publicación fue rechazada para corrección";
        html = buildTemplate(
          "⚠️",
          "Tu publicación necesita cambios",
          `<strong>${car}</strong> fue rechazada por moderación${
            reason ? `:<br/><em>"${reason}"</em>` : "."
          }<br/>Corregila y volvé a publicarla desde la app.`,
          "Ir a la app",
          ctaLink
        );
        break;
      }
      case "vehicle_deleted_by_admin": {
        const car = escapeHtml(data.carModel || "Tu publicación");
        const reason = data.messagePreview ? escapeHtml(data.messagePreview) : "";
        subject = subject || "Tu publicación fue eliminada";
        html = buildTemplate(
          "🚫",
          "Tu publicación fue eliminada",
          `<strong>${car}</strong> fue eliminada por el equipo de MatchCars${
            reason ? `:<br/><em>"${reason}"</em>` : "."
          }<br/>Si creés que fue un error, contactanos.`,
          "Ir a la app",
          ctaLink
        );
        break;
      }
      case "team_invite": {
        const sender = escapeHtml(data.senderName);
        const agency = escapeHtml(data.agencyName || "una agencia");
        const roleLabel = escapeHtml(data.roleLabel || "miembro del equipo");
        subject = subject || `${data.senderName} te invitó a sumarte a ${data.agencyName || "su equipo"} en Matchcars`;
        html = buildTemplate(
          "👋",
          "Te invitaron a un equipo",
          `<strong>${sender}</strong> te invitó a sumarte a <strong>${agency}</strong> en el Portal de Agencias de Matchcars, como <strong>${roleLabel}</strong>.<br/>Aceptá la invitación para crear tu acceso.`,
          "Aceptar invitación",
          ctaLink
        );
        break;
      }
      case "buyer_portal_welcome": {
        const car = escapeHtml(data.carModel || "tu compra");
        const agency = escapeHtml(data.agencyName || "la agencia");
        subject = subject || `Seguí el estado de tu compra — ${data.carModel || ""}`.trim();
        html = buildTemplate(
          "🚗",
          "Seguí tu compra paso a paso",
          `<strong>${agency}</strong> te invita a seguir el estado de tu compra del <strong>${car}</strong> — firmá la seña/boleto y subí lo que te pidan, todo desde este link.`,
          "Ver mi operación",
          ctaLink
        );
        break;
      }
      case "signature_requested": {
        const car = escapeHtml(data.carModel || "el auto");
        const agency = escapeHtml(data.agencyName || "la agencia");
        const doc = escapeHtml(data.documentLabel || "un documento");
        subject = subject || `${data.agencyName || "La agencia"} te envió ${data.documentLabel || "un documento"} para firmar`;
        html = buildTemplate(
          "✍️",
          "Tenés un documento para firmar",
          `<strong>${agency}</strong> te envió <strong>${doc}</strong> de tu compra del <strong>${car}</strong> — revisalo y firmalo desde este link.`,
          "Ir a firmar",
          ctaLink
        );
        break;
      }
      case "signature_otp": {
        const code = escapeHtml(data.otpCode || "");
        subject = subject || "Tu código para firmar el documento";
        html = buildTemplate(
          "🔐",
          "Tu código de verificación",
          `Usá este código para confirmar tu firma: <strong style="font-size:24px;letter-spacing:4px;">${code}</strong><br/>Vence en 10 minutos. Si no lo pediste vos, ignorá este mensaje.`,
          "Volver al documento",
          ctaLink
        );
        break;
      }
      case "signature_completed": {
        const car = escapeHtml(data.carModel || "el auto");
        subject = subject || "Documento firmado por las dos partes";
        html = buildTemplate(
          "✅",
          "Documento firmado",
          `El documento de la operación por <strong>${car}</strong> ya quedó firmado por ambas partes.`,
          "Ver documento",
          ctaLink
        );
        break;
      }
      case "document_requested": {
        const doc = escapeHtml(data.documentLabel || "un documento");
        const agency = escapeHtml(data.agencyName || "la agencia");
        subject = subject || `${data.agencyName || "La agencia"} te pidió un documento`;
        html = buildTemplate(
          "📄",
          "Te piden un documento",
          `<strong>${agency}</strong> necesita que subas <strong>${doc}</strong> para seguir con tu operación.`,
          "Subir documento",
          ctaLink
        );
        break;
      }
      case "agency_request_response": {
        const sender = escapeHtml(data.senderName);
        const car = escapeHtml(data.carModel || "tu pedido");
        subject = subject || `${data.senderName} tiene un auto para tu pedido de ${data.carModel || ""}`.trim();
        html = buildTemplate(
          "🤝",
          "Te respondieron un pedido",
          `<strong>${sender}</strong> tiene un auto que podría servir para tu pedido de <strong>${car}</strong> — se abrió un hilo privado en el portal para coordinar.`,
          "Ver conversación",
          ctaLink
        );
        break;
      }
      case "agency_thread_message": {
        const sender = escapeHtml(data.senderName);
        const preview = data.messagePreview ? escapeHtml(data.messagePreview) : "";
        subject = subject || `${data.senderName} te mandó un mensaje en Entre Agencias`;
        html = buildTemplate(
          "💬",
          "Nuevo mensaje",
          `<strong>${sender}</strong> te escribió${preview ? `:<br/><em>"${preview}"</em>` : "."}`,
          "Ver conversación",
          ctaLink
        );
        break;
      }
    }

    let recipientEmail = data.recipientEmail || "";
    if (!recipientEmail && data.recipientUid) {
      const userSnap = await adminDb.doc(`users/${data.recipientUid}`).get();
      if (!userSnap.exists) return;
      recipientEmail = userSnap.data()?.email || "";
    }
    if (!recipientEmail) return;

    await adminDb.collection("mail").add({
      to: [recipientEmail],
      ...(data.recipientUid ? { toUids: [data.recipientUid] } : {}),
      from: `${APP_NAME} <noreply@matchcars.app>`,
      message: { subject, html },
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("[notify-mail] Error sending email notification:", error);
  }
}
