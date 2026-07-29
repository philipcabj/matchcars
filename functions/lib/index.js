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
exports.analyzeCarPhotos = exports.chatWithAdvisor = exports.expireFeaturedListings = exports.enforceVehicleLimit = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const generative_ai_1 = require("@google/generative-ai");
admin.initializeApp();
const db = admin.firestore();
const geminiKey = (0, params_1.defineSecret)("GEMINI_API_KEY");
// ─── Helpers ────────────────────────────────────────────────────────────────
const EXCLUDED_STATUSES = [
    "deleted",
    "rejected",
    "rejected_limit",
    "blocked",
    "sold",
];
const FEATURED_DURATION_DAYS = 7;
function getMaxCars(plan) {
    if (!plan || plan === "free")
        return 1;
    if (plan.includes("dealer_pro_plus"))
        return Infinity;
    if (plan.includes("pro_dealer"))
        return 30;
    if (plan.includes("pro_plus"))
        return 7;
    if (plan.includes("pro_monthly") ||
        plan.includes("pro_annual") ||
        plan === "pro")
        return 3;
    return 1;
}
function hasUnlimitedFeatured(plan) {
    return plan.includes("pro_dealer") || plan.includes("dealer_pro_plus");
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
//# sourceMappingURL=index.js.map