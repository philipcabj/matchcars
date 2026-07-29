import { addDoc, collection, doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export type EmailType =
  | "like"
  | "match"
  | "message"
  | "moderation_rejected"
  | "vehicle_approved"
  | "offer_received"
  | "offer_accepted"
  | "counter_accepted"
  | "counter_received"
  | "vehicle_sold"
  | "deal_canceled"
  | "price_drop";

interface EmailData {
  recipientUid: string;
  recipientName?: string;
  senderName: string;
  senderUid?: string;
  subject: string;
  carModel?: string;
  messagePreview?: string;
  ctaLink?: string;
  amount?: string;
  newPrice?: string;
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
const APP_URL = "https://matchcars.app";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.matchcars.app";
const APPLE_URL = "https://apps.apple.com/app/id6757968664";

const buildTemplate = (
  icon: string,
  title: string,
  body: string,
  ctaText: string,
  ctaLink: string
): string => `<!DOCTYPE html>
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

        <!-- Header -->
        <tr>
          <td style="background:#0E1117;padding:24px 32px;text-align:center;">
            <span style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-0.5px;">
              Match<span style="color:${ACCENT_COLOR};">Cars</span>
            </span>
          </td>
        </tr>

        <!-- Icon -->
        <tr>
          <td style="padding:36px 32px 0;text-align:center;">
            <div style="display:inline-block;background:#f0f7ff;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:30px;text-align:center;">
              ${icon}
            </div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:24px 40px 8px;text-align:center;">
            <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0E1117;">${title}</h1>
            <p style="margin:0;font-size:15px;line-height:1.6;color:#555;">${body}</p>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:28px 40px 36px;text-align:center;">
            <a href="${ctaLink}"
               style="display:inline-block;background:${ACCENT_COLOR};color:#fff;text-decoration:none;padding:14px 32px;border-radius:50px;font-weight:700;font-size:15px;">
              ${ctaText}
            </a>
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:0 40px;">
            <hr style="border:none;border-top:1px solid #eee;margin:0;" />
          </td>
        </tr>

        <!-- App links -->
        <tr>
          <td style="padding:24px 40px;text-align:center;">
            <p style="margin:0 0 12px;font-size:13px;color:#888;">También podés abrir la app desde acá:</p>
            <a href="${APPLE_URL}" style="display:inline-block;margin:0 6px;color:${ACCENT_COLOR};font-size:13px;font-weight:600;text-decoration:none;">📱 App Store</a>
            <span style="color:#ccc;">·</span>
            <a href="${PLAY_URL}" style="display:inline-block;margin:0 6px;color:${ACCENT_COLOR};font-size:13px;font-weight:600;text-decoration:none;">🤖 Google Play</a>
          </td>
        </tr>

        <!-- Footer -->
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

export const sendNotificationEmail = async (type: EmailType, data: EmailData) => {
  try {
    const ctaLink = data.ctaLink ?? APP_URL;
    let subject = data.subject;
    let html = "";

    switch (type) {
      case "like": {
        const sender = escapeHtml(data.senderName);
        const car = escapeHtml(data.carModel || "tu auto");
        subject = subject || `${data.senderName} le dio Like a ${data.carModel || "tu auto"}`;
        html = buildTemplate(
          "❤️",
          "¡Tenés un nuevo Like!",
          `<strong>${sender}</strong> le dio like a tu <strong>${car}</strong>.<br/>Entrá a la app para ver si hay un Match.`,
          "Ver en MatchCars",
          ctaLink
        );
        break;
      }

      case "match": {
        const sender = escapeHtml(data.senderName);
        const car = data.carModel ? escapeHtml(data.carModel) : null;
        subject = subject || `¡Match con ${data.senderName}!`;
        html = buildTemplate(
          "🤝",
          "¡Es un Match!",
          `¡Buenas noticias! Vos y <strong>${sender}</strong>${car ? ` se dieron like en el <strong>${car}</strong>` : " se dieron like"}.<br/>Ahora pueden hablar directamente para cerrar el trato.`,
          "Ir al chat",
          ctaLink
        );
        break;
      }

      case "message": {
        const sender = escapeHtml(data.senderName);
        const car = data.carModel ? escapeHtml(data.carModel) : null;
        const preview = data.messagePreview ? escapeHtml(data.messagePreview) : "";
        subject = subject || `Nuevo mensaje de ${data.senderName}`;
        const bodyText = car
          ? `<strong>${sender}</strong> te escribió sobre <strong>${car}</strong>:<br/><br/><em style="color:#444;">"${preview}"</em>`
          : `<strong>${sender}</strong> te envió un mensaje:<br/><br/><em style="color:#444;">"${preview}"</em>`;
        html = buildTemplate(
          "💬",
          car ? `Consulta por ${car}` : "Nuevo mensaje",
          bodyText,
          "Responder",
          ctaLink
        );
        break;
      }

      case "moderation_rejected": {
        const car = data.carModel ? escapeHtml(data.carModel) : "tu publicación";
        const reason = data.messagePreview ? escapeHtml(data.messagePreview) : null;
        subject = subject || `Tu publicación fue rechazada`;
        html = buildTemplate(
          "⚠️",
          "Publicación rechazada",
          `Un moderador revisó <strong>${car}</strong> y la marcó como rechazada para que la corrijas.${reason ? `<br/><br/>Motivo: <em>"${reason}"</em>` : ""}<br/><br/>Corregí los datos y volvé a publicarla.`,
          "Editar publicación",
          ctaLink
        );
        break;
      }

      case "vehicle_approved": {
        const car = data.carModel ? escapeHtml(data.carModel) : "Tu publicación";
        subject = subject || `¡${data.carModel || "Tu publicación"} ya está publicado!`;
        html = buildTemplate(
          "✅",
          "¡Tu publicación ya está activa!",
          `Revisamos <strong>${car}</strong> y ya está publicado. A partir de ahora es visible para todos los compradores en MatchCars.`,
          "Ver mi publicación",
          ctaLink
        );
        break;
      }

      case "offer_received": {
        const sender = escapeHtml(data.senderName);
        const car = escapeHtml(data.carModel || "tu auto");
        const amount = data.amount ? escapeHtml(data.amount) : "";
        subject = subject || `${data.senderName} ofertó por ${data.carModel || "tu auto"}`;
        html = buildTemplate(
          "💰",
          "¡Recibiste una oferta!",
          `<strong>${sender}</strong> ofertó${amount ? ` <strong>${amount}</strong>` : ""} por tu <strong>${car}</strong>.<br/>Entrá a la app para responder.`,
          "Ver oferta",
          ctaLink
        );
        break;
      }

      case "offer_accepted":
      case "counter_accepted": {
        const car = escapeHtml(data.carModel || "el auto");
        const amount = data.amount ? escapeHtml(data.amount) : "";
        subject = subject || `¡Tu oferta por ${data.carModel || "el auto"} fue aceptada!`;
        html = buildTemplate(
          "🤝",
          type === "offer_accepted" ? "¡Tu oferta fue aceptada!" : "¡Tu contraoferta fue aceptada!",
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

      case "vehicle_sold": {
        const car = escapeHtml(data.carModel || "el auto");
        subject = subject || `¡Venta confirmada! ${data.carModel || ""}`.trim();
        html = buildTemplate(
          "🎉",
          "¡Venta confirmada!",
          `El vendedor marcó el <strong>${car}</strong> como vendido.<br/>¡Felicitaciones por tu compra!`,
          "Ver detalles",
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

      case "price_drop": {
        const car = escapeHtml(data.carModel || "un auto que te interesa");
        const newPrice = data.newPrice ? escapeHtml(data.newPrice) : "";
        subject = subject || `¡Bajó de precio! ${data.carModel || ""}`.trim();
        html = buildTemplate(
          "🏷️",
          "¡Bajó de precio!",
          `El <strong>${car}</strong> que te interesa bajó${newPrice ? ` a <strong>${newPrice}</strong>` : " de precio"}.`,
          "Ver publicación",
          ctaLink
        );
        break;
      }
    }

    // Fetch recipient email
    const userSnap = await getDoc(doc(db, "users", data.recipientUid));
    if (!userSnap.exists()) return;
    const recipientEmail: string = userSnap.data().email || "";
    if (!recipientEmail) return;

    await addDoc(collection(db, "mail"), {
      to: [recipientEmail],
      toUids: [data.recipientUid],
      from: `${APP_NAME} <noreply@matchcars.app>`,
      message: { subject, html },
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Error sending email notification:", error);
  }
};
