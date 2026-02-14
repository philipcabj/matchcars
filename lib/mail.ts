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

const LOGO_URL = "https://matchcars.app/logo.png";

const APP_NAME = "Matchcars";
const ACCENT_COLOR = "#00A3FF";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.matchcars.app";
const APPLE_SEARCH_URL = "https://apps.apple.com/app/id6757968664";

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
    .header img { max-width: 120px; height: auto; display: block; margin: 0 auto; }
    .header h1 { color: #ffffff; font-size: 24px; margin: 0; display: inline-block; vertical-align: middle; }
    .content { padding: 30px 20px; text-align: center; }
    .content h2 { color: #0E1117; font-size: 20px; margin-bottom: 16px; }
    .content p { font-size: 16px; line-height: 1.5; color: #555555; margin-bottom: 24px; }
    .btn { display: inline-block; background-color: ${ACCENT_COLOR}; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 999px; font-weight: bold; font-size: 16px; margin-bottom: 24px; }
    .footer { background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #999999; }
    .store-links { margin-top: 0px; display: flex; justify-content: center; align-items: center; gap: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <!-- Logo con enlace a la app/match -->
      <a href="${ctaLink}" style="text-decoration: none;">
        <img src="${LOGO_URL}" alt="${APP_NAME}" />
      </a>
    </div>
    <div class="content">
      <h2>${title}</h2>
      <p>${body}</p>
      <a href="${ctaLink}" class="btn">${ctaText}</a>
      <div class="store-links">
        <a href="${APPLE_SEARCH_URL}" style="display: inline-block; text-decoration: none;">
          <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Download_on_the_App_Store_Badge.svg/320px-Download_on_the_App_Store_Badge.svg.png" alt="App Store" style="height: 40px; width: auto; display: block;" />
        </a>
        <a href="${PLAY_URL}" style="display: inline-block; text-decoration: none;">
          <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Google_Play_Store_badge_EN.svg/320px-Google_Play_Store_badge_EN.svg.png" alt="Google Play" style="height: 54px; width: auto; display: block; margin-top: -8px;" />
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
    
    // Use correct store links
    const getStoreLink = () => {
        // You can return a universal link (e.g. your website that redirects) or just the App Store link for now
        // Ideally, use a Firebase Dynamic Link or a universal link service
        return APPLE_SEARCH_URL;
    };

    // Calculate deep link for main CTA (Logo and Button)
    // If data.ctaLink is provided, use it. Otherwise, use the website URL which serves as the Universal Link base
    const getDeepLink = () => {
        if (data.ctaLink) return data.ctaLink;
        return "https://matchcars.app";
    };

    let ctaLink = getDeepLink();

    // Base styles
    const containerStyle = "max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;";
    const headerStyle = "background-color: #0E1117; padding: 20px; text-align: center;";
    const contentStyle = "padding: 30px 20px; text-align: center; color: #333;";
    const buttonStyle = `display: inline-block; background-color: ${ACCENT_COLOR}; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 999px; font-weight: bold; font-size: 16px; margin-top: 20px;`;
    const footerStyle = "background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #999999;";

    const ctaText = "Abrir Matchcars";

    switch (type) {
      case "like":
        html = getHtmlTemplate(
          "¡Tenés un nuevo Like!",
          `<strong>${data.senderName}</strong> le dio like a tu <strong>${data.carModel || "auto"}</strong>. ¡Entrá a la app para ver si hay Match!`,
          ctaText,
          ctaLink
        );
        break;
      case "match":
        html = getHtmlTemplate(
          "¡Es un Match! 🚗💨",
          `¡Buenas noticias! Hacés match con <strong>${data.senderName}</strong>. Ambos se dieron like. ¡Hablen ahora para cerrar el trato!`,
          ctaText,
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
          ctaText,
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
