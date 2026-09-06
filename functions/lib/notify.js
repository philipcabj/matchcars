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
exports.sellerStalePush = exports.notifyOnVehiclePublished = void 0;
// functions/src/notify.ts
// Notificaciones push proactivas:
//  - notifyOnVehiclePublished: cuando un auto pasa a publicado, avisa a quienes
//    tienen una alerta de búsqueda guardada (users/{uid}/alerts) que matchea.
//  - sellerStalePush: 1 vez por día, empuja a los vendedores de autos parados
//    ("lleva X días sin consultas, ¿bajás el precio?").
//
// Respeta un opt-out suave: users/{uid}.notifPrefs.searchAlerts / .sellerTips
// (ausente o true = activado).
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = __importStar(require("firebase-admin"));
const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_MIN_DAYS = 12;
const STALE_MAX_DAYS = 60;
const STALE_MAX_VIEWS = 40;
const STALE_REPUSH_DAYS = 12;
const SOLD_LIKE_STATUSES = ["sold", "reserved", "deleted", "rejected", "rejected_limit", "blocked", "a_preparar"];
function millis(ts) {
    return ts && typeof ts === "object" && "toMillis" in ts ? ts.toMillis() : 0;
}
function num(v) {
    const n = typeof v === "string" ? parseFloat(v.replace(/[^\d.-]/g, "")) : Number(v);
    return Number.isFinite(n) ? n : null;
}
async function pushTo(uid, title, body, url) {
    var _a;
    const db = admin.firestore();
    const snap = await db.doc(`users/${uid}`).get();
    const token = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.pushToken;
    if (!token || !String(token).startsWith("ExponentPushToken"))
        return;
    await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ to: token, sound: "default", title, body, data: { url } }),
    }).catch(() => { });
}
function alertMatchesVehicle(a, v) {
    var _a, _b;
    const brand = String((_a = v.brand) !== null && _a !== void 0 ? _a : "").toLowerCase();
    const model = String((_b = v.model) !== null && _b !== void 0 ? _b : "").toLowerCase();
    if (a.brand && !brand.includes(String(a.brand).toLowerCase()))
        return false;
    if (a.model && !model.includes(String(a.model).toLowerCase()))
        return false;
    const year = num(v.year);
    const minY = num(a.minYear);
    const maxY = num(a.maxYear);
    if (minY != null && (year == null || year < minY))
        return false;
    if (maxY != null && (year == null || year > maxY))
        return false;
    const price = num(v.price);
    const minP = num(a.minPrice);
    const maxP = num(a.maxPrice);
    // El precio de la alerta se asume en la misma moneda que el auto (las
    // alertas hoy no guardan moneda). Si no hay precio, no filtra por precio.
    if (price != null) {
        if (minP != null && price < minP)
            return false;
        if (maxP != null && price > maxP)
            return false;
    }
    return true;
}
exports.notifyOnVehiclePublished = (0, firestore_1.onDocumentUpdated)("vehicles/{vehicleId}", async (event) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    // Solo cuando recién pasa a publicado.
    if (before.published === true || after.published !== true)
        return;
    if (SOLD_LIKE_STATUSES.includes(after.status || ""))
        return;
    const db = admin.firestore();
    const vehicleId = event.params.vehicleId;
    const ownerId = after.userId;
    const carLabel = `${(_c = after.brand) !== null && _c !== void 0 ? _c : ""} ${(_d = after.model) !== null && _d !== void 0 ? _d : ""} ${(_e = after.year) !== null && _e !== void 0 ? _e : ""}`.replace(/\s+/g, " ").trim();
    const priceLabel = `${(_f = after.currency) !== null && _f !== void 0 ? _f : "ARS"} ${Number((_g = after.price) !== null && _g !== void 0 ? _g : 0).toLocaleString("es-AR")}`;
    const alertsSnap = await db.collectionGroup("alerts").get();
    const notified = new Set();
    for (const alertDoc of alertsSnap.docs) {
        const uid = (_h = alertDoc.ref.parent.parent) === null || _h === void 0 ? void 0 : _h.id;
        if (!uid || uid === ownerId || notified.has(uid))
            continue;
        if (!alertMatchesVehicle(alertDoc.data(), after))
            continue;
        const userSnap = await db.doc(`users/${uid}`).get();
        const user = userSnap.data();
        if (!user || ((_j = user.notifPrefs) === null || _j === void 0 ? void 0 : _j.searchAlerts) === false)
            continue;
        notified.add(uid);
        await pushTo(uid, `Nuevo ${carLabel || "auto"} que buscás`, `${priceLabel}${((_k = after.location) === null || _k === void 0 ? void 0 : _k.province) || after.province ? ` · ${(_m = (_l = after.location) === null || _l === void 0 ? void 0 : _l.province) !== null && _m !== void 0 ? _m : after.province}` : ""}`, `matchcars://car/${vehicleId}`);
    }
    if (notified.size > 0) {
        console.log(`[notifyOnVehiclePublished] ${vehicleId}: ${notified.size} alertas notificadas`);
    }
});
// ─── Empuje a vendedores con stock parado ───────────────────────────────────
exports.sellerStalePush = (0, scheduler_1.onSchedule)({ schedule: "0 13 * * *", timeZone: "America/Argentina/Buenos_Aires", region: "us-central1" }, async () => {
    var _a, _b, _c, _d;
    const db = admin.firestore();
    const now = Date.now();
    const snap = await db.collection("vehicles").where("published", "==", true).get();
    let sent = 0;
    for (const doc of snap.docs) {
        const v = doc.data();
        if (SOLD_LIKE_STATUSES.includes(v.status || ""))
            continue;
        const ageDays = millis(v.createdAt) ? (now - millis(v.createdAt)) / DAY_MS : 0;
        if (ageDays < STALE_MIN_DAYS || ageDays > STALE_MAX_DAYS)
            continue;
        if ((v.views || 0) > STALE_MAX_VIEWS)
            continue;
        const lastPush = millis(v.stalePushAt);
        if (lastPush && now - lastPush < STALE_REPUSH_DAYS * DAY_MS)
            continue;
        const ownerId = v.userId;
        if (!ownerId)
            continue;
        const ownerSnap = await db.doc(`users/${ownerId}`).get();
        if (((_b = (_a = ownerSnap.data()) === null || _a === void 0 ? void 0 : _a.notifPrefs) === null || _b === void 0 ? void 0 : _b.sellerTips) === false)
            continue;
        const carLabel = `${(_c = v.brand) !== null && _c !== void 0 ? _c : ""} ${(_d = v.model) !== null && _d !== void 0 ? _d : ""}`.trim() || "tu auto";
        await pushTo(ownerId, `${carLabel}: ${Math.round(ageDays)} días publicado`, `Tuvo ${v.views || 0} visitas. Probá bajando el precio o sumando fotos para que aparezca más arriba.`, `matchcars://car/${doc.id}`);
        await doc.ref.update({ stalePushAt: admin.firestore.FieldValue.serverTimestamp() });
        sent++;
    }
    console.log(`[sellerStalePush] enviados: ${sent}`);
});
//# sourceMappingURL=notify.js.map