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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ogPreview = exports.startBulkImport = exports.autoEnhancePhoto = exports.sendMetaConversionEvent = exports.analyzeCarPhotos = exports.chatWithAdvisor = exports.runPostSaleTasks = exports.onSaleConfirmed = exports.resolvePendingSaleConfirmations = exports.expireFeaturedListings = exports.logVehicleCreatedActivity = exports.assignPublicationCode = exports.enforceVehicleLimit = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const storage_1 = require("firebase-functions/v2/storage");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const sharp_1 = __importDefault(require("sharp"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const papaparse_1 = __importDefault(require("papaparse"));
const generative_ai_1 = require("@google/generative-ai");
admin.initializeApp();
const db = admin.firestore();
const geminiKey = (0, params_1.defineSecret)("GEMINI_API_KEY");
const metaCapiToken = (0, params_1.defineSecret)("META_CAPI_TOKEN");
// ─── Helpers ────────────────────────────────────────────────────────────────
const EXCLUDED_STATUSES = [
    "deleted",
    "rejected",
    "rejected_limit",
    "blocked",
    "sold",
    "a_preparar",
];
const FEATURED_DURATION_DAYS = 7;
function getMaxCars(plan) {
    if (!plan || plan === "free")
        return 1;
    if (plan.includes("pro_dealer") || plan === "pro_internal")
        return 100;
    if (plan.includes("pro_plus"))
        return 40;
    if (plan.includes("pro_monthly") ||
        plan.includes("pro_annual") ||
        plan === "pro")
        return 15;
    return 1;
}
function hasUnlimitedFeatured(plan) {
    return plan.includes("pro_dealer") || plan === "pro_internal";
}
// ─── enforceVehicleLimit ─────────────────────────────────────────────────────
exports.enforceVehicleLimit = (0, firestore_1.onDocumentCreated)("vehicles/{vehicleId}", async (event) => {
    var _a;
    const snap = event.data;
    if (!snap)
        return;
    const data = snap.data();
    const userId = data.userId;
    if (!userId)
        return;
    const userSnap = await db.doc(`users/${userId}`).get();
    const plan = ((_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.plan) || "free";
    const limit = getMaxCars(plan);
    if (limit === Infinity)
        return;
    const vehiclesSnap = await db
        .collection("vehicles")
        .where("userId", "==", userId)
        .get();
    const activeCount = vehiclesSnap.docs.filter((d) => {
        if (d.id === snap.id)
            return false;
        const status = d.data().status || "available";
        return !EXCLUDED_STATUSES.includes(status);
    }).length;
    if (activeCount >= limit) {
        await snap.ref.update({
            status: "rejected_limit",
            published: false,
            rejectedReason: `Límite del plan alcanzado. Tu plan permite hasta ${limit} auto${limit === 1 ? "" : "s"} activo${limit === 1 ? "" : "s"}.`,
        });
    }
});
// ─── assignPublicationCode ───────────────────────────────────────────────────
// Número secuencial corto (#4821) para que dueños/soporte/admin puedan
// referenciar una publicación sin usar el ID largo de Firestore — no lo
// reemplaza, es un campo adicional (`publicationCode`). Server-side (Cloud
// Function, no client-side) a propósito: hay varios lugares que crean un
// vehicles/{id} (add-car de la app, alta desde el portal, carga masiva del
// portal) y así se garantiza un único punto que asigna el número, sin
// duplicar la lógica de transacción en cada uno ni exponer el contador a
// escritura directa del cliente. Contador en counters/vehicles.value,
// incrementado atómicamente en una transacción para que altas concurrentes
// nunca choquen el mismo número.
exports.assignPublicationCode = (0, firestore_1.onDocumentCreated)("vehicles/{vehicleId}", async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    if (snap.data().publicationCode)
        return; // ya lo tiene (backfill manual, reintento, etc.)
    const counterRef = db.doc("counters/vehicles");
    const code = await db.runTransaction(async (tx) => {
        var _a;
        const counterSnap = await tx.get(counterRef);
        const next = (((_a = counterSnap.data()) === null || _a === void 0 ? void 0 : _a.value) || 0) + 1;
        tx.set(counterRef, { value: next }, { merge: true });
        return next;
    });
    await snap.ref.update({ publicationCode: code });
});
// ─── logVehicleCreatedActivity ───────────────────────────────────────────────
// Registra la publicación de un auto nuevo en agencies/{agencyId}/activity
// (ver portal/src/lib/activity-log.ts para qué más se registra ahí) sin
// importar si el documento se creó desde la app (add-car.tsx) o desde el
// portal (POST /api/agency/vehicles) — cada uno escribe directo a Firestore
// por su lado, así que un trigger acá es el único punto que ve ambos, mismo
// criterio que assignPublicationCode arriba. Atribuye la acción a
// createdByUid si el auto lo trae (el uid real que publicó, puede ser un
// vendedor invitado) o si no al dueño de la cuenta (userId) — autos creados
// antes de que existiera ese campo no tienen forma de saber quién puntual
// del equipo publicó. Nunca debe romper la publicación real si falla: nada
// de esto se re-lanza.
exports.logVehicleCreatedActivity = (0, firestore_1.onDocumentCreated)("vehicles/{vehicleId}", async (event) => {
    var _a, _b;
    try {
        const snap = event.data;
        if (!snap)
            return;
        const data = snap.data();
        const agencyId = data.userId;
        if (!agencyId)
            return;
        const actorUid = data.createdByUid || agencyId;
        const actorSnap = await db.doc(`users/${actorUid}`).get();
        const actorData = actorSnap.data();
        const actorName = `${(_a = actorData === null || actorData === void 0 ? void 0 : actorData.firstName) !== null && _a !== void 0 ? _a : ""} ${(_b = actorData === null || actorData === void 0 ? void 0 : actorData.lastName) !== null && _b !== void 0 ? _b : ""}`.trim() ||
            (actorData === null || actorData === void 0 ? void 0 : actorData.displayName) ||
            (actorData === null || actorData === void 0 ? void 0 : actorData.agencyName) ||
            (actorData === null || actorData === void 0 ? void 0 : actorData.email) ||
            actorUid;
        const carLabel = [data.brand, data.model, data.year].filter(Boolean).join(" ") || "un auto";
        await db.collection(`agencies/${agencyId}/activity`).add({
            actorUid,
            actorName,
            entityType: "vehicle",
            entityId: snap.id,
            summary: `Publicó ${carLabel}`,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    catch (e) {
        console.error("[logVehicleCreatedActivity] no se pudo registrar", e);
    }
});
// ─── expireFeaturedListings ──────────────────────────────────────────────────
exports.expireFeaturedListings = (0, scheduler_1.onSchedule)("every 6 hours", async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - FEATURED_DURATION_DAYS * 24 * 60 * 60 * 1000);
    const expiredSnap = await db
        .collection("vehicles")
        .where("isFeatured", "==", true)
        .where("featuredAt", "<=", cutoff)
        .get();
    if (expiredSnap.empty)
        return;
    const chunks = [];
    for (let i = 0; i < expiredSnap.docs.length; i += 500) {
        chunks.push(expiredSnap.docs.slice(i, i + 500));
    }
    for (const chunk of chunks) {
        const batch = db.batch();
        for (const docSnap of chunk) {
            const plan = docSnap.data().userPlan || "free";
            if (hasUnlimitedFeatured(plan))
                continue;
            batch.update(docSnap.ref, { isFeatured: false });
        }
        await batch.commit();
    }
});
// ─── resolvePendingSaleConfirmations ─────────────────────────────────────────
// Corre diario: un auto marcado "vendido" con comprador real queda en
// "reserved" hasta que el comprador confirma que lo recibió (ver
// handleMarkAsSold en app/(screens)/chat/[uid].tsx y mark_vehicle_sold en
// portal/src/app/api/agency/leads/[id]/route.ts). Si pasan 3 días sin
// confirmar ni rechazar, se da por entregado igual (2026-08-19: antes esto
// revertía la venta — status "available" de nuevo — como si nunca hubiera
// pasado, pero la agencia ya entregó el auto en la vida real; que el
// comprador no haya tocado la app no debería deshacer una venta real). Se
// confirma sola (confirmedByBuyer:true, dispara onSaleConfirmed → Postventa
// igual que una confirmación manual) y se le manda un aviso al comprador
// invitándolo a puntuar al vendedor — el panel de calificación ya le va a
// aparecer solo la próxima vez que abra ese chat, no hace falta nada extra
// para habilitarlo.
async function sendSimpleMail(recipientUid, subject, bodyHtml) {
    var _a;
    try {
        const userSnap = await db.doc(`users/${recipientUid}`).get();
        const email = (_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.email;
        if (!email)
            return;
        await db.collection("mail").add({
            to: [email],
            toUids: [recipientUid],
            from: "MatchCars <noreply@matchcars.app>",
            message: { subject, html: `<div style="font-family:sans-serif;padding:24px;color:#111"><p>${bodyHtml}</p></div>` },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    catch (e) {
        console.error("[resolvePendingSaleConfirmations] mail error", e);
    }
}
async function sendSimplePush(recipientUid, title, body, data) {
    var _a;
    try {
        const userSnap = await db.doc(`users/${recipientUid}`).get();
        const token = (_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.pushToken;
        if (!token)
            return;
        await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify(Object.assign({ to: token, sound: "default", title, body }, (data ? { data } : {}))),
        });
    }
    catch (e) {
        console.error("[resolvePendingSaleConfirmations] push error", e);
    }
}
exports.resolvePendingSaleConfirmations = (0, scheduler_1.onSchedule)("every 24 hours", async () => {
    var _a, _b, _c, _d;
    const now = Date.now();
    // Un solo where (sin combinar con buyerConfirmDeadline) para no necesitar
    // un índice compuesto nuevo — el volumen de ventas pendientes de
    // confirmar es chico, filtrar el plazo en memoria alcanza.
    const pendingSnap = await db.collection("sales").where("confirmedByBuyer", "==", null).get();
    for (const saleSnap of pendingSnap.docs) {
        const sale = saleSnap.data();
        const deadline = sale.buyerConfirmDeadline;
        if (!deadline || deadline.toMillis() > now)
            continue;
        const vehicleId = sale.vehicleId;
        const sellerId = sale.sellerId;
        const buyerId = sale.buyerId;
        if (!vehicleId || !sellerId || !buyerId)
            continue;
        try {
            await saleSnap.ref.update({
                confirmedByBuyer: true,
                confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
                confirmedAutomatically: true, // distingue de una confirmación real del comprador, por si hace falta más adelante (reportes, confianza)
            });
            await db.doc(`vehicles/${vehicleId}`).update({ status: "sold" });
            const carModel = `${(_b = (_a = sale.vehicleSnapshot) === null || _a === void 0 ? void 0 : _a.brand) !== null && _b !== void 0 ? _b : ""} ${(_d = (_c = sale.vehicleSnapshot) === null || _c === void 0 ? void 0 : _c.model) !== null && _d !== void 0 ? _d : ""}`.trim() || "el auto";
            const chatDeepLink = { url: `matchcars://chat/${sellerId}?vehicleId=${vehicleId}` };
            await Promise.all([
                sendSimpleMail(buyerId, `Confirmamos tu compra de ${carModel}`, `Como no confirmaste la recepción a tiempo, dimos por entregado <strong>${carModel}</strong> — el vendedor ya marcó la entrega. Entrá a la app y contanos cómo te fue calificando al vendedor.`),
                sendSimplePush(buyerId, "¡Confirmamos tu compra!", `Calificá al vendedor de ${carModel} en la app.`, chatDeepLink),
                sendSimpleMail(sellerId, `Se confirmó la entrega de ${carModel}`, `El comprador no respondió a tiempo, así que confirmamos la entrega de <strong>${carModel}</strong> automáticamente — no hizo falta esperar más.`),
                sendSimplePush(sellerId, "Entrega confirmada", `Se confirmó automáticamente la entrega de ${carModel}.`),
            ]);
            // onSaleConfirmed (más abajo) se dispara solo con el update de arriba
            // y crea las tareas de Postventa — mismo camino que una confirmación
            // manual del comprador.
        }
        catch (e) {
            console.error("[resolvePendingSaleConfirmations] error processing sale", saleSnap.id, e);
        }
    }
});
// Offsets en días desde la confirmación. "recontacto" es a propósito manual
// (canal "manual", nunca se auto-envía nada) — es un gesto comercial de la
// agencia, no un mensaje genérico; solo queda como recordatorio en el panel.
const TASK_OFFSETS_DAYS = {
    encuesta: 2,
    resena: 7,
    service: 30,
    recontacto: 90,
};
exports.onSaleConfirmed = (0, firestore_1.onDocumentUpdated)("sales/{vehicleId}", async (event) => {
    var _a, _b, _c;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    if (before.confirmedByBuyer === true || after.confirmedByBuyer !== true)
        return; // solo al pasar A true
    if (!after.buyerId || !after.sellerId)
        return; // sin comprador real no hay a quién hacerle seguimiento
    const vehicleId = event.params.vehicleId;
    const now = Date.now();
    const batch = db.batch();
    for (const tipo of Object.keys(TASK_OFFSETS_DAYS)) {
        const ref = db.collection("postSaleTasks").doc();
        batch.set(ref, {
            saleId: vehicleId,
            vehicleId,
            sellerId: after.sellerId,
            buyerId: after.buyerId,
            vehicleSnapshot: (_c = after.vehicleSnapshot) !== null && _c !== void 0 ? _c : null,
            tipo,
            programadaPara: admin.firestore.Timestamp.fromMillis(now + TASK_OFFSETS_DAYS[tipo] * 24 * 60 * 60 * 1000),
            estado: "pendiente",
            canal: tipo === "recontacto" ? "manual" : "auto",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    await batch.commit();
});
function postSaleMessage(tipo, carModel) {
    switch (tipo) {
        case "encuesta":
            return { title: "¿Cómo te fue con tu compra?", body: `Contanos cómo estuvo tu experiencia comprando ${carModel} — respondé este mensaje.` };
        case "resena":
            return { title: "¿Nos dejás una reseña?", body: `Si ${carModel} cumplió tus expectativas, una reseña ayuda a otros compradores.` };
        case "service":
            return { title: "Recordatorio de service", body: `Ya pasó un tiempo desde que retiraste ${carModel} — es un buen momento para el primer service.` };
        default:
            return { title: "", body: "" };
    }
}
// Un solo where (estado == "pendiente") y el resto se filtra en memoria —
// mismo criterio que resolvePendingSaleConfirmations, para no necesitar un
// índice compuesto nuevo (equality + range en campos distintos sí lo pide).
exports.runPostSaleTasks = (0, scheduler_1.onSchedule)("every 6 hours", async () => {
    var _a, _b, _c, _d;
    const now = Date.now();
    const snap = await db.collection("postSaleTasks").where("estado", "==", "pendiente").get();
    for (const taskSnap of snap.docs) {
        const task = taskSnap.data();
        if (task.canal === "manual")
            continue; // recontacto: lo maneja la agencia a mano, no se toca acá
        const programadaPara = task.programadaPara;
        if (!programadaPara || programadaPara.toMillis() > now)
            continue;
        try {
            const carModel = `${(_b = (_a = task.vehicleSnapshot) === null || _a === void 0 ? void 0 : _a.brand) !== null && _b !== void 0 ? _b : ""} ${(_d = (_c = task.vehicleSnapshot) === null || _c === void 0 ? void 0 : _c.model) !== null && _d !== void 0 ? _d : ""}`.trim() || "tu auto";
            const { title, body } = postSaleMessage(task.tipo, carModel);
            if (title) {
                await Promise.all([sendSimpleMail(task.buyerId, title, body), sendSimplePush(task.buyerId, title, body)]);
            }
            await taskSnap.ref.update({ estado: "enviada", sentAt: admin.firestore.FieldValue.serverTimestamp() });
        }
        catch (e) {
            console.error("[runPostSaleTasks] error processing task", taskSnap.id, e);
        }
    }
});
const SYSTEM_PROMPT = `Sos el asesor de compra de MatchCars, la plataforma de autos usados más moderna de Argentina.
Tu trabajo es ayudar a los compradores a encontrar el auto ideal dentro del catálogo real de MatchCars.

REGLAS:
- Respondé siempre en español argentino informal (usá "vos", "dale", "copado", etc.)
- Hacé preguntas breves y concretas para entender las necesidades
- Cuando tengas presupuesto + al menos un criterio más, usá la herramienta search_vehicles
- Si encontrás resultados, presentalos de forma entusiasta pero honesta
- Si no hay resultados, sugerí ampliar criterios y volvé a buscar con parámetros más flexibles
- Nunca inventes datos de vehículos que no vienen de la búsqueda
- Los precios son en pesos argentinos (ARS). "Palos" o "melones" = millones de pesos
- Sé conciso: respuestas de 2-4 líneas máximo, sin listas largas

FLUJO IDEAL:
1. Saludá brevemente y preguntá qué busca
2. Recopilá: presupuesto, uso, provincia, combustible, km máximo, si tiene auto para permutar
3. Buscá en el catálogo con search_vehicles
4. Presentá los resultados destacando lo mejor de cada uno
5. Ofrecé refinar si el usuario no quedó conforme`;
async function searchVehiclesInFirestore(params) {
    let baseQuery = db
        .collection("vehicles")
        .where("published", "==", true)
        .where("status", "==", "available");
    if (params.brand) {
        baseQuery = baseQuery.where("brand", "==", params.brand);
    }
    else if (params.province) {
        baseQuery = baseQuery.where("province", "==", params.province);
    }
    else if (params.fuelType) {
        baseQuery = baseQuery.where("fuelType", "==", params.fuelType);
    }
    const snapshot = await baseQuery.limit(50).get();
    const raw = snapshot.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
    const filtered = raw.filter((v) => {
        var _a, _b, _c, _d, _e, _f;
        const price = Number((_a = v.price) !== null && _a !== void 0 ? _a : 0);
        const year = Number((_b = v.year) !== null && _b !== void 0 ? _b : 0);
        const km = Number((_c = v.km) !== null && _c !== void 0 ? _c : 0);
        const model = String((_d = v.model) !== null && _d !== void 0 ? _d : "").toLowerCase();
        const province = String((_e = v.province) !== null && _e !== void 0 ? _e : "").toLowerCase();
        const fuelType = String((_f = v.fuelType) !== null && _f !== void 0 ? _f : "").toLowerCase();
        if (params.model && !model.includes(params.model.toLowerCase()))
            return false;
        if (params.province && province !== params.province.toLowerCase())
            return false;
        if (params.fuelType && fuelType !== params.fuelType.toLowerCase())
            return false;
        if (params.minPrice !== undefined && price < params.minPrice)
            return false;
        if (params.maxPrice !== undefined && price > params.maxPrice)
            return false;
        if (params.minYear !== undefined && year < params.minYear)
            return false;
        if (params.maxYear !== undefined && year > params.maxYear)
            return false;
        if (params.maxKm !== undefined && km > params.maxKm)
            return false;
        if (params.acceptsSwap === true && !v.acceptsTradeIn)
            return false;
        if (params.acceptsFinancing === true && !v.acceptsFinancing)
            return false;
        return true;
    });
    return filtered.slice(0, 5).map((v) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        const images = v.images;
        const gallery = Array.isArray(images === null || images === void 0 ? void 0 : images.gallery) ? images.gallery : [];
        const coverImage = String((_c = (_b = (_a = v.coverImage) !== null && _a !== void 0 ? _a : images === null || images === void 0 ? void 0 : images.cover) !== null && _b !== void 0 ? _b : gallery[0]) !== null && _c !== void 0 ? _c : "");
        return {
            id: String(v.id),
            brand: String((_d = v.brand) !== null && _d !== void 0 ? _d : ""),
            model: String((_e = v.model) !== null && _e !== void 0 ? _e : ""),
            year: Number((_f = v.year) !== null && _f !== void 0 ? _f : 0),
            price: Number((_g = v.price) !== null && _g !== void 0 ? _g : 0),
            currency: String((_h = v.currency) !== null && _h !== void 0 ? _h : "ARS"),
            km: Number((_j = v.km) !== null && _j !== void 0 ? _j : 0),
            province: String((_k = v.province) !== null && _k !== void 0 ? _k : ""),
            coverImage,
        };
    });
}
exports.chatWithAdvisor = (0, https_1.onCall)({ secrets: [geminiKey], cors: true }, async (request) => {
    var _a, _b, _c, _d, _e;
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Necesitás iniciar sesión para usar el asesor.");
    }
    const { messages } = request.data;
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "Mensajes inválidos.");
    }
    const genAI = new generative_ai_1.GoogleGenerativeAI(geminiKey.value());
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: SYSTEM_PROMPT,
        tools: [
            {
                functionDeclarations: [
                    {
                        name: "search_vehicles",
                        description: "Busca vehículos disponibles en el catálogo de MatchCars. Usá esta herramienta cuando tengas suficientes criterios del usuario.",
                        parameters: {
                            type: generative_ai_1.SchemaType.OBJECT,
                            properties: {
                                brand: { type: generative_ai_1.SchemaType.STRING, description: "Marca del vehículo (Ford, Toyota, Volkswagen, etc.)" },
                                model: { type: generative_ai_1.SchemaType.STRING, description: "Modelo del vehículo" },
                                minPrice: { type: generative_ai_1.SchemaType.NUMBER, description: "Precio mínimo en ARS" },
                                maxPrice: { type: generative_ai_1.SchemaType.NUMBER, description: "Precio máximo en ARS" },
                                minYear: { type: generative_ai_1.SchemaType.NUMBER, description: "Año mínimo" },
                                maxYear: { type: generative_ai_1.SchemaType.NUMBER, description: "Año máximo" },
                                maxKm: { type: generative_ai_1.SchemaType.NUMBER, description: "Kilometraje máximo" },
                                province: { type: generative_ai_1.SchemaType.STRING, description: "Provincia argentina" },
                                fuelType: { type: generative_ai_1.SchemaType.STRING, description: "nafta | diesel | gnc | hibrido | electrico" },
                                acceptsSwap: { type: generative_ai_1.SchemaType.BOOLEAN, description: "true si quiere permutar" },
                                acceptsFinancing: { type: generative_ai_1.SchemaType.BOOLEAN, description: "true si necesita financiamiento" },
                            },
                            required: [],
                        },
                    },
                ],
            },
        ],
    });
    // Build history (all messages except the last one)
    // Gemini requires history to start with 'user' — drop any leading model messages
    const allHistory = messages.slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
    }));
    const firstUserIdx = allHistory.findIndex((h) => h.role === "user");
    const history = firstUserIdx >= 0 ? allHistory.slice(firstUserIdx) : [];
    const chat = model.startChat({ history });
    const lastMessage = messages[messages.length - 1].content;
    let foundVehicles = [];
    let result = await chat.sendMessage(lastMessage);
    let response = result.response;
    // Agentic loop — handle function calls
    let iterations = 0;
    while (iterations < 3) {
        const parts = (_d = (_c = (_b = (_a = response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) !== null && _d !== void 0 ? _d : [];
        const fnCall = (_e = parts.find((p) => p.functionCall)) === null || _e === void 0 ? void 0 : _e.functionCall;
        if (!fnCall)
            break;
        if (fnCall.name === "search_vehicles") {
            foundVehicles = await searchVehiclesInFirestore(fnCall.args);
            result = await chat.sendMessage([
                {
                    functionResponse: {
                        name: "search_vehicles",
                        response: {
                            found: foundVehicles.length,
                            vehicles: foundVehicles.map((v) => ({
                                id: v.id,
                                brand: v.brand,
                                model: v.model,
                                year: v.year,
                                price: v.price,
                                currency: v.currency,
                                km: v.km,
                                province: v.province,
                            })),
                        },
                    },
                },
            ]);
            response = result.response;
        }
        iterations++;
    }
    const finalText = response.text() || "No pude procesar tu consulta. Por favor intentá de nuevo.";
    return { message: finalText, vehicles: foundVehicles };
});
const VALUATION_PROMPT = `Sos un tasador experto en autos usados del mercado argentino.
Analizá las fotos del vehículo y evaluá:
1. Condición general (Excelente / Bueno / Regular / A reparar) con un puntaje del 1 al 10
2. Problemas visibles (rayones, abolladuras, oxidación, estado tapizado, tablero, motor si se ve)
3. Rango de precio sugerido en pesos argentinos, considerando:
   - La condición observada en las fotos
   - El año, km y marca/modelo informados
   - El precio promedio de mercado si se provee

Respondé SOLO con un JSON válido con esta estructura exacta:
{
  "conditionLabel": "Bueno",
  "conditionScore": 7,
  "issues": ["Rayón pequeño en paragolpes trasero"],
  "priceMin": 9000000,
  "priceMax": 11000000,
  "priceRationale": "Precio acorde al mercado para el km y condición observada"
}

No agregues texto fuera del JSON.`;
async function fetchImageAsBase64(url) {
    var _a;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok)
            return null;
        const contentType = (_a = res.headers.get("content-type")) !== null && _a !== void 0 ? _a : "image/jpeg";
        const mimeType = contentType.split(";")[0].trim();
        const buffer = await res.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        return { base64, mimeType };
    }
    catch (_b) {
        return null;
    }
}
exports.analyzeCarPhotos = (0, https_1.onCall)({ secrets: [geminiKey], cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Necesitás iniciar sesión.");
    }
    const { imageUrls, brand, model, year, km, currency, marketAvgPrice } = request.data;
    if (!(imageUrls === null || imageUrls === void 0 ? void 0 : imageUrls.length)) {
        throw new https_1.HttpsError("invalid-argument", "Se requiere al menos una imagen.");
    }
    const imageSlice = imageUrls.slice(0, 4);
    const fetched = await Promise.all(imageSlice.map(fetchImageAsBase64));
    const validImages = fetched.filter((img) => img !== null);
    if (validImages.length === 0) {
        throw new https_1.HttpsError("internal", "No se pudieron procesar las imágenes.");
    }
    const genAI = new generative_ai_1.GoogleGenerativeAI(geminiKey.value());
    const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const vehicleContext = `Vehículo: ${brand} ${model} ${year} — ${km.toLocaleString("es-AR")} km — Moneda: ${currency}${marketAvgPrice
        ? ` — Precio promedio de mercado: ${currency} ${marketAvgPrice.toLocaleString("es-AR")}`
        : ""}`;
    const imageParts = validImages.map((img) => ({
        inlineData: { mimeType: img.mimeType, data: img.base64 },
    }));
    const result = await geminiModel.generateContent([
        { text: VALUATION_PROMPT },
        { text: vehicleContext },
        ...imageParts,
    ]);
    const text = result.response.text();
    try {
        const cleaned = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        return parsed;
    }
    catch (_a) {
        throw new https_1.HttpsError("internal", "El modelo devolvió un formato inesperado.");
    }
});
// ─── Meta Conversions API — sendMetaConversionEvent ──────────────────────────
// Server-side mirror of the Meta Pixel events fired on the web funnel
// (matchcars.app). Deduplicated with the client-side pixel via eventId.
// Mitigates signal loss from ad blockers / browser privacy settings so the
// Meta Ads campaign optimizes on more complete conversion data.
const META_PIXEL_ID = "1217053183887888";
function sha256(value) {
    return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}
