import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

admin.initializeApp();

const db = admin.firestore();
const geminiKey = defineSecret("GEMINI_API_KEY");

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
