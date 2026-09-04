// functions/src/digest.ts
// Resumen semanal por email para las agencias (planes pagos). Lunes 08:00 ART.
// Opt-out: users/{uid}.weeklyDigestEmail === false. Si la semana no tiene nada
// para contar, no se manda el email (no molestar con un resumen vacío).
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

// admin.initializeApp() lo hace index.ts — acá solo se toma el Firestore
// DENTRO del handler (no en el top level del módulo, que se evalúa antes que
// el initializeApp de index.ts por el hoisting de imports).

const PORTAL_URL = "https://portal.matchcars.app";
const APP_URL = "https://matchcars.app";
const APPLE_URL = "https://apps.apple.com/app/id6757968664";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.matchcars.app";
const ACCENT = "#F97316";

// Planes con acceso al CRM (canAccessCRM = plan !== "free"), sin el interno.
const PAID_PLANS = [
  "pro_monthly",
  "pro_annual",
  "pro_plus_monthly",
  "pro_plus_annual",
  "pro_dealer_monthly",
  "pro_dealer_annual",
  "pro_dealer",
];

const STOCK_EXCLUDED = ["deleted", "rejected", "rejected_limit", "blocked", "sold", "reserved", "a_preparar", "pending_review"];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function millis(ts: unknown): number {
  return ts && typeof ts === "object" && "toMillis" in ts ? (ts as admin.firestore.Timestamp).toMillis() : 0;
}

interface DigestStats {
  newLeads: number;
  unanswered: number;
  pendingOffers: number;
  won: number;
  incompleteStock: number;
  staleStock: number;
}

function statRow(label: string, value: number, urgent = false): string {
  if (value === 0 && !urgent) return "";
  const color = urgent && value > 0 ? "#B91C1C" : "#0E1117";
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;color:#555;">${label}</td>
    <td style="padding:10px 0;border-bottom:1px solid #eee;font-size:18px;font-weight:800;color:${color};text-align:right;">${value}</td>
  </tr>`;
}

export function buildDigestHtml(agencyName: string, s: DigestStats): string {
  const rows = [
    statRow("Leads nuevos esta semana", s.newLeads),
    statRow("Leads sin responder", s.unanswered, true),
    statRow("Ofertas esperando tu respuesta", s.pendingOffers, true),
    statRow("Ventas cerradas esta semana", s.won),
    statRow("Fichas de stock incompletas", s.incompleteStock, true),
    statRow("Autos parados sin consultas (+45 días)", s.staleStock),
  ]
    .filter(Boolean)
    .join("");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Tu semana en MatchCars</title></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 16px;"><tr><td align="center">
    <table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:#0E1117;padding:24px 32px;text-align:center;">
        <span style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-0.5px;">Match<span style="color:${ACCENT};">Cars</span></span>
      </td></tr>
      <tr><td style="padding:32px 40px 4px;text-align:center;">
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#0E1117;">Tu semana en MatchCars</h1>
        <p style="margin:0;font-size:14px;color:#888;">${agencyName}</p>
      </td></tr>
      <tr><td style="padding:20px 40px 8px;">
        <table width="100%" style="border-collapse:collapse;">${rows}</table>
      </td></tr>
      <tr><td style="padding:24px 40px 12px;text-align:center;">
        <a href="${PORTAL_URL}/dashboard" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;padding:14px 32px;border-radius:50px;font-weight:700;font-size:15px;">Abrir el Portal de Agencias</a>
      </td></tr>
      <tr><td style="padding:8px 40px 4px;text-align:center;">
        <p style="margin:0 0 10px;font-size:13px;color:#888;">O desde tu celular:</p>
        <a href="${APPLE_URL}" style="display:inline-block;margin:0 6px;color:${ACCENT};font-size:13px;font-weight:600;text-decoration:none;">📱 App Store</a>
        <span style="color:#ccc;">·</span>
        <a href="${PLAY_URL}" style="display:inline-block;margin:0 6px;color:${ACCENT};font-size:13px;font-weight:600;text-decoration:none;">🤖 Google Play</a>
        <span style="color:#ccc;">·</span>
        <a href="${APP_URL}" style="display:inline-block;margin:0 6px;color:${ACCENT};font-size:13px;font-weight:600;text-decoration:none;">🌐 matchcars.app</a>
      </td></tr>
      <tr><td style="background:#f8f9fa;padding:20px 40px;text-align:center;border-top:1px solid #eee;">
        <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
          Recibís este resumen porque tenés una agencia en MatchCars.<br/>
          <a href="${PORTAL_URL}/dashboard/profile" style="color:#aaa;text-decoration:underline;">Dejar de recibirlo</a>
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export const weeklyAgencyDigest = onSchedule(
  { schedule: "0 8 * * 1", timeZone: "America/Argentina/Buenos_Aires", region: "us-central1" },
  async () => {
    const db = admin.firestore();
    const now = Date.now();
    const weekAgo = now - WEEK_MS;

    const usersSnap = await db.collection("users").where("plan", "in", PAID_PLANS).get();
    let sent = 0;

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      if (user.weeklyDigestEmail === false) continue;
      const email: string | undefined = user.email;
      if (!email) continue;
      const agencyId = userDoc.id;

      try {
        const [leadsSnap, vehiclesSnap] = await Promise.all([
          db.collection("leads").where("sellerId", "==", agencyId).get(),
          db.collection("vehicles").where("userId", "==", agencyId).get(),
        ]);

        const leads = leadsSnap.docs.map((d) => d.data()).filter((l) => !l.deletedAt);
        const leadVehicleIds = new Set(leads.map((l) => l.vehicleId).filter(Boolean));

        const activeVehicles = vehiclesSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((v: admin.firestore.DocumentData) => !STOCK_EXCLUDED.includes(v.status || "available"));

        const stats: DigestStats = {
          newLeads: leads.filter((l) => millis(l.createdAt) >= weekAgo).length,
          unanswered: leads.filter((l) => l.status === "new").length,
          pendingOffers: leads.filter((l) => l.offer?.status === "pending").length,
          won: leads.filter((l) => l.status === "won" && millis(l.wonAt) >= weekAgo).length,
          incompleteStock: activeVehicles.filter((v: admin.firestore.DocumentData) => {
            const cover = v.images?.cover ?? v.coverImage ?? v.cover ?? "";
            return !cover || !(typeof v.price === "number" && v.price > 0);
          }).length,
          staleStock: activeVehicles.filter((v: admin.firestore.DocumentData) => {
            const days = millis(v.createdAt) ? (now - millis(v.createdAt)) / DAY_MS : 0;
            return days >= 45 && !leadVehicleIds.has(v.id);
          }).length,
        };

        const hasContent =
          stats.newLeads || stats.unanswered || stats.pendingOffers || stats.won || stats.incompleteStock || stats.staleStock;
        if (!hasContent) continue;

        await db.collection("mail").add({
          to: [email],
          toUids: [agencyId],
          from: "MatchCars <noreply@matchcars.app>",
          message: {
            subject: `Tu semana en MatchCars — ${stats.newLeads} leads nuevos`,
            html: buildDigestHtml(user.agencyName || user.displayName || "Tu agencia", stats),
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        sent++;
      } catch (e) {
        console.error("[weeklyAgencyDigest] error for", agencyId, e);
      }
    }

    console.log(`[weeklyAgencyDigest] enviados: ${sent}`);
  }
);
