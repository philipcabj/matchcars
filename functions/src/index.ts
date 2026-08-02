import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import sharp from "sharp";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

admin.initializeApp();

const db = admin.firestore();
const geminiKey = defineSecret("GEMINI_API_KEY");
const metaCapiToken = defineSecret("META_CAPI_TOKEN");

// ─── Helpers ────────────────────────────────────────────────────────────────

const EXCLUDED_STATUSES = [
  "deleted",
  "rejected",
  "rejected_limit",
  "blocked",
  "sold",
];

const FEATURED_DURATION_DAYS = 7;

function getMaxCars(plan: string): number {
  if (!plan || plan === "free") return 1;
  if (plan.includes("dealer_pro_plus")) return Infinity;
  if (plan.includes("pro_dealer")) return 30;
  if (plan.includes("pro_plus")) return 7;
  if (
    plan.includes("pro_monthly") ||
    plan.includes("pro_annual") ||
    plan === "pro"
  )
    return 3;
  return 1;
}

function hasUnlimitedFeatured(plan: string): boolean {
  return plan.includes("pro_dealer") || plan.includes("dealer_pro_plus");
}

// ─── enforceVehicleLimit ─────────────────────────────────────────────────────

export const enforceVehicleLimit = onDocumentCreated(
  "vehicles/{vehicleId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    const userId: string | undefined = data.userId;
    if (!userId) return;

    const userSnap = await db.doc(`users/${userId}`).get();
    const plan: string = userSnap.data()?.plan || "free";
    const limit = getMaxCars(plan);

    if (limit === Infinity) return;

    const vehiclesSnap = await db
      .collection("vehicles")
      .where("userId", "==", userId)
      .get();

    const activeCount = vehiclesSnap.docs.filter((d) => {
      if (d.id === snap.id) return false;
      const status: string = d.data().status || "available";
      return !EXCLUDED_STATUSES.includes(status);
    }).length;

    if (activeCount >= limit) {
      await snap.ref.update({
        status: "rejected_limit",
        published: false,
        rejectedReason: `Límite del plan alcanzado. Tu plan permite hasta ${limit} auto${limit === 1 ? "" : "s"} activo${limit === 1 ? "" : "s"}.`,
      });
    }
  }
);

// ─── expireFeaturedListings ──────────────────────────────────────────────────

export const expireFeaturedListings = onSchedule("every 6 hours", async () => {
  const cutoff = admin.firestore.Timestamp.fromMillis(
    Date.now() - FEATURED_DURATION_DAYS * 24 * 60 * 60 * 1000
  );

  const expiredSnap = await db
    .collection("vehicles")
    .where("isFeatured", "==", true)
    .where("featuredAt", "<=", cutoff)
    .get();

  if (expiredSnap.empty) return;

  const chunks: admin.firestore.QueryDocumentSnapshot[][] = [];
  for (let i = 0; i < expiredSnap.docs.length; i += 500) {
    chunks.push(expiredSnap.docs.slice(i, i + 500));
  }

  for (const chunk of chunks) {
    const batch = db.batch();
    for (const docSnap of chunk) {
      const plan: string = docSnap.data().userPlan || "free";
      if (hasUnlimitedFeatured(plan)) continue;
      batch.update(docSnap.ref, { isFeatured: false });
    }
    await batch.commit();
  }
});

// ─── IA Advisor — chatWithAdvisor ────────────────────────────────────────────

interface SearchVehiclesInput {
  brand?: string;
  model?: string;
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  maxKm?: number;
  province?: string;
  fuelType?: string;
  acceptsSwap?: boolean;
  acceptsFinancing?: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface VehicleMiniCard {
  id: string;
  brand: string;
  model: string;
  year: number;
  price: number;
  currency: string;
  km: number;
  province: string;
  coverImage: string;
}

interface ChatResponse {
  message: string;
  vehicles: VehicleMiniCard[];
}

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

async function searchVehiclesInFirestore(
  params: SearchVehiclesInput
): Promise<VehicleMiniCard[]> {
  let baseQuery: admin.firestore.Query = db
    .collection("vehicles")
    .where("published", "==", true)
    .where("status", "==", "available");

  if (params.brand) {
    baseQuery = baseQuery.where("brand", "==", params.brand);
  } else if (params.province) {
    baseQuery = baseQuery.where("province", "==", params.province);
  } else if (params.fuelType) {
    baseQuery = baseQuery.where("fuelType", "==", params.fuelType);
  }

  const snapshot = await baseQuery.limit(50).get();

  type RawDoc = { id: string } & Record<string, unknown>;

  const raw: RawDoc[] = snapshot.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as RawDoc)
  );

  const filtered = raw.filter((v) => {
    const price = Number(v.price ?? 0);
    const year = Number(v.year ?? 0);
    const km = Number(v.km ?? 0);
    const model = String(v.model ?? "").toLowerCase();
    const province = String(v.province ?? "").toLowerCase();
    const fuelType = String(v.fuelType ?? "").toLowerCase();

    if (params.model && !model.includes(params.model.toLowerCase())) return false;
    if (params.province && province !== params.province.toLowerCase()) return false;
    if (params.fuelType && fuelType !== params.fuelType.toLowerCase()) return false;
    if (params.minPrice !== undefined && price < params.minPrice) return false;
    if (params.maxPrice !== undefined && price > params.maxPrice) return false;
    if (params.minYear !== undefined && year < params.minYear) return false;
    if (params.maxYear !== undefined && year > params.maxYear) return false;
    if (params.maxKm !== undefined && km > params.maxKm) return false;
    if (params.acceptsSwap === true && !v.acceptsTradeIn) return false;
    if (params.acceptsFinancing === true && !v.acceptsFinancing) return false;
    return true;
  });

  return filtered.slice(0, 5).map((v) => {
    const images = v.images as Record<string, unknown> | undefined;
    const gallery = Array.isArray(images?.gallery) ? images.gallery : [];
    const coverImage = String(v.coverImage ?? images?.cover ?? gallery[0] ?? "");
    return {
      id: String(v.id),
      brand: String(v.brand ?? ""),
      model: String(v.model ?? ""),
      year: Number(v.year ?? 0),
      price: Number(v.price ?? 0),
      currency: String(v.currency ?? "ARS"),
      km: Number(v.km ?? 0),
      province: String(v.province ?? ""),
      coverImage,
    };
  });
}

export const chatWithAdvisor = onCall(
  { secrets: [geminiKey], cors: true },
  async (request): Promise<ChatResponse> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Necesitás iniciar sesión para usar el asesor.");
    }

    const { messages } = request.data as { messages: ChatMessage[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new HttpsError("invalid-argument", "Mensajes inválidos.");
    }

    const genAI = new GoogleGenerativeAI(geminiKey.value());

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_PROMPT,
      tools: [
        {
          functionDeclarations: [
            {
              name: "search_vehicles",
              description:
                "Busca vehículos disponibles en el catálogo de MatchCars. Usá esta herramienta cuando tengas suficientes criterios del usuario.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  brand: { type: SchemaType.STRING, description: "Marca del vehículo (Ford, Toyota, Volkswagen, etc.)" },
                  model: { type: SchemaType.STRING, description: "Modelo del vehículo" },
                  minPrice: { type: SchemaType.NUMBER, description: "Precio mínimo en ARS" },
                  maxPrice: { type: SchemaType.NUMBER, description: "Precio máximo en ARS" },
                  minYear: { type: SchemaType.NUMBER, description: "Año mínimo" },
                  maxYear: { type: SchemaType.NUMBER, description: "Año máximo" },
                  maxKm: { type: SchemaType.NUMBER, description: "Kilometraje máximo" },
                  province: { type: SchemaType.STRING, description: "Provincia argentina" },
                  fuelType: { type: SchemaType.STRING, description: "nafta | diesel | gnc | hibrido | electrico" },
                  acceptsSwap: { type: SchemaType.BOOLEAN, description: "true si quiere permutar" },
                  acceptsFinancing: { type: SchemaType.BOOLEAN, description: "true si necesita financiamiento" },
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

    let foundVehicles: VehicleMiniCard[] = [];

    let result = await chat.sendMessage(lastMessage);
    let response = result.response;

    // Agentic loop — handle function calls
    let iterations = 0;
    while (iterations < 3) {
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const fnCall = parts.find((p) => p.functionCall)?.functionCall;
      if (!fnCall) break;

      if (fnCall.name === "search_vehicles") {
        foundVehicles = await searchVehiclesInFirestore(fnCall.args as SearchVehiclesInput);
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
  }
);

// ─── Tasación IA — analyzeCarPhotos ──────────────────────────────────────────

interface AnalyzePhotosRequest {
  imageUrls: string[];
  brand: string;
  model: string;
  year: number;
  km: number;
  currency: string;
  marketAvgPrice?: number;
}

interface ConditionResult {
  conditionLabel: "Excelente" | "Bueno" | "Regular" | "A reparar";
  conditionScore: number;
  issues: string[];
  priceMin: number;
  priceMax: number;
  priceRationale: string;
}

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

async function fetchImageAsBase64(
  url: string
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const mimeType = contentType.split(";")[0].trim();
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return { base64, mimeType };
  } catch {
    return null;
  }
}

export const analyzeCarPhotos = onCall(
  { secrets: [geminiKey], cors: true },
  async (request): Promise<ConditionResult> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Necesitás iniciar sesión.");
    }

    const { imageUrls, brand, model, year, km, currency, marketAvgPrice } =
      request.data as AnalyzePhotosRequest;

    if (!imageUrls?.length) {
      throw new HttpsError("invalid-argument", "Se requiere al menos una imagen.");
    }

    const imageSlice = imageUrls.slice(0, 4);
    const fetched = await Promise.all(imageSlice.map(fetchImageAsBase64));
    const validImages = fetched.filter(
      (img): img is { base64: string; mimeType: string } => img !== null
    );

    if (validImages.length === 0) {
      throw new HttpsError("internal", "No se pudieron procesar las imágenes.");
    }

    const genAI = new GoogleGenerativeAI(geminiKey.value());
    const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const vehicleContext = `Vehículo: ${brand} ${model} ${year} — ${km.toLocaleString("es-AR")} km — Moneda: ${currency}${
      marketAvgPrice
        ? ` — Precio promedio de mercado: ${currency} ${marketAvgPrice.toLocaleString("es-AR")}`
        : ""
    }`;

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
      const parsed = JSON.parse(cleaned) as ConditionResult;
      return parsed;
    } catch {
      throw new HttpsError("internal", "El modelo devolvió un formato inesperado.");
    }
  }
);

// ─── Meta Conversions API — sendMetaConversionEvent ──────────────────────────
// Server-side mirror of the Meta Pixel events fired on the web funnel
// (matchcars.app). Deduplicated with the client-side pixel via eventId.
// Mitigates signal loss from ad blockers / browser privacy settings so the
// Meta Ads campaign optimizes on more complete conversion data.

const META_PIXEL_ID = "1217053183887888";

interface CapiEventRequest {
  eventName: string;
  eventId: string;
  isStandard?: boolean;
  params?: Record<string, string | number>;
  sourceUrl?: string;
  fbp?: string;
  fbc?: string;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export const sendMetaConversionEvent = onCall(
  { secrets: [metaCapiToken], cors: true },
  async (request) => {
    const { eventName, eventId, params, sourceUrl, fbp, fbc } =
      request.data as CapiEventRequest;

    if (!eventName || !eventId) {
      throw new HttpsError("invalid-argument", "eventName y eventId son requeridos.");
    }

    const userData: Record<string, unknown> = {};
    const ip = request.rawRequest?.headers?.["x-forwarded-for"] || request.rawRequest?.ip;
    if (ip) userData.client_ip_address = String(ip).split(",")[0].trim();
    const userAgent = request.rawRequest?.headers?.["user-agent"];
    if (userAgent) userData.client_user_agent = String(userAgent);
    if (fbp) userData.fbp = fbp;
    if (fbc) userData.fbc = fbc;
    if (request.auth?.uid) userData.external_id = sha256(request.auth.uid);
    if (request.auth?.token?.email) userData.em = sha256(String(request.auth.token.email));

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
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${metaCapiToken.value()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        console.error("[Meta CAPI] Error response", json);
        return { success: false, error: json };
      }
      return { success: true, result: json };
    } catch (e) {
      console.error("[Meta CAPI] Request failed", e);
      return { success: false, error: String(e) };
    }
  }
);

// ─── autoEnhancePhoto ─────────────────────────────────────────────────────
// Se dispara con cada foto subida a uploads/{userId}/{file} (portada y
// galería de add-car.tsx) y aplica una estandarización automática de color:
// auto-orientación, auto-contraste/balance de blancos y nitidez leve.
// Si el vendedor tiene un plan pago con logoUrl + watermarkEnabled, además
// estampa su logo en la esquina inferior derecha.
// Sobrescribe el mismo archivo preservando el token de descarga existente,
// para que la URL que el cliente ya haya obtenido con getDownloadURL()
// siga funcionando una vez que la foto quede mejorada.

function canUseWatermarkPlan(plan: string): boolean {
  return ["pro", "pro_plus", "pro_dealer", "dealer_pro_plus"].some((p) => plan.includes(p));
}

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

async function applyLogoWatermark(baseBuffer: Buffer, userId: string): Promise<Buffer> {
  try {
    const userSnap = await db.doc(`users/${userId}`).get();
    const userData = userSnap.data();
    if (!userData) return baseBuffer;

    const plan = String(userData.plan || "free");
    const watermarkEnabled = userData.watermarkEnabled === true;
    const logoUrl = userData.logoUrl as string | undefined;

    if (!watermarkEnabled || !logoUrl || !canUseWatermarkPlan(plan)) return baseBuffer;

    const logoBuffer = await fetchBuffer(logoUrl);
    if (!logoBuffer) return baseBuffer;

    const baseMeta = await sharp(baseBuffer).metadata();
    const baseWidth = baseMeta.width || 1200;
    const baseHeight = baseMeta.height || 900;
    const margin = Math.round(baseWidth * 0.03);

    // Logo base, un poco más chico que antes (13% del ancho de la foto)
    const resizedLogo = await sharp(logoBuffer)
      .resize({ width: Math.round(baseWidth * 0.13), withoutEnlargement: true })
      .ensureAlpha()
      .png()
      .toBuffer();
    const logoMeta = await sharp(resizedLogo).metadata();
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
    const featherMask = await sharp(Buffer.from(featherSvg)).png().toBuffer();
    const featheredLogo = await sharp(resizedLogo)
      .composite([{ input: featherMask, blend: "dest-in" }])
      .png()
      .toBuffer();

    // Biselado: silueta clara (arriba-izq) + silueta oscura (abajo-der), ambas
    // desenfocadas y semitransparentes, dan sensación de relieve al logo.
    const shadowLayer = await sharp({
      create: { width: logoW, height: logoH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .composite([{ input: featheredLogo, blend: "dest-in" }])
      .blur(2)
      .linear([1, 1, 1, 0.55], [0, 0, 0, 0])
      .png()
      .toBuffer();

    const highlightLayer = await sharp({
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
    const composedWatermark = await sharp({
      create: { width: watermarkW, height: watermarkH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        { input: shadowLayer, left: pad + 2, top: pad + 2 },
        { input: highlightLayer, left: pad - 2, top: pad - 2 },
        { input: featheredLogo, left: pad, top: pad },
      ])
      .png()
      .toBuffer();

    return await sharp(baseBuffer)
      .composite([
        {
          input: composedWatermark,
          top: Math.max(0, baseHeight - watermarkH - margin),
          left: Math.max(0, baseWidth - watermarkW - margin),
        },
      ])
      .toBuffer();
  } catch (e) {
    console.error("[autoEnhancePhoto] watermark failed for", userId, e);
    return baseBuffer;
  }
}

export const autoEnhancePhoto = onObjectFinalized(
  { region: "us-central1", memory: "512MiB", timeoutSeconds: 60 },
  async (event) => {
    const object = event.data;
    const filePath = object.name;
    const contentType = object.contentType;

    if (!filePath || !filePath.startsWith("uploads/")) return;
    if (!contentType?.startsWith("image/")) return;
    if (object.metadata?.enhanced === "true") return; // evita reprocesar nuestra propia salida

    const userId = filePath.split("/")[1];
    const bucket = admin.storage().bucket(object.bucket);
    const file = bucket.file(filePath);

    const tmpIn = path.join(os.tmpdir(), `in_${Date.now()}_${path.basename(filePath)}`);
    const tmpOut = path.join(os.tmpdir(), `out_${Date.now()}_${path.basename(filePath)}`);

    try {
      await file.download({ destination: tmpIn });

      let processedBuffer = await sharp(tmpIn)
        .rotate() // normaliza orientación según EXIF
        .normalize() // auto-contraste / balance de blancos
        .modulate({ saturation: 1.08 }) // realce sutil de color
        .sharpen()
        .toBuffer();

      if (userId) {
        processedBuffer = await applyLogoWatermark(processedBuffer, userId);
      }

      await sharp(processedBuffer).jpeg({ quality: 85 }).toFile(tmpOut);

      // Releemos la metadata justo antes de sobreescribir (no la del evento,
      // que puede estar desactualizada) para capturar el token de descarga
      // que el cliente ya pudo haber generado con getDownloadURL().
      const [freshMeta] = await file.getMetadata().catch(() => [null]);
      const downloadToken = (freshMeta?.metadata as Record<string, string> | undefined)
        ?.firebaseStorageDownloadTokens;

      await bucket.upload(tmpOut, {
        destination: filePath,
        metadata: {
          contentType: "image/jpeg",
          metadata: {
            ...(downloadToken ? { firebaseStorageDownloadTokens: downloadToken } : {}),
            enhanced: "true",
          },
        },
      });
    } catch (e) {
      console.error("[autoEnhancePhoto] Failed to process", filePath, e);
    } finally {
      await Promise.all([
        fs.unlink(tmpIn).catch(() => {}),
        fs.unlink(tmpOut).catch(() => {}),
      ]);
    }
  }
);

// ─── OG preview for /user-profile/** and /agencia/** ───────────────────────
// Firebase Hosting rewrites ALL traffic to these paths through this function
// (see firebase.json). Bots (WhatsApp/Facebook/Twitter/etc, which don't run
// JS) get a small static HTML with the right <meta og:*> tags. Real browsers
// get the same index.html the SPA is normally served, at the original URL,
// so expo-router hydrates and takes over exactly like today.

const BOT_UA_REGEX =
  /facebookexternalhit|Facebot|WhatsApp|Twitterbot|Slackbot|TelegramBot|LinkedInBot|Discordbot|Googlebot|bingbot|SkypeUriPreview|vkShare|Pinterest|redditbot|W3C_Validator/i;

const INDEX_HTML_CACHE_MS = 5 * 60 * 1000;
let cachedIndexHtml: { html: string; fetchedAt: number } | null = null;

async function getIndexHtmlPassthrough(): Promise<string> {
  const now = Date.now();
  if (cachedIndexHtml && now - cachedIndexHtml.fetchedAt < INDEX_HTML_CACHE_MS) {
    return cachedIndexHtml.html;
  }
  const response = await fetch("https://matchcars.app/index.html");
  const html = await response.text();
  cachedIndexHtml = { html, fetchedAt: now };
  return html;
}

function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildOgHtml(params: { title: string; description: string; image: string; url: string }): string {
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
  description:
    "Matchcars es la forma más segura y simple de comprar y vender tu auto usado en Argentina.",
  image: "https://matchcars.app/logo.png",
};

export const ogPreview = onRequest({ region: "us-central1", cors: false }, async (req, res) => {
  const userAgent = String(req.headers["user-agent"] || "");
  const isBot = BOT_UA_REGEX.test(userAgent);

  if (!isBot) {
    try {
      const html = await getIndexHtmlPassthrough();
      res.set("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(html);
    } catch (e) {
      console.error("[ogPreview] passthrough fetch failed", e);
      res.redirect(302, "https://matchcars.app/");
    }
    return;
  }

  const segments = req.path.split("/").filter(Boolean);
  const identifier = segments[segments.length - 1] || "";
  const fallbackHtml = () =>
    buildOgHtml({ ...OG_FALLBACK, url: `https://matchcars.app${req.path}` });

  try {
    // Mirrors hooks/useAgencyProfile.ts (uid doc-get, then slug query fallback) —
    // keep both in sync if this resolution logic ever changes.
    let userDoc = await db.collection("users").doc(identifier).get();
    if (!userDoc.exists) {
      const slugSnap = await db.collection("users").where("slug", "==", identifier).limit(1).get();
      if (!slugSnap.empty) userDoc = slugSnap.docs[0];
    }

    if (!userDoc.exists) {
      res.set("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(fallbackHtml());
      return;
    }

    const pd = userDoc.data() as any;
    const isDealer = !!pd?.plan && String(pd.plan).includes("pro_dealer");
    const name =
      pd?.agencyName ||
      (pd?.firstName || pd?.lastName
        ? `${pd?.firstName ?? ""} ${pd?.lastName ?? ""}`.trim()
        : pd?.displayName || pd?.email || "Usuario");
    const title = isDealer ? `${name} | Agencia en Matchcars` : `${name} | Perfil en Matchcars`;
    const description = isDealer
      ? `Conocé la agencia ${name} en Matchcars. Mirá su stock de vehículos, reputación y contacto.`
      : `Mirá el perfil de ${name} en Matchcars, conocé su reputación y autos publicados.`;
    const image = pd?.bannerUrl || pd?.logoUrl || pd?.photoURL || OG_FALLBACK.image;
    const url = pd?.slug
      ? `https://matchcars.app/agencia/${pd.slug}`
      : `https://matchcars.app/user-profile/${userDoc.id}`;

    res.set("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(buildOgHtml({ title, description, image, url }));
  } catch (e) {
    console.error("[ogPreview] failed to resolve profile", e);
    res.set("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(fallbackHtml());
  }
});