exports.sendMetaConversionEvent = (0, https_1.onCall)({ secrets: [metaCapiToken], cors: true }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const { eventName, eventId, params, sourceUrl, fbp, fbc } = request.data;
    if (!eventName || !eventId) {
        throw new https_1.HttpsError("invalid-argument", "eventName y eventId son requeridos.");
    }
    const userData = {};
    const ip = ((_b = (_a = request.rawRequest) === null || _a === void 0 ? void 0 : _a.headers) === null || _b === void 0 ? void 0 : _b["x-forwarded-for"]) || ((_c = request.rawRequest) === null || _c === void 0 ? void 0 : _c.ip);
    if (ip)
        userData.client_ip_address = String(ip).split(",")[0].trim();
    const userAgent = (_e = (_d = request.rawRequest) === null || _d === void 0 ? void 0 : _d.headers) === null || _e === void 0 ? void 0 : _e["user-agent"];
    if (userAgent)
        userData.client_user_agent = String(userAgent);
    if (fbp)
        userData.fbp = fbp;
    if (fbc)
        userData.fbc = fbc;
    if ((_f = request.auth) === null || _f === void 0 ? void 0 : _f.uid)
        userData.external_id = sha256(request.auth.uid);
    if ((_h = (_g = request.auth) === null || _g === void 0 ? void 0 : _g.token) === null || _h === void 0 ? void 0 : _h.email)
        userData.em = sha256(String(request.auth.token.email));
    const payload = {
        data: [
            {
                event_name: eventName,
                event_time: Math.floor(Date.now() / 1000),
                event_id: eventId,
                event_source_url: sourceUrl,
                action_source: "website",
                user_data: userData,
                custom_data: params || {},
            },
        ],
    };
    try {
        const res = await fetch(`https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${metaCapiToken.value()}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) {
            console.error("[Meta CAPI] Error response", json);
            return { success: false, error: json };
        }
        return { success: true, result: json };
    }
    catch (e) {
        console.error("[Meta CAPI] Request failed", e);
        return { success: false, error: String(e) };
    }
});
// ─── autoEnhancePhoto ─────────────────────────────────────────────────────
// Se dispara con cada foto subida a uploads/{userId}/{file} (portada y
// galería de add-car.tsx) y aplica una estandarización automática de color:
// auto-orientación, auto-contraste/balance de blancos y nitidez leve.
// Si el vendedor tiene un plan pago con logoUrl + watermarkEnabled, además
// estampa su logo en la esquina inferior derecha.
// Sobrescribe el mismo archivo preservando el token de descarga existente,
// para que la URL que el cliente ya haya obtenido con getDownloadURL()
// siga funcionando una vez que la foto quede mejorada.
function canUseWatermarkPlan(plan) {
    return ["pro", "pro_plus", "pro_dealer"].some((p) => plan.includes(p));
}
async function fetchBuffer(url) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok)
            return null;
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
    catch (_a) {
        return null;
    }
}
async function applyLogoWatermark(baseBuffer, userId) {
    try {
        const userSnap = await db.doc(`users/${userId}`).get();
        const userData = userSnap.data();
        if (!userData)
            return baseBuffer;
        const plan = String(userData.plan || "free");
        const watermarkEnabled = userData.watermarkEnabled === true;
        const logoUrl = userData.logoUrl;
        if (!watermarkEnabled || !logoUrl || !canUseWatermarkPlan(plan))
            return baseBuffer;
        const logoBuffer = await fetchBuffer(logoUrl);
        if (!logoBuffer)
            return baseBuffer;
        const baseMeta = await (0, sharp_1.default)(baseBuffer).metadata();
        const baseWidth = baseMeta.width || 1200;
        const baseHeight = baseMeta.height || 900;
        const margin = Math.round(baseWidth * 0.03);
        // Logo base, un poco más chico que antes (13% del ancho de la foto)
        const resizedLogo = await (0, sharp_1.default)(logoBuffer)
            .resize({ width: Math.round(baseWidth * 0.13), withoutEnlargement: true })
            .ensureAlpha()
            .png()
            .toBuffer();
        const logoMeta = await (0, sharp_1.default)(resizedLogo).metadata();
        const logoW = logoMeta.width || 0;
        const logoH = logoMeta.height || 0;
        // Esfumado: degradé radial que desvanece el logo hacia sus bordes
        const featherSvg = `
      <svg width="${logoW}" height="${logoH}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="fade" cx="50%" cy="50%" r="65%">
            <stop offset="55%" stop-color="white" stop-opacity="1"/>
            <stop offset="100%" stop-color="white" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#fade)"/>
      </svg>`;
        const featherMask = await (0, sharp_1.default)(Buffer.from(featherSvg)).png().toBuffer();
        const featheredLogo = await (0, sharp_1.default)(resizedLogo)
            .composite([{ input: featherMask, blend: "dest-in" }])
            .png()
            .toBuffer();
        // Biselado: silueta clara (arriba-izq) + silueta oscura (abajo-der), ambas
        // desenfocadas y semitransparentes, dan sensación de relieve al logo.
        const shadowLayer = await (0, sharp_1.default)({
            create: { width: logoW, height: logoH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
        })
            .composite([{ input: featheredLogo, blend: "dest-in" }])
            .blur(2)
            .linear([1, 1, 1, 0.55], [0, 0, 0, 0])
            .png()
            .toBuffer();
        const highlightLayer = await (0, sharp_1.default)({
            create: { width: logoW, height: logoH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
        })
            .composite([{ input: featheredLogo, blend: "dest-in" }])
            .blur(1.5)
            .linear([1, 1, 1, 0.4], [0, 0, 0, 0])
            .png()
            .toBuffer();
        const pad = 6;
        const watermarkW = logoW + pad * 2;
        const watermarkH = logoH + pad * 2;
        const composedWatermark = await (0, sharp_1.default)({
            create: { width: watermarkW, height: watermarkH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
        })
            .composite([
            { input: shadowLayer, left: pad + 2, top: pad + 2 },
            { input: highlightLayer, left: pad - 2, top: pad - 2 },
            { input: featheredLogo, left: pad, top: pad },
        ])
            .png()
            .toBuffer();
        return await (0, sharp_1.default)(baseBuffer)
            .composite([
            {
                input: composedWatermark,
                top: Math.max(0, baseHeight - watermarkH - margin),
                left: Math.max(0, baseWidth - watermarkW - margin),
            },
        ])
            .toBuffer();
    }
    catch (e) {
        console.error("[autoEnhancePhoto] watermark failed for", userId, e);
        return baseBuffer;
    }
}
exports.autoEnhancePhoto = (0, storage_1.onObjectFinalized)({ region: "us-central1", memory: "512MiB", timeoutSeconds: 60 }, async (event) => {
    var _a, _b;
    const object = event.data;
    const filePath = object.name;
    const contentType = object.contentType;
    if (!filePath || !filePath.startsWith("uploads/"))
        return;
    if (!(contentType === null || contentType === void 0 ? void 0 : contentType.startsWith("image/")))
        return;
    if (((_a = object.metadata) === null || _a === void 0 ? void 0 : _a.enhanced) === "true")
        return; // evita reprocesar nuestra propia salida
    const userId = filePath.split("/")[1];
    const bucket = admin.storage().bucket(object.bucket);
    const file = bucket.file(filePath);
    const tmpIn = path.join(os.tmpdir(), `in_${Date.now()}_${path.basename(filePath)}`);
    const tmpOut = path.join(os.tmpdir(), `out_${Date.now()}_${path.basename(filePath)}`);
    try {
        await file.download({ destination: tmpIn });
        let processedBuffer = await (0, sharp_1.default)(tmpIn)
            .rotate() // normaliza orientación según EXIF
            .normalize() // auto-contraste / balance de blancos
            .modulate({ saturation: 1.08 }) // realce sutil de color
            .sharpen()
            .toBuffer();
        if (userId) {
            processedBuffer = await applyLogoWatermark(processedBuffer, userId);
        }
        await (0, sharp_1.default)(processedBuffer).jpeg({ quality: 85 }).toFile(tmpOut);
        // Releemos la metadata justo antes de sobreescribir (no la del evento,
        // que puede estar desactualizada) para capturar el token de descarga
        // que el cliente ya pudo haber generado con getDownloadURL().
        const [freshMeta] = await file.getMetadata().catch(() => [null]);
        const downloadToken = (_b = freshMeta === null || freshMeta === void 0 ? void 0 : freshMeta.metadata) === null || _b === void 0 ? void 0 : _b.firebaseStorageDownloadTokens;
        await bucket.upload(tmpOut, {
            destination: filePath,
            metadata: {
                contentType: "image/jpeg",
                metadata: Object.assign(Object.assign({}, (downloadToken ? { firebaseStorageDownloadTokens: downloadToken } : {})), { enhanced: "true" }),
            },
        });
    }
    catch (e) {
        console.error("[autoEnhancePhoto] Failed to process", filePath, e);
    }
    finally {
        await Promise.all([
            fs.unlink(tmpIn).catch(() => { }),
            fs.unlink(tmpOut).catch(() => { }),
        ]);
    }
});
// ─── startBulkImport ─────────────────────────────────────────────────────
// Procesa la carga masiva de agencias: el cliente sube data.csv + photos.zip a
// bulkImports/{uid}/{jobId}/ en Storage y llama a esta función con el jobId.
// Se ejecuta server-side (a diferencia del importador anterior, que hacía todo
// en el navegador y se perdía si el usuario cerraba la pestaña) y reporta
// progreso incremental en bulkImportJobs/{jobId}, que el cliente escucha con
// onSnapshot.
// Identidad de negocio (dealer) — solo gatea el auto-featured al importar,
// no el acceso a la carga masiva en sí (ver canBulkImportServer, universal).
function isDealerPlanServer(plan) {
    return plan.includes("pro_dealer");
}
// Carga masiva (CSV): disponible en cualquier plan pago, ya no exclusiva de
// Dealer — reestructuración de planes, el portal se vende entero desde Pro.
function canBulkImportServer(plan) {
    return !!plan && plan !== "free";
}
function mapCsvRow(row) {
    const currencyRaw = (row.currency || row.moneda || "USD").toString().toUpperCase();
    const currency = currencyRaw.includes("PESO") || currencyRaw.includes("ARS") ? "ARS" : "USD";
    return {
        id: row.id || row.sku || row.vin || "",
        brand: row.brand || row.marca || "",
        model: row.model || row.modelo || "",
        version: row.version || row["versión"] || row.variant || "",
        year: row.year || row["año"] || row.anio || "",
        price: row.price || row.precio || "",
        currency,
        km: row.km || row.kilometraje || "",
        description: row.description || row.descripcion || "",
        fuel: row.fuel || row.combustible || "",
        transmission: row.transmission || row.transmision || "",
        // Patente/dominio — columna opcional nueva, sin relación con id/sku/vin
        // (eso se usa para matchear fotos del ZIP, no es el campo del auto).
        licensePlate: (row.patente || row.dominio || row.licensePlate || row.plate || "").toUpperCase(),
    };
}
function guessImageContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    if (ext === ".png")
        return "image/png";
    if (ext === ".webp")
        return "image/webp";
    return "image/jpeg";
}
exports.startBulkImport = (0, https_1.onCall)({ memory: "1GiB", timeoutSeconds: 540, cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Necesitás iniciar sesión.");
    }
    const uid = request.auth.uid;
    const { jobId } = request.data;
    if (!jobId || typeof jobId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "Falta el jobId.");
    }
    const userSnap = await db.doc(`users/${uid}`).get();
    const userData = userSnap.data() || {};
    const plan = userData.plan || "free";
    if (!canBulkImportServer(plan) && userData.role !== "admin") {
        throw new https_1.HttpsError("permission-denied", "La carga masiva está disponible solo para planes pagos.");
    }
    const bucket = admin.storage().bucket();
    const jobRef = db.doc(`bulkImportJobs/${jobId}`);
    const tmpCsv = path.join(os.tmpdir(), `bulk_${jobId}_data.csv`);
    const tmpZip = path.join(os.tmpdir(), `bulk_${jobId}_photos.zip`);
    try {
        await bucket.file(`bulkImports/${uid}/${jobId}/data.csv`).download({ destination: tmpCsv });
        await bucket.file(`bulkImports/${uid}/${jobId}/photos.zip`).download({ destination: tmpZip });
        const csvContent = await fs.readFile(tmpCsv, "utf8");
        const parsed = papaparse_1.default.parse(csvContent, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim().toLowerCase(),
        });
        const rows = parsed.data
            .map(mapCsvRow)
            .filter((r) => r.brand && r.model);
        if (rows.length === 0) {
            throw new https_1.HttpsError("invalid-argument", "No se encontraron vehículos válidos en el CSV (se requieren las columnas brand/marca y model/modelo).");
        }
        const zip = new adm_zip_1.default(tmpZip);
        const imageEntries = zip
            .getEntries()
            .filter((e) => !e.isDirectory && /\.(jpe?g|png|webp)$/i.test(e.entryName));
        const matchImages = (id) => {
            if (!id)
                return [];
            const idLower = id.toLowerCase();
            return imageEntries.filter((e) => {
                const parts = e.entryName.split("/").filter(Boolean);
                const filename = parts[parts.length - 1] || "";
                const folder = parts.length > 1 ? parts[0] : "";
                return filename.toLowerCase().startsWith(idLower) || folder.toLowerCase() === idLower;
            });
        };
        await jobRef.set({
            userId: uid,
            status: "processing",
            totalCount: rows.length,
            processedCount: 0,
            successCount: 0,
            failCount: 0,
            errors: [],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        const userName = userData.agencyName || userData.firstName || "Agencia";
        const locationStr = userData.address || userData.businessAddress || "Ubicación a consultar";
        const errors = [];
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const vehicleLabel = `${row.brand} ${row.model}`.trim();
            try {
                const matched = matchImages(row.id);
                const imageUrls = [];
                for (const entry of matched) {
                    const buffer = entry.getData();
                    const filename = `${Date.now()}_${Math.floor(Math.random() * 1e6)}${path.extname(entry.entryName) || ".jpg"}`;
                    const filePath = `uploads/${uid}/${filename}`;
                    const token = crypto.randomUUID();
                    await bucket.file(filePath).save(buffer, {
                        metadata: {
                            contentType: guessImageContentType(entry.entryName),
                            metadata: { firebaseStorageDownloadTokens: token },
                        },
                    });
                    imageUrls.push(`https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`);
                }
                await db.collection("vehicles").add({
                    userId: uid,
                    userName,
                    userPlan: plan,
                    brand: row.brand,
                    model: row.model,
                    version: row.version || null,
                    year: Number(row.year) || row.year,
                    price: Number(row.price) || row.price,
                    currency: row.currency,
                    km: Number(row.km) || 0,
                    fuelType: row.fuel || null,
                    gearbox: row.transmission || null,
                    licensePlate: row.licensePlate || null,
                    description: row.description || null,
                    location: {
                        province: userData.province || null,
                        city: userData.city || locationStr,
                    },
                    images: {
                        cover: imageUrls[0] || "",
                        gallery: imageUrls.slice(1),
                    },
                    published: false,
                    status: "pending_review",
                    isFeatured: isDealerPlanServer(plan),
                    featuredAt: isDealerPlanServer(plan) ? admin.firestore.FieldValue.serverTimestamp() : null,
                    views: 0,
                    likesCount: 0,
                    likedBy: [],
                    internalId: row.id || null,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                successCount++;
            }
            catch (e) {
                failCount++;
                errors.push({
                    row: i + 1,
                    vehicle: vehicleLabel || `Fila ${i + 1}`,
                    message: e instanceof Error ? e.message : String(e),
                });
            }
            await jobRef.update({
                processedCount: i + 1,
                successCount,
                failCount,
                errors,
            });
        }
        await jobRef.update({
            status: "done",
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { jobId, successCount, failCount };
    }
    catch (e) {
        await jobRef.set({
            status: "error",
            errorMessage: e instanceof Error ? e.message : String(e),
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        if (e instanceof https_1.HttpsError)
            throw e;
        throw new https_1.HttpsError("internal", "No se pudo procesar la carga masiva.");
    }
    finally {
        await Promise.all([
            fs.unlink(tmpCsv).catch(() => { }),
            fs.unlink(tmpZip).catch(() => { }),
        ]);
    }
});
// ─── OG preview for /user-profile/** and /agencia/** ───────────────────────
// Firebase Hosting rewrites ALL traffic to these paths through this function
// (see firebase.json). Bots (WhatsApp/Facebook/Twitter/etc, which don't run
// JS) get a small static HTML with the right <meta og:*> tags. Real browsers
// get the same index.html the SPA is normally served, at the original URL,
// so expo-router hydrates and takes over exactly like today.
const BOT_UA_REGEX = /facebookexternalhit|Facebot|WhatsApp|Twitterbot|Slackbot|TelegramBot|LinkedInBot|Discordbot|Googlebot|bingbot|SkypeUriPreview|vkShare|Pinterest|redditbot|W3C_Validator/i;
const INDEX_HTML_CACHE_MS = 5 * 60 * 1000;
let cachedIndexHtml = null;
async function getIndexHtmlPassthrough() {
    const now = Date.now();
    if (cachedIndexHtml && now - cachedIndexHtml.fetchedAt < INDEX_HTML_CACHE_MS) {
        return cachedIndexHtml.html;
    }
    const response = await fetch("https://matchcars.app/index.html");
    const html = await response.text();
    cachedIndexHtml = { html, fetchedAt: now };
    return html;
}
function escapeHtml(input) {
    return String(input)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function buildOgHtml(params) {
    const { title, description, image, url } = params;
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(url)}" />
<meta property="og:type" content="profile" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(url)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
</head>
<body></body>
</html>`;
}
const OG_FALLBACK = {
    title: "Matchcars | Compra y venta de autos usados",
    description: "Matchcars es la forma más segura y simple de comprar y vender tu auto usado en Argentina.",
    image: "https://matchcars.app/logo.png",
};
exports.ogPreview = (0, https_1.onRequest)({ region: "us-central1", cors: false }, async (req, res) => {
    var _a, _b;
    const userAgent = String(req.headers["user-agent"] || "");
    const isBot = BOT_UA_REGEX.test(userAgent);
    if (!isBot) {
        try {
            const html = await getIndexHtmlPassthrough();
            res.set("Content-Type", "text/html; charset=utf-8");
            res.status(200).send(html);
        }
        catch (e) {
            console.error("[ogPreview] passthrough fetch failed", e);
            res.redirect(302, "https://matchcars.app/");
        }
        return;
    }
    const segments = req.path.split("/").filter(Boolean);
    const identifier = segments[segments.length - 1] || "";
    const fallbackHtml = () => buildOgHtml(Object.assign(Object.assign({}, OG_FALLBACK), { url: `https://matchcars.app${req.path}` }));
    try {
        // Mirrors hooks/useAgencyProfile.ts (uid doc-get, then slug query fallback) —
        // keep both in sync if this resolution logic ever changes.
        let userDoc = await db.collection("users").doc(identifier).get();
        if (!userDoc.exists) {
            const slugSnap = await db.collection("users").where("slug", "==", identifier).limit(1).get();
            if (!slugSnap.empty)
                userDoc = slugSnap.docs[0];
        }
        if (!userDoc.exists) {
            res.set("Content-Type", "text/html; charset=utf-8");
            res.status(200).send(fallbackHtml());
            return;
        }
        const pd = userDoc.data();
        const isDealer = !!(pd === null || pd === void 0 ? void 0 : pd.plan) && String(pd.plan).includes("pro_dealer");
        const name = (pd === null || pd === void 0 ? void 0 : pd.agencyName) ||
            ((pd === null || pd === void 0 ? void 0 : pd.firstName) || (pd === null || pd === void 0 ? void 0 : pd.lastName)
                ? `${(_a = pd === null || pd === void 0 ? void 0 : pd.firstName) !== null && _a !== void 0 ? _a : ""} ${(_b = pd === null || pd === void 0 ? void 0 : pd.lastName) !== null && _b !== void 0 ? _b : ""}`.trim()
                : (pd === null || pd === void 0 ? void 0 : pd.displayName) || (pd === null || pd === void 0 ? void 0 : pd.email) || "Usuario");
        const title = isDealer ? `${name} | Agencia en Matchcars` : `${name} | Perfil en Matchcars`;
        const description = isDealer
            ? `Conocé la agencia ${name} en Matchcars. Mirá su stock de vehículos, reputación y contacto.`
            : `Mirá el perfil de ${name} en Matchcars, conocé su reputación y autos publicados.`;
        const image = (pd === null || pd === void 0 ? void 0 : pd.bannerUrl) || (pd === null || pd === void 0 ? void 0 : pd.logoUrl) || (pd === null || pd === void 0 ? void 0 : pd.photoURL) || OG_FALLBACK.image;
        const url = (pd === null || pd === void 0 ? void 0 : pd.slug)
            ? `https://matchcars.app/agencia/${pd.slug}`
            : `https://matchcars.app/user-profile/${userDoc.id}`;
        res.set("Content-Type", "text/html; charset=utf-8");
        res.status(200).send(buildOgHtml({ title, description, image, url }));
    }
    catch (e) {
        console.error("[ogPreview] failed to resolve profile", e);
        res.set("Content-Type", "text/html; charset=utf-8");
        res.status(200).send(fallbackHtml());
    }
});
//# sourceMappingURL=index.js.map