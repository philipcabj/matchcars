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
exports.refundSenaPayment = exports.mpWebhook = exports.cancelSenaPayment = exports.createSenaPayment = void 0;
exports.ensureOperationNumber = ensureOperationNumber;
// functions/src/senaPayments.ts
// Cobro de seña por QR — Fase 2: generar el cobro, recibir la confirmación de
// Mercado Pago y devolverlo. La cuenta de MP del vendedor la conecta la Fase 1
// (mercadoPago.ts); acá se usan sus tokens para cobrar EN NOMBRE de la agencia
// — la plata nunca pasa por MatchCars.
//
// Cadena de IDs: leads/{leadId} → saleOperations/{opId} (con `number`, el
// "OP-1042" que ven agencia y comprador) → senaPayments/{paymentId} → pago de
// MP (external_reference = paymentId). Desde cualquier punto se llega al resto.
//
// Usamos Checkout Pro (una preferencia de pago) mostrado como QR: el mismo
// cobro sirve en persona (QR) y a distancia (link por WhatsApp), y no obliga
// a cada agencia a crear "sucursal + caja" en MP como el QR de punto de venta.
//
// Ojo con `status: "reserved"` del auto: en el modelo actual significa
// "vendido, esperando que el comprador confirme la entrega" (ver
// portal/src/lib/mark-vehicle-sold.ts y resolvePendingSaleConfirmations). Una
// seña NO es eso — si la pusiéramos en reserved, "Completar" la operación
// después saltearía markVehicleSold (sin sales/{id}, sin comisión). Por eso la
// seña solo oculta el aviso (`published: false`) y deja `senaHold` en el auto;
// el status sigue "available" hasta que la operación se cierre como siempre.
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const mercadoPago_1 = require("./mercadoPago");
const mpTokenKey = (0, params_1.defineSecret)("MP_TOKEN_KEY");
const MP_API = "https://api.mercadopago.com";
const PAYMENT_TTL_MS = 30 * 60 * 1000;
const PORTAL_URL = "https://portal.matchcars.app";
const functionsBase = () => `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net`;
// ─── Helpers ────────────────────────────────────────────────────────────────
// Mismo criterio que portal/src/lib/agency-server.ts (resolveMembership) +
// hasSection(…, "operaciones"): cualquier rol puede gestionar leads hoy
// (AGENCY_ROLE_PERMISSIONS.manageLeads es true para los 3), así que lo que
// decide es si la persona tiene la sección Operaciones habilitada.
async function resolveAgencyAccess(uid) {
    const db = admin.firestore();
    const membership = await db.doc(`agencyMemberships/${uid}`).get();
    if (!membership.exists)
        return { agencyId: uid, role: "owner" };
    const { agencyId, role, sections } = membership.data();
    if (Array.isArray(sections) && !sections.includes("operaciones")) {
        throw new https_1.HttpsError("permission-denied", "Tu usuario no tiene acceso a Operaciones.");
    }
    return { agencyId, role };
}
async function getSellerAccessToken(sellerUid) {
    const db = admin.firestore();
    const account = await db.doc(`sellerPaymentAccounts/${sellerUid}`).get();
    if (!account.exists) {
        throw new https_1.HttpsError("failed-precondition", "Conectá la cuenta de Mercado Pago de la agencia en Cobros para poder cobrar señas.");
    }
    if (account.data().status !== "connected") {
        throw new https_1.HttpsError("failed-precondition", "La cuenta de Mercado Pago necesita reconectarse (Cobros → Volver a conectar).");
    }
    const priv = await account.ref.collection("private").doc("oauth").get();
    return (0, mercadoPago_1.decryptMpToken)(priv.data().accessToken);
}
async function mpFetch(token, path, init = {}) {
    var _a, _b;
    const res = await fetch(`${MP_API}${path}`, {
        method: (_a = init.method) !== null && _a !== void 0 ? _a : "GET",
        headers: Object.assign({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, (init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {})),
        body: init.body ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok)
        throw new Error(`MP ${(_b = init.method) !== null && _b !== void 0 ? _b : "GET"} ${path} ${res.status}: ${await res.text()}`);
    return (await res.json());
}
// Número corto y correlativo por agencia ("OP-1042") — las operaciones viejas
// no lo tienen, se les asigna la primera vez que hace falta.
async function ensureOperationNumber(opRef, agencyId) {
    const db = admin.firestore();
    const counterRef = db.doc(`agencies/${agencyId}/counters/saleOperations`);
    return db.runTransaction(async (t) => {
        var _a, _b, _c;
        const [opSnap, counterSnap] = await Promise.all([t.get(opRef), t.get(counterRef)]);
        const existing = (_a = opSnap.data()) === null || _a === void 0 ? void 0 : _a.number;
        if (typeof existing === "number")
            return existing;
        const next = ((_c = (_b = counterSnap.data()) === null || _b === void 0 ? void 0 : _b.last) !== null && _c !== void 0 ? _c : 1000) + 1;
        t.set(counterRef, { last: next }, { merge: true });
        t.update(opRef, { number: next });
        return next;
    });
}
const fmtArs = (n) => `$ ${n.toLocaleString("es-AR")}`;
async function queueMail(to, subject, bodyHtml) {
    if (!to)
        return;
    try {
        await admin.firestore().collection("mail").add({
            to: [to],
            from: "MatchCars <noreply@matchcars.app>",
            message: { subject, html: `<div style="font-family:sans-serif;padding:24px;color:#111">${bodyHtml}</div>` },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    catch (e) {
        console.error("[senaPayments] mail error", e);
    }
}
async function actorName(uid) {
    var _a, _b;
    const u = (await admin.firestore().doc(`users/${uid}`).get()).data();
    return `${(_a = u === null || u === void 0 ? void 0 : u.firstName) !== null && _a !== void 0 ? _a : ""} ${(_b = u === null || u === void 0 ? void 0 : u.lastName) !== null && _b !== void 0 ? _b : ""}`.trim() || (u === null || u === void 0 ? void 0 : u.displayName) || (u === null || u === void 0 ? void 0 : u.agencyName) || (u === null || u === void 0 ? void 0 : u.email) || uid;
}
async function logAgencyActivity(agencyId, actorUid, actorName, entityId, summary) {
    try {
        await admin.firestore().collection(`agencies/${agencyId}/activity`).add({
            actorUid,
            actorName,
            entityType: "operation",
            entityId,
            summary,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    catch (e) {
        console.error("[senaPayments] activity error", e);
    }
}
// Vence la preferencia en MP para que el QR/link deje de aceptar pagos.
async function expirePreference(token, preferenceId) {
    try {
        await mpFetch(token, `/checkout/preferences/${preferenceId}`, {
            method: "PUT",
            body: { expires: true, expiration_date_to: new Date().toISOString() },
        });
    }
    catch (e) {
        console.error("[senaPayments] expirePreference", preferenceId, e);
    }
}
// ─── createSenaPayment ──────────────────────────────────────────────────────
exports.createSenaPayment = (0, https_1.onCall)({ region: "us-central1", cors: true, secrets: [mpTokenKey] }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Tenés que iniciar sesión.");
    const saleOperationId = String(((_b = request.data) === null || _b === void 0 ? void 0 : _b.saleOperationId) || "");
    const amount = Math.round(Number((_c = request.data) === null || _c === void 0 ? void 0 : _c.amount));
    if (!saleOperationId)
        throw new https_1.HttpsError("invalid-argument", "Falta la operación.");
    if (!Number.isFinite(amount) || amount < 1000)
        throw new https_1.HttpsError("invalid-argument", "El monto mínimo de la seña es $ 1.000.");
    const db = admin.firestore();
    const { agencyId } = await resolveAgencyAccess(uid);
    const opRef = db.doc(`saleOperations/${saleOperationId}`);
    const opSnap = await opRef.get();
    const op = opSnap.data();
    if (!op || op.sellerId !== agencyId)
        throw new https_1.HttpsError("not-found", "No encontramos la operación.");
    if (op.status !== "en_curso")
        throw new https_1.HttpsError("failed-precondition", "La operación ya está cerrada.");
    const existing = await db
        .collection("senaPayments")
        .where("sellerUid", "==", agencyId)
        .where("saleOperationId", "==", saleOperationId)
        .get();
    if (existing.docs.some((d) => d.data().status === "approved")) {
        throw new https_1.HttpsError("failed-precondition", "Esta operación ya tiene una seña cobrada.");
    }
    const token = await getSellerAccessToken(agencyId);
    const number = await ensureOperationNumber(opRef, agencyId);
    // Un solo cobro abierto por operación: si había un QR anterior sin pagar, se anula.
    for (const d of existing.docs) {
        if (d.data().status !== "pending")
            continue;
        await d.ref.update({ status: "cancelled", cancelledAt: admin.firestore.FieldValue.serverTimestamp(), cancelledBy: uid });
        if (d.data().mpPreferenceId)
            await expirePreference(token, d.data().mpPreferenceId);
    }
    const v = (_d = op.vehicleSnapshot) !== null && _d !== void 0 ? _d : {};
    const vehicleLabel = [v.brand, v.model, v.year].filter(Boolean).join(" ") || "Auto";
    const title = `Seña OP-${number} · ${vehicleLabel}`;
    const paymentRef = db.collection("senaPayments").doc();
    const expiresAt = new Date(Date.now() + PAYMENT_TTL_MS);
    const backUrl = op.buyerAccessToken ? `${PORTAL_URL}/mi-operacion/${op.buyerAccessToken}` : PORTAL_URL;
    const pref = await mpFetch(token, "/checkout/preferences", {
        method: "POST",
        idempotencyKey: paymentRef.id,
        body: Object.assign({ items: [{ id: saleOperationId, title, quantity: 1, unit_price: amount, currency_id: "ARS" }], external_reference: paymentRef.id, notification_url: `${functionsBase()}/mpWebhook?pid=${paymentRef.id}`, metadata: { sena_payment_id: paymentRef.id, sale_operation_id: saleOperationId, lead_id: (_e = op.leadId) !== null && _e !== void 0 ? _e : null, operation_number: number }, expires: true, expiration_date_from: new Date().toISOString(), expiration_date_to: expiresAt.toISOString(), back_urls: { success: backUrl, pending: backUrl, failure: backUrl }, auto_return: "approved" }, (op.buyerContactEmail ? { payer: { email: op.buyerContactEmail } } : {})),
    });
    await paymentRef.set({
        sellerUid: agencyId,
        saleOperationId,
        operationNumber: number,
        leadId: (_f = op.leadId) !== null && _f !== void 0 ? _f : null,
        vehicleId: (_g = op.vehicleId) !== null && _g !== void 0 ? _g : null,
        vehicleLabel,
        buyerLabel: (_h = op.buyerLabel) !== null && _h !== void 0 ? _h : "Comprador",
        buyerContactEmail: (_j = op.buyerContactEmail) !== null && _j !== void 0 ? _j : null,
        amount,
        currency: "ARS",
        title,
        status: "pending",
        mpPreferenceId: pref.id,
        checkoutUrl: pref.init_point,
        mpPaymentId: null,
        mpStatus: null,
        mpStatusDetail: null,
        createdBy: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
    });
    return { paymentId: paymentRef.id, checkoutUrl: pref.init_point, operationNumber: number };
});
// ─── cancelSenaPayment ──────────────────────────────────────────────────────
exports.cancelSenaPayment = (0, https_1.onCall)({ region: "us-central1", cors: true, secrets: [mpTokenKey] }, async (request) => {
    var _a, _b;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Tenés que iniciar sesión.");
    const { agencyId } = await resolveAgencyAccess(uid);
    const ref = admin.firestore().doc(`senaPayments/${String(((_b = request.data) === null || _b === void 0 ? void 0 : _b.paymentId) || "")}`);
    const snap = await ref.get();
    const p = snap.data();
    if (!p || p.sellerUid !== agencyId)
        throw new https_1.HttpsError("not-found", "No encontramos el cobro.");
    if (p.status !== "pending")
        return { ok: true };
    await ref.update({ status: "cancelled", cancelledAt: admin.firestore.FieldValue.serverTimestamp(), cancelledBy: uid });
    try {
        await expirePreference(await getSellerAccessToken(agencyId), p.mpPreferenceId);
    }
    catch (e) {
        console.error("[cancelSenaPayment]", e);
    }
    return { ok: true };
});
// ─── Aprobación (compartida por el webhook) ─────────────────────────────────
async function onSenaApproved(paymentRef, mp) {
    var _a;
    const db = admin.firestore();
    let justApproved = false;
    let p = {};
    await db.runTransaction(async (t) => {
        var _a, _b, _c, _d, _e;
        const snap = await t.get(paymentRef);
        p = snap.data();
        // Idempotente: MP manda la misma notificación varias veces.
        if (p.status === "approved" || p.status === "refunded")
            return;
        const opRef = db.doc(`saleOperations/${p.saleOperationId}`);
        const vehicleRef = p.vehicleId ? db.doc(`vehicles/${p.vehicleId}`) : null;
        const [opSnap, vehicleSnap] = await Promise.all([t.get(opRef), vehicleRef ? t.get(vehicleRef) : Promise.resolve(null)]);
        justApproved = true;
        t.update(paymentRef, {
            status: "approved",
            mpPaymentId: String(mp.id),
            mpStatus: mp.status,
            mpStatusDetail: (_a = mp.status_detail) !== null && _a !== void 0 ? _a : null,
            paymentMethod: (_b = mp.payment_method_id) !== null && _b !== void 0 ? _b : null,
            payerEmail: (_d = (_c = mp.payer) === null || _c === void 0 ? void 0 : _c.email) !== null && _d !== void 0 ? _d : null,
            paidAt: mp.date_approved ? admin.firestore.Timestamp.fromDate(new Date(mp.date_approved)) : admin.firestore.FieldValue.serverTimestamp(),
        });
        // Checklist: "Seña / Reserva" queda hecha. Se pagó aunque alguien haya
        // cancelado el QR en el medio — la plata ya entró, se registra igual.
        if (opSnap.exists) {
            const checklist = ((_e = opSnap.data().checklist) !== null && _e !== void 0 ? _e : []).map((c) => c.key === "sena" ? Object.assign(Object.assign({}, c), { status: "hecho", completedAt: admin.firestore.Timestamp.now() }) : c);
            t.update(opRef, { checklist, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
        // Auto: se saca de la web (ver encabezado — NO se toca status).
        if (vehicleRef && (vehicleSnap === null || vehicleSnap === void 0 ? void 0 : vehicleSnap.exists) && vehicleSnap.data().status === "available") {
            t.update(vehicleRef, {
                published: false,
                senaHold: {
                    paymentId: paymentRef.id,
                    saleOperationId: p.saleOperationId,
                    at: admin.firestore.FieldValue.serverTimestamp(),
                    wasPublished: vehicleSnap.data().published === true,
                },
            });
        }
    });
    if (!justApproved)
        return;
    const ownerEmail = (_a = (await db.doc(`users/${p.sellerUid}`).get()).data()) === null || _a === void 0 ? void 0 : _a.email;
    const line = `${fmtArs(p.amount)} · OP-${p.operationNumber} · ${p.vehicleLabel}`;
    await Promise.all([
        queueMail(ownerEmail, `Seña recibida: ${p.vehicleLabel}`, `<p><b>Recibiste una seña por Mercado Pago.</b></p><p>${line}<br>Comprador: ${p.buyerLabel}<br>Pago MP n.º ${mp.id}</p><p>El auto se ocultó de la web. <a href="${PORTAL_URL}/dashboard/operaciones/${p.saleOperationId}">Ver la operación</a></p>`),
        queueMail(p.buyerContactEmail, `Tu seña del ${p.vehicleLabel} fue recibida`, `<p><b>¡Listo! Tu seña quedó registrada.</b></p><p>${line}<br>Pago de Mercado Pago n.º ${mp.id}</p><p>La agencia ya fue avisada. Guardá este mail como comprobante.</p>`),
        logAgencyActivity(p.sellerUid, null, "Mercado Pago", p.saleOperationId, `Cobró la seña de ${p.vehicleLabel} (${fmtArs(p.amount)}) por Mercado Pago`),
    ]);
}
exports.mpWebhook = (0, https_1.onRequest)({ region: "us-central1", cors: false, secrets: [mpTokenKey] }, async (req, res) => {
    var _a, _b, _c, _d;
    const pid = typeof req.query.pid === "string" ? req.query.pid : "";
    const topic = String(req.query.type || req.query.topic || ((_a = req.body) === null || _a === void 0 ? void 0 : _a.type) || "");
    const mpPaymentId = String(req.query["data.id"] || ((_c = (_b = req.body) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.id) || (topic === "payment" ? req.query.id : "") || "");
    // Otros avisos (merchant_order, etc.) no nos sirven — 200 para que MP no reintente.
    if (!pid || topic !== "payment" || !/^\d+$/.test(mpPaymentId)) {
        res.status(200).send("ignored");
        return;
    }
    try {
        const paymentRef = admin.firestore().doc(`senaPayments/${pid}`);
        const snap = await paymentRef.get();
        if (!snap.exists) {
            res.status(200).send("unknown");
            return;
        }
        const p = snap.data();
        const token = await getSellerAccessToken(p.sellerUid);
        const mp = await mpFetch(token, `/v1/payments/${mpPaymentId}`);
        if (mp.external_reference !== pid) {
            console.warn("[mpWebhook] external_reference no coincide", pid, mp.external_reference);
            res.status(200).send("mismatch");
            return;
        }
        if (mp.status === "approved") {
            await onSenaApproved(paymentRef, mp);
        }
        else if (p.status === "pending") {
            // Rechazado / en revisión: el cobro sigue abierto (el comprador puede
            // reintentar con otra tarjeta con el mismo QR) — solo se guarda el último intento.
            await paymentRef.update({ mpPaymentId: String(mp.id), mpStatus: mp.status, mpStatusDetail: (_d = mp.status_detail) !== null && _d !== void 0 ? _d : null });
        }
        res.status(200).send("ok");
    }
    catch (e) {
        console.error("[mpWebhook]", pid, mpPaymentId, e);
        res.status(500).send("error"); // MP reintenta
    }
});
// ─── refundSenaPayment ──────────────────────────────────────────────────────
// Devolución total al medio de pago del comprador. Solo dueño o gerente —
// mover plata ya cobrada no es algo que deba poder hacer cualquier vendedor.
exports.refundSenaPayment = (0, https_1.onCall)({ region: "us-central1", cors: true, secrets: [mpTokenKey] }, async (request) => {
    var _a, _b;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Tenés que iniciar sesión.");
    const { agencyId, role } = await resolveAgencyAccess(uid);
    if (role !== "owner" && role !== "manager") {
        throw new https_1.HttpsError("permission-denied", "Solo el dueño o un gerente pueden devolver una seña.");
    }
    const db = admin.firestore();
    const paymentRef = db.doc(`senaPayments/${String(((_b = request.data) === null || _b === void 0 ? void 0 : _b.paymentId) || "")}`);
    const p = (await paymentRef.get()).data();
    if (!p || p.sellerUid !== agencyId)
        throw new https_1.HttpsError("not-found", "No encontramos el cobro.");
    if (p.status !== "approved" || !p.mpPaymentId)
        throw new https_1.HttpsError("failed-precondition", "Solo se puede devolver una seña cobrada.");
    const token = await getSellerAccessToken(agencyId);
    try {
        await mpFetch(token, `/v1/payments/${p.mpPaymentId}/refunds`, { method: "POST", body: {}, idempotencyKey: `refund-${paymentRef.id}` });
    }
    catch (e) {
        console.error("[refundSenaPayment]", e);
        throw new https_1.HttpsError("internal", "Mercado Pago no aceptó la devolución. Revisá que tengas saldo disponible en la cuenta e intentá de nuevo.");
    }
    await db.runTransaction(async (t) => {
        var _a, _b;
        const opRef = db.doc(`saleOperations/${p.saleOperationId}`);
        const vehicleRef = p.vehicleId ? db.doc(`vehicles/${p.vehicleId}`) : null;
        const [opSnap, vehicleSnap] = await Promise.all([t.get(opRef), vehicleRef ? t.get(vehicleRef) : Promise.resolve(null)]);
        t.update(paymentRef, { status: "refunded", refundedAt: admin.firestore.FieldValue.serverTimestamp(), refundedBy: uid });
        if (opSnap.exists) {
            const checklist = ((_a = opSnap.data().checklist) !== null && _a !== void 0 ? _a : []).map((c) => c.key === "sena" ? Object.assign(Object.assign({}, c), { status: "pendiente", completedAt: null }) : c);
            t.update(opRef, { checklist, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
        // Vuelve a la web solo si esta misma seña lo había sacado y nada más lo tocó.
        const v = vehicleSnap === null || vehicleSnap === void 0 ? void 0 : vehicleSnap.data();
        if (vehicleRef && ((_b = v === null || v === void 0 ? void 0 : v.senaHold) === null || _b === void 0 ? void 0 : _b.paymentId) === paymentRef.id && v.status === "available") {
            t.update(vehicleRef, { published: v.senaHold.wasPublished === true, senaHold: admin.firestore.FieldValue.delete() });
        }
    });
    await Promise.all([
        queueMail(p.buyerContactEmail, `Te devolvieron la seña del ${p.vehicleLabel}`, `<p>La agencia te devolvió la seña de ${fmtArs(p.amount)} (OP-${p.operationNumber}). Vuelve al mismo medio con el que pagaste; según el medio puede tardar unos días en verse.</p>`),
        logAgencyActivity(agencyId, uid, await actorName(uid), p.saleOperationId, `Devolvió la seña de ${p.vehicleLabel} (${fmtArs(p.amount)})`),
    ]);
    return { ok: true };
});
//# sourceMappingURL=senaPayments.js.map