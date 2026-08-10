import { addDoc, collection, doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

const APP_NAME = "MatchCars";
const ACCENT_COLOR = "#00A3FF";
const APP_URL = "https://matchcars.app";

function buildAdminTemplate(title: string, rows: { label: string; value: string }[], ctaLink: string): string {
  const rowsHtml = rows
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px 0;font-size:14px;color:#888;width:40%;vertical-align:top;">${r.label}</td>
          <td style="padding:8px 0;font-size:14px;color:#0E1117;font-weight:600;">${r.value}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
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
          <td style="background:#0E1117;padding:20px 32px;text-align:center;">
            <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px;">
              Match<span style="color:${ACCENT_COLOR};">Cars</span>
              <span style="font-size:13px;font-weight:400;color:#aaa;margin-left:8px;">Panel Administrativo</span>
            </span>
          </td>
        </tr>

        <!-- Title -->
        <tr>
          <td style="padding:32px 40px 16px;">
            <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#0E1117;">${title}</h1>
            <p style="margin:0;font-size:13px;color:#aaa;">Acción requerida en el panel de moderación.</p>
          </td>
        </tr>

        <!-- Data rows -->
        <tr>
          <td style="padding:0 40px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f0f0f0;padding-top:16px;">
              ${rowsHtml}
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:0 40px 36px;">
            <a href="${ctaLink}"
               style="display:inline-block;background:${ACCENT_COLOR};color:#fff;text-decoration:none;padding:13px 28px;border-radius:50px;font-weight:700;font-size:14px;">
              Ver en el panel
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8f9fa;padding:18px 40px;text-align:center;border-top:1px solid #eee;">
            <p style="margin:0;font-size:12px;color:#aaa;">
              ${APP_NAME} · <a href="${APP_URL}" style="color:#aaa;text-decoration:underline;">${APP_URL}</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function getAdminNotificationConfig(): Promise<{ adminEmails: string[]; webhookUrl: string }> {
  // Recipients come exclusively from config/notifications.adminEmails — NOT from every user
  // with role === "admin" (that role controls dashboard access, not who should get moderation
  // mail, and previously leaked notifications to any admin account regardless of email validity).
  let adminEmails: string[] = [];
  let webhookUrl = "";

  try {
    const configSnap = await getDoc(doc(db, "config", "notifications"));
    if (configSnap.exists()) {
      const cfg = configSnap.data();
      if (Array.isArray(cfg.adminEmails)) adminEmails = cfg.adminEmails;
      if (cfg.whatsappWebhookUrl) webhookUrl = cfg.whatsappWebhookUrl;
    }
  } catch {
    // config doc not found — continue
  }

  return { adminEmails, webhookUrl };
}

export async function notifyAdminNewVehicle(vehicleId: string, vehicleData: any) {
  try {
    const { adminEmails, webhookUrl } = await getAdminNotificationConfig();

    if (adminEmails.length === 0) return;

    // 2. WhatsApp webhook (optional)
    if (webhookUrl) {
      const msg =
        `🚗 *Nueva Publicación — Revisión Pendiente*\n\n` +
        `📌 *Vehículo:* ${vehicleData.brand} ${vehicleData.model} ${vehicleData.year}\n` +
        `💰 *Precio:* ${vehicleData.currency} ${Number(vehicleData.price).toLocaleString("es-AR")}\n` +
        `👤 *Vendedor:* ${vehicleData.userName}\n` +
        `🛡️ *Riesgo IA:* ${vehicleData.riskScore ?? "—"}/10\n\n` +
        `🔗 ${APP_URL}/(admin)/dashboard?id=${vehicleId}`;

      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, vehicleId, vehicle: vehicleData }),
      }).catch(() => {});
    }

    // 3. Email to all admins
    const html = buildAdminTemplate(
      "Nueva publicación pendiente de revisión",
      [
        { label: "Vehículo", value: `${vehicleData.brand} ${vehicleData.model} ${vehicleData.year}` },
        { label: "Precio", value: `${vehicleData.currency} ${Number(vehicleData.price).toLocaleString("es-AR")}` },
        { label: "Vendedor", value: vehicleData.userName || "—" },
        { label: "Riesgo IA", value: vehicleData.riskScore !== undefined ? `${vehicleData.riskScore}/10` : "—" },
        { label: "Provincia", value: vehicleData.province || "—" },
      ],
      `${APP_URL}/(admin)/dashboard?id=${vehicleId}`
    );

    const subject = `[Moderación] ${vehicleData.brand} ${vehicleData.model} ${vehicleData.year} — revisión pendiente`;

    for (const email of adminEmails) {
      await addDoc(collection(db, "mail"), {
        to: [email],
        from: `${APP_NAME} <noreply@matchcars.app>`,
        message: { subject, html },
        createdAt: new Date(),
      });
    }
  } catch (error) {
    console.error("Error in notifyAdminNewVehicle:", error);
  }
}

export async function notifyAdminNewReport(reportId: string, reportData: any) {
  try {
    const { adminEmails } = await getAdminNotificationConfig();
    if (adminEmails.length === 0) return;

    const targetLabel = reportData.targetType === "user" ? "Usuario" : "Publicación";
    const html = buildAdminTemplate(
      "Nuevo reporte recibido",
      [
        { label: "Tipo", value: targetLabel },
        { label: "ID reportado", value: reportData.targetId || "—" },
        { label: "Motivo", value: reportData.reason || "—" },
        { label: "Detalle", value: reportData.details || "—" },
        { label: "Reportado por", value: reportData.reportedBy || "—" },
      ],
      `${APP_URL}/(admin)/dashboard?tab=reports&id=${reportId}`
    );

    const subject = `[Moderación] Nuevo reporte — ${targetLabel.toLowerCase()}: ${reportData.reason || "sin motivo"}`;

    for (const email of adminEmails) {
      await addDoc(collection(db, "mail"), {
        to: [email],
        from: `${APP_NAME} <noreply@matchcars.app>`,
        message: { subject, html },
        createdAt: new Date(),
      });
    }
  } catch (error) {
    console.error("Error in notifyAdminNewReport:", error);
  }
}
