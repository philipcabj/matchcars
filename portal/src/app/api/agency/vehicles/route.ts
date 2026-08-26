// portal/src/app/api/agency/vehicles/route.ts
// GET  -> lista los vehículos del usuario autenticado (cualquier estado).
// POST -> alta de un vehículo nuevo. Reemplaza la escritura directa a Firestore
//         que hacía WebDealerAddCarForm.tsx: ahora la valida el backend.
//
// Nota: el límite de autos por plan también lo sigue aplicando la Cloud Function
// enforceVehicleLimit (functions/src/index.ts, sin tocar) como red de seguridad
// final — acá lo chequeamos antes para poder devolver un error claro y
// sincrónico en vez de que el auto se cree y quede marcado "rejected_limit".
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { ensureCatalogEntry } from "@/lib/catalog-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_PERMISSIONS, canUploadVideo, getMaxCars } from "@/lib/plans";
import { evaluateVehicleRiskServer } from "@/lib/risk-scoring";
import { EXCLUDED_STATUSES, VehicleFormValues } from "@/lib/vehicle";
import { FieldValue } from "firebase-admin/firestore";

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const { agencyId } = await resolveMembership(uid);
  const snap = await adminDb.collection("vehicles").where("userId", "==", agencyId).get();
  const vehicles = snap.docs
    .map((d) => {
      const data = d.data();
      const margin = typeof data.purchasePrice === "number" ? (data.price ?? 0) - data.purchasePrice - (data.expensesTotal || 0) : null;
      return {
        id: d.id,
        brand: data.brand ?? null,
        model: data.model ?? null,
        version: data.version ?? null,
        licensePlate: data.licensePlate ?? null,
        year: data.year ?? null,
        price: data.price ?? null,
        currency: data.currency ?? null,
        km: data.km ?? null,
        status: data.status ?? "available",
        published: data.published === true,
        coverImage: data.images?.cover ?? data.coverImage ?? null,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
        publicationCode: typeof data.publicationCode === "number" ? data.publicationCode : null,
        margin,
        purchasePrice: typeof data.purchasePrice === "number" ? data.purchasePrice : null,
      };
    })
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  return Response.json({ vehicles });
});

export const POST = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageStock) {
    return Response.json({ error: "Tu rol no tiene permiso para publicar autos." }, { status: 403 });
  }

  const userSnap = await adminDb.doc(`users/${agencyId}`).get();
  if (!userSnap.exists) return Response.json({ error: "Agencia no encontrada" }, { status: 404 });
  const userData = userSnap.data() ?? {};
  const plan: string = userData.plan || "free";

  const body = (await request.json()) as Partial<VehicleFormValues>;

  if (!body.brand?.trim() || !body.model?.trim() || !body.year || !body.price) {
    return Response.json({ error: "Marca, modelo, año y precio son obligatorios." }, { status: 400 });
  }
  if (!body.province || !body.city) {
    return Response.json({ error: "Provincia y ciudad son obligatorias." }, { status: 400 });
  }
  if (!body.coverImage) {
    return Response.json({ error: "Falta la foto de portada." }, { status: 400 });
  }

  const maxCars = getMaxCars(plan);
  if (Number.isFinite(maxCars)) {
    const existingSnap = await adminDb.collection("vehicles").where("userId", "==", agencyId).get();
    const activeCount = existingSnap.docs.filter((d) => {
      const status = d.data().status || "available";
      return !EXCLUDED_STATUSES.includes(status);
    }).length;
    if (activeCount >= maxCars) {
      return Response.json(
        {
          error: `Tu plan actual permite hasta ${maxCars} auto${maxCars === 1 ? "" : "s"} activo${maxCars === 1 ? "" : "s"}. Tenés ${activeCount}. Actualizá tu plan para publicar más.`,
        },
        { status: 400 }
      );
    }
  }

  const yearNum = Number(body.year);
  const priceNum = Number(body.price);
  const kmNum = body.km ? Number(body.km) : 0;
  const currency = body.currency === "USD" ? "USD" : "ARS";
  const toggles = body.toggles ?? {};
  const isDealer = /pro_dealer/.test(plan);
  const userName = isDealer && userData.agencyName ? userData.agencyName : userData.displayName || userData.email || "Agencia";

  // Igual que en la app: análisis adicional, no bloqueante — si falla, se publica igual sin flags.
  let risk = { flags: [] as string[], score: 0 };
  try {
    risk = await evaluateVehicleRiskServer({
      brand: body.brand.trim(),
      model: body.model.trim(),
      year: yearNum,
      price: priceNum,
      currency,
      description: body.description || "",
      userId: agencyId,
      trustLevel: userData.trustLevel || "new",
      coverImage: body.coverImage,
    });
  } catch (e) {
    console.error("Error evaluando riesgo (no bloqueante):", e);
  }

  const vehicleData = {
    userId: agencyId,
    // uid real que publica — puede ser un vendedor invitado (agencyId ya es
    // el dueño, no la persona). Lo usa logVehicleCreatedActivity
    // (functions/src/index.ts) para atribuir la actividad a quien publicó,
    // no solo a la agencia.
    createdByUid: uid,
    userName,
    userPlan: plan,
    sellerTrustLevel: userData.trustLevel || "new",
    brand: body.brand.trim(),
    model: body.model.trim(),
    version: body.version || null,
    year: yearNum,
    price: priceNum,
    currency,
    km: kmNum,
    fuelType: body.fuelType || null,
    gearbox: body.gearbox || null,
    licensePlate: body.licensePlate ? body.licensePlate.trim().toUpperCase() : null,
    description: body.description || null,

    singleOwner: !!toggles.singleOwner,
    serviceRecords: !!toggles.serviceRecords,
    vtvValid: !!toggles.vtvValid,
    papersUpToDate: !!toggles.papersUpToDate,
    warranty: !!toggles.warranty,

    location: {
      province: body.province || userData.province || null,
      city: body.city || userData.city || null,
    },
    images: {
      cover: body.coverImage,
      gallery: body.gallery ?? [],
    },
    // El form ya oculta este campo si el plan no incluye video (VehicleForm.tsx),
    // pero eso es solo UI — sin este chequeo, un POST directo lo podía saltear.
    video: canUploadVideo(plan) ? body.video || null : null,
    acceptsFinancing: !!toggles.acceptsFinancing,
    negotiablePrice: !!toggles.negotiablePrice,
    immediateDelivery: !!toggles.immediateDelivery,
    originalPrice: priceNum,
    priceHistory: [{ price: priceNum, currency, changedAt: new Date() }],
    updatedAt: FieldValue.serverTimestamp(),
    published: false,
    status: "pending_review",
    likedBy: [],
    isFeatured: isDealer,
    featuredAt: isDealer ? FieldValue.serverTimestamp() : null,
    views: 0,
    likesCount: 0,
    flags: { forSale: true, tradeIn: !!toggles.acceptsTradeIn },
    riskFlags: risk.flags,
    riskScore: risk.score,
    createdAt: FieldValue.serverTimestamp(),
  };

  const docRef = await adminDb.collection("vehicles").add(vehicleData);
  await ensureCatalogEntry(vehicleData.brand, vehicleData.model, vehicleData.version);
  // La actividad de "publicó un auto" la registra logVehicleCreatedActivity
  // (Cloud Function, trigger onDocumentCreated en vehicles/{id}) — un solo
  // punto que ve tanto esta alta como la de la app (add-car.tsx), en vez de
  // duplicar la lógica acá.
  return Response.json({ id: docRef.id }, { status: 201 });
});
