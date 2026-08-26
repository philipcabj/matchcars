// portal/src/app/api/agency/vehicles/[id]/route.ts
// GET   -> trae un vehículo propio (para precargar el form de edición).
// PATCH -> edita los campos editables. No toca status/published/moderación —
//          eso lo sigue manejando el flujo de moderación existente, sin tocar.
import { ApiAuthError, requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { logActivity } from "@/lib/activity-log";
import { resolveMembership } from "@/lib/agency-server";
import { ensureCatalogEntry } from "@/lib/catalog-server";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_PERMISSIONS, canUploadVideo } from "@/lib/plans";
import { FieldValue, type DocumentReference, type DocumentSnapshot } from "firebase-admin/firestore";

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

async function loadOwnedVehicle(
  agencyId: string,
  id: string
): Promise<{ ref: DocumentReference; snap: DocumentSnapshot }> {
  const ref = adminDb.doc(`vehicles/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiAuthError("No encontrado", 404);
  const data = snap.data()!;
  if (data.userId !== agencyId) throw new ApiAuthError("No autorizado", 403);
  return { ref, snap };
}

export const GET = withApiErrors(async (request, ctx: RouteContext<"/api/agency/vehicles/[id]">) => {
  const uid = await requireUid(request);
  const { agencyId } = await resolveMembership(uid);
  const { id } = await ctx.params;
  const { snap } = await loadOwnedVehicle(agencyId, id);

  const data = snap.data()!;
  return Response.json({
    id: snap.id,
    brand: data.brand ?? "",
    model: data.model ?? "",
    version: data.version ?? "",
    year: data.year ? String(data.year) : "",
    price: data.price ? String(data.price) : "",
    currency: data.currency ?? "ARS",
    km: data.km ? String(data.km) : "",
    fuelType: data.fuelType ?? "",
    gearbox: data.gearbox ?? "",
    licensePlate: data.licensePlate ?? "",
    description: data.description ?? "",
    province: data.location?.province ?? "",
    city: data.location?.city ?? "",
    coverImage: data.images?.cover ?? "",
    gallery: data.images?.gallery ?? [],
    video: data.video ?? "",
    toggles: {
      singleOwner: !!data.singleOwner,
      serviceRecords: !!data.serviceRecords,
      vtvValid: !!data.vtvValid,
      papersUpToDate: !!data.papersUpToDate,
      warranty: !!data.warranty,
      acceptsTradeIn: !!data.flags?.tradeIn,
      acceptsFinancing: !!data.acceptsFinancing,
      negotiablePrice: !!data.negotiablePrice,
      immediateDelivery: !!data.immediateDelivery,
    },
    status: data.status ?? "available",
    published: data.published === true,
    rejectionReason: data.rejectionReason || data.rejectedReason || null,
    views: data.views ?? 0,
    likesCount: data.likesCount ?? 0,
    createdAt: toIso(data.createdAt),
    approvedAt: toIso(data.approvedAt),
    rejectedAt: toIso(data.rejectedAt),
    deletedAt: toIso(data.deletedAt),
    soldAt: toIso(data.soldAt),
    publicationCode: typeof data.publicationCode === "number" ? data.publicationCode : null,
    purchasePrice: typeof data.purchasePrice === "number" ? data.purchasePrice : null,
    expensesTotal: typeof data.expensesTotal === "number" ? data.expensesTotal : 0,
    priceHistory: (data.priceHistory ?? []).map((h: { price: number; currency: string; changedAt?: { toDate?: () => Date } }) => ({
      price: h.price,
      currency: h.currency,
      changedAt: toIso(h.changedAt),
    })),
    // Solo lectura de sales/{id} (ya la escriben app/functions/portal en el
    // flujo de venta existente) — para poder mostrar en el timeline si el
    // comprador confirmó la entrega y cuándo, sin escribir nada nuevo.
    sale:
      data.status === "reserved" || data.status === "sold"
        ? await (async () => {
            const saleSnap = await adminDb.doc(`sales/${id}`).get();
            if (!saleSnap.exists) return null;
            const sale = saleSnap.data()!;
            return {
              confirmedByBuyer: sale.confirmedByBuyer ?? null,
              confirmedAt: toIso(sale.confirmedAt),
              confirmedAutomatically: !!sale.confirmedAutomatically,
            };
          })()
        : null,
  });
});

export const PATCH = withApiErrors(async (request, ctx: RouteContext<"/api/agency/vehicles/[id]">) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageStock) {
    return Response.json({ error: "Tu rol no tiene permiso para editar autos." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const { ref, snap } = await loadOwnedVehicle(agencyId, id);

  const existing = snap.data()!;
  const body = await request.json();

  if (!body.brand?.trim() || !body.model?.trim() || !body.year || !body.price) {
    return Response.json({ error: "Marca, modelo, año y precio son obligatorios." }, { status: 400 });
  }
  if (!body.province || !body.city) {
    return Response.json({ error: "Provincia y ciudad son obligatorias." }, { status: 400 });
  }

  const priceNum = Number(body.price);
  const currency = body.currency === "USD" ? "USD" : "ARS";
  const toggles = body.toggles ?? {};
  const priceChanged = priceNum !== existing.price || currency !== existing.currency;

  // Plan actual (no el que tenía al publicar — puede haber bajado de plan
  // desde entonces) para no dejar guardar un campo que ya no le corresponde.
  const ownerSnap = await adminDb.doc(`users/${agencyId}`).get();
  const plan: string = ownerSnap.data()?.plan || "free";

  const update: Record<string, unknown> = {
    brand: body.brand.trim(),
    model: body.model.trim(),
    version: body.version || null,
    year: Number(body.year),
    price: priceNum,
    currency,
    km: body.km ? Number(body.km) : 0,
    fuelType: body.fuelType || null,
    gearbox: body.gearbox || null,
    licensePlate: body.licensePlate ? String(body.licensePlate).trim().toUpperCase() : null,
    description: body.description || null,
    singleOwner: !!toggles.singleOwner,
    serviceRecords: !!toggles.serviceRecords,
    vtvValid: !!toggles.vtvValid,
    papersUpToDate: !!toggles.papersUpToDate,
    warranty: !!toggles.warranty,
    location: { province: body.province || null, city: body.city || null },
    images: { cover: body.coverImage, gallery: body.gallery ?? [] },
    video: canUploadVideo(plan) ? body.video || null : null,
    acceptsFinancing: !!toggles.acceptsFinancing,
    negotiablePrice: !!toggles.negotiablePrice,
    immediateDelivery: !!toggles.immediateDelivery,
    flags: { ...(existing.flags ?? {}), tradeIn: !!toggles.acceptsTradeIn },
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (priceChanged) {
    update.priceHistory = FieldValue.arrayUnion({ price: priceNum, currency, changedAt: new Date() });
  }

  await ref.update(update);
  await ensureCatalogEntry(body.brand.trim(), body.model.trim(), body.version || null);

  if (priceChanged) {
    const carLabel = `${body.brand.trim()} ${body.model.trim()}`.trim();
    await logActivity({
      agencyId,
      actorUid: uid,
      entityType: "vehicle",
      entityId: id,
      summary: `Cambió el precio de ${carLabel}: ${existing.currency ?? "ARS"} ${Number(existing.price ?? 0).toLocaleString("es-AR")} → ${currency} ${priceNum.toLocaleString("es-AR")}`,
    });
  }

  return Response.json({ ok: true });
});

// Baja de una publicación — no existía ninguna forma de hacer esto desde el
// portal hasta ahora (solo desde la app, handleDeleteVehicle en
// app/car/[id].tsx). Mismo criterio exacto: soft-delete permanente, sin
// deshacer — status:"deleted" ya está en EXCLUDED_STATUSES en todos lados.
export const DELETE = withApiErrors(async (request, ctx: RouteContext<"/api/agency/vehicles/[id]">) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageStock) {
    return Response.json({ error: "Tu rol no tiene permiso para eliminar autos." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const { ref, snap } = await loadOwnedVehicle(agencyId, id);
  if (snap.data()?.status === "deleted") return Response.json({ ok: true });

  await ref.update({ status: "deleted", published: false, updatedAt: FieldValue.serverTimestamp() });

  const deleted = snap.data()!;
  const carLabel = `${deleted.brand ?? ""} ${deleted.model ?? ""}`.trim() || "un auto";
  await logActivity({ agencyId, actorUid: uid, entityType: "vehicle", entityId: id, summary: `Eliminó ${carLabel}` });

  return Response.json({ ok: true });
});
