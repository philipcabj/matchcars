import { addDoc, collection, doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export type EmailType = "like" | "match" | "message";

interface EmailData {
  recipientUid: string;
  recipientName?: string; // Optional, for personalization
  senderName: string;
  senderUid?: string; // Required for deep linking to chat
  subject: string;
  // Specific fields
  carModel?: string; // For like/match
  messagePreview?: string; // For message
  ctaLink?: string; // Deep link override
}

const LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/matchcars-a7847.appspot.com/o/assets%2Ficono.png?alt=media";

const APP_NAME = "Matchcars";
const ACCENT_COLOR = "#00A3FF";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.matchcars.app";
const APPLE_SEARCH_URL = "https://apps.apple.com/app/id6742689551"; // Reemplazar con el ID real de App Store Connect cuando esté disponible

const getHtmlTemplate = (title: string, body: string, ctaText: string, ctaLink: string) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background-color: #0E1117; padding: 20px; text-align: center; }
    .header img { max-width: 200px; height: auto; display: block; margin: 0 auto; }
    .header h1 { color: #ffffff; font-size: 24px; margin: 0; display: inline-block; vertical-align: middle; }
    .content { padding: 30px 20px; text-align: center; }
    .content h2 { color: #0E1117; font-size: 20px; margin-bottom: 16px; }
    .content p { font-size: 16px; line-height: 1.5; color: #555555; margin-bottom: 24px; }
    .btn { display: inline-block; background-color: ${ACCENT_COLOR}; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 999px; font-weight: bold; font-size: 16px; }
    .footer { background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #999999; }
    .store-links { margin-top: 20px; display: flex; justify-content: center; align-items: center; gap: 16px; }
    .store-links img { height: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <!-- Logo con enlace a la imagen pública -->
      <img src="${LOGO_URL}" alt="${APP_NAME}" />
    </div>
    <div class="content">
      <h2>${title}</h2>
      <p>${body}</p>
      <div class="store-links">
        <a href="${APPLE_SEARCH_URL}">
          <img src="https://tools.applemediaservices.com/api/badges/downloadOnTheAppStore/black/es-ar?size=250x83" alt="App Store" />
        </a>
        <a href="${PLAY_URL}">
          <img src="https://play.google.com/intl/es-419/badges/static/images/badges/es-419_badge_web_generic.png" alt="Google Play" />
        </a>
      </div>
    </div>
    <div class="footer">
      <p>Estás recibiendo este correo porque tenés una cuenta en ${APP_NAME}.</p>
    </div>
  </div>
</body>
</html>
  `;
};

export const sendNotificationEmail = async (type: EmailType, data: EmailData) => {
  try {
    let html = "";
    let subject = data.subject;
    
    const getStoreLink = () => PLAY_URL;

    let ctaLink = getStoreLink();

    switch (type) {
      case "like":
        html = getHtmlTemplate(
          "¡Tenés un nuevo Like!",
          `<strong>${data.senderName}</strong> le dio like a tu <strong>${data.carModel || "auto"}</strong>. ¡Entrá a la app para ver si hay Match!`,
          "Ver Like",
          ctaLink
        );
        break;
      case "match":
        html = getHtmlTemplate(
          "¡Es un Match! 🚗💨",
          `¡Buenas noticias! Hacés match con <strong>${data.senderName}</strong>. Ambos se dieron like. ¡Hablen ahora para cerrar el trato!`,
          "Ir al Chat",
          ctaLink
        );
        break;
      case "message":
        const msgTitle = data.carModel ? `Consulta por ${data.carModel}` : "Nuevo Mensaje";
        const msgBody = data.carModel 
          ? `<strong>${data.senderName}</strong> te envió un mensaje sobre <strong>${data.carModel}</strong>: <br/><br/><em>"${data.messagePreview}"</em>`
          : `<strong>${data.senderName}</strong> te envió un mensaje: <br/><br/><em>"${data.messagePreview}"</em>`;
        
        html = getHtmlTemplate(
          msgTitle,
          msgBody,
          "Responder",
          ctaLink
        );
        break;
    }

    // Try to fetch recipient email explicitly
    let recipientEmail = "";
    try {
        const userSnap = await getDoc(doc(db, "users", data.recipientUid));
        if (userSnap.exists()) {
            recipientEmail = userSnap.data().email || "";
        }
    } catch (e) {
        console.log("Error fetching user email:", e);
    }

    const mailData: any = {
      toUids: [data.recipientUid],
      message: {
        subject: subject,
        html: html,
      },
      from: "Matchcars <noreply@matchcars.app>",
      createdAt: new Date(),
    };

    if (recipientEmail) {
        mailData.to = [recipientEmail];
    }

    await addDoc(collection(db, "mail"), mailData);
    console.log(`Email notification (${type}) sent to ${data.recipientUid} (email: ${recipientEmail || "unknown"})`);
  } catch (error) {
    console.error("Error sending email notification:", error);
  }
};
