"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPortalWelcomeEmail = void 0;
exports.buildPortalWelcomeHtml = buildPortalWelcomeHtml;
// functions/src/portalWelcome.ts
// Mail de bienvenida al Portal de Agencias cuando una cuenta pasa de gratis a
// un plan pago. Los planes se contratan en la app (RevenueCat → updatePlan en
// users/{uid}.plan) y el mensaje de éxito de la app no menciona el portal, así
// que una agencia que llegó desde la web no se enteraba de dónde seguir.
// Se manda una sola vez por cuenta (portalWelcomeSentAt), aunque después baje
// a gratis y vuelva a contratar.
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
// admin.initializeApp() lo hace index.ts — ver comentario en digest.ts.
const PORTAL_URL = "https://portal.matchcars.app";
const ACCENT = "#F97316";
const PLAN_LABELS = {
    pro: "Pro",
    pro_plus: "Pro Plus",
    pro_dealer: "Pro Dealer",
};
function isPaid(plan) {
    return typeof plan === "string" && plan !== "" && plan !== "free";
}
// "pro_plus_monthly" → "Pro Plus". El orden importa: pro_plus/pro_dealer antes que pro.
function planLabel(plan) {
    const key = ["pro_dealer", "pro_plus", "pro"].find((k) => plan.startsWith(k));
    return key ? PLAN_LABELS[key] : "pago";
}
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function buildPortalWelcomeHtml(email, plan) {
    const step = (n, text) => `<tr>
    <td style="width:32px;vertical-align:top;padding:8px 0;"><span style="display:inline-block;width:24px;height:24px;line-height:24px;border-radius:12px;background:${ACCENT};color:#fff;font-size:13px;font-weight:700;text-align:center;">${n}</span></td>
    <td style="padding:8px 0;font-size:14px;color:#333;line-height:1.5;">${text}</td>
  </tr>`;
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Tu Portal de Agencias está activo</title></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 16px;"><tr><td align="center">
    <table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:#0E1117;padding:24px 32px;text-align:center;">
        <span style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-0.5px;">Match<span style="color:${ACCENT};">Cars</span></span>
      </td></tr>
      <tr><td style="padding:32px 40px 4px;text-align:center;">
        <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0E1117;">Tu Portal de Agencias está activo</h1>
        <p style="margin:0;font-size:14px;color:#888;">Plan ${planLabel(plan)} · ${escapeHtml(email)}</p>
      </td></tr>
      <tr><td style="padding:20px 40px 4px;">
        <p style="margin:0 0 8px;font-size:14px;color:#333;line-height:1.5;">Además de la app, ahora tenés el portal web para manejar tu agencia desde la computadora: stock, leads, operaciones, comisiones, reportes y tu equipo.</p>
        <table width="100%" style="border-collapse:collapse;">
          ${step(1, `Entrá a <a href="${PORTAL_URL}" style="color:${ACCENT};font-weight:600;">portal.matchcars.app</a>`)}
          ${step(2, `Iniciá sesión con <strong>${escapeHtml(email)}</strong> — la misma cuenta de la app (si entrás con Google o Apple, usá el mismo).`)}
          ${step(3, "Cargá o importá tu stock y sumá a tu equipo desde la sección Equipo.")}
        </table>
      </td></tr>
      <tr><td style="padding:24px 40px 28px;text-align:center;">
        <a href="${PORTAL_URL}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;padding:14px 32px;border-radius:50px;font-weight:700;font-size:15px;">Abrir el Portal de Agencias</a>
      </td></tr>
      <tr><td style="background:#f8f9fa;padding:20px 40px;text-align:center;border-top:1px solid #eee;">
        <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
          Recibís este mail porque activaste un plan pago en MatchCars.<br/>
          ¿Dudas? Escribinos a <a href="mailto:matchcarsinfo@gmail.com" style="color:#aaa;">matchcarsinfo@gmail.com</a>
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
exports.sendPortalWelcomeEmail = (0, firestore_1.onDocumentUpdated)({ document: "users/{uid}", region: "us-central1" }, async (event) => {
    var _a, _b;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    // Solo la transición gratis → pago. Renovaciones y cambios entre planes
    // pagos no cuentan, y users/{uid} se actualiza por muchas otras razones
    // (pushToken, perfil…) que salen acá de entrada.
    if (isPaid(before.plan) || !isPaid(after.plan))
        return;
    if (after.portalWelcomeSentAt)
        return;
    const email = after.email;
    if (!email)
        return;
    const db = admin.firestore();
    const uid = event.params.uid;
    try {
        await db.collection("mail").add({
            to: [email],
            toUids: [uid],
            from: "MatchCars <noreply@matchcars.app>",
            message: {
                subject: "Tu Portal de Agencias de MatchCars está activo",
                html: buildPortalWelcomeHtml(email, after.plan),
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Este update vuelve a disparar el trigger, pero corta arriba
        // (before.plan ya es pago).
        await event.data.after.ref.update({ portalWelcomeSentAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    catch (e) {
        console.error("[sendPortalWelcomeEmail] error for", uid, e);
    }
});
//# sourceMappingURL=portalWelcome.js.map