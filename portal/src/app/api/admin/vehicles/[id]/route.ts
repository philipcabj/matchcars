// portal/src/app/api/admin/vehicles/[id]/route.ts
// PATCH { action: "approve" } | { action: "reject", reason: string } | { action: "delete", reason: string }
// approve/reject espejan handleApprove/confirmRejection de
// app/(admin)/dashboard.tsx (moderación de pendientes). "delete" es nuevo:
// permite al admin bajar CUALQUIER publicación (no solo pendientes o
// reportadas), a pedido del usuario — mismo mecanismo de soft-delete que ya
// usa el dueño al borrar su propio auto (status "deleted", ver
// app/car/[id].tsx:2966), pero acá con motivo obligatorio guardado en
// `rejectionReason` (mismo campo que ya lee el Stock del portal para
// mostrar el cartel de "por qué no está publicado", sea cual sea el status).
import { deleteVehicleAsAdmin } from "@/lib/admin-vehicle-actions";
import { requireAdminRole, requireSuperAdmin } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";
import { sendNotificationEmail } from "@/lib/notify-mail";
import { sendPushNotification } from "@/lib/notify-push";

// GET -> detalle completo de CUALQUIER publicación (no scopeado a agencia,
// a diferencia de /api/agency/vehicles/[id]). No existía forma de ver el
// detalle completo de un auto desde el panel de admin del portal — solo la
// tarjeta resumida de ModerationTab/AllVehiclesTab. Espejo del GET de
// /api/agency/vehicles/[id] + datos del dueño + señales de riesgo.
export const GET = withApiErrors(async (request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdminRole(request);
  const { id } = await params;
  const snap = await adminDb.doc(`vehicles/${id}`).get();
  if (!snap.exists) return Response.json({ error: "Vehículo no encontrado" }, { status: 404 });
  const data = snap.data()!;

  let ownerEmail: string | null = null;
  let ownerPlan: string | null = null;
  if (data.userId) {
    const ownerSnap = await adminDb.doc(`users/${data.userId}`).get();
    ownerEmail = ownerSnap.data()?.email ?? null;
    ownerPlan = ownerSnap.data()?.plan ?? null;
  }

  return Response.json({
    id: snap.id,
    brand: data.brand ?? "",
    model: data.model ?? "",
    version: data.version ?? "",
    year: data.year ?? null,
    price: data.price ?? 0,
    currency: data.currency ?? "ARS",
    km: data.km ?? 0,
    fuelType: data.fuelType ?? "",
    gearbox: data.gearbox ?? "",
    licensePlate: data.licensePlate ?? "",
    description: data.description ?? "",
    province: data.location?.province ?? "",
    city: data.location?.city ?? "",
    coverImage: data.images?.cover ?? data.coverImage ?? data.cover ?? "",
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
    rejectionReason: data.rejectionReason || data.rejectedReason || null,
    riskScore: data.riskScore ?? 0,
    riskFlags: Array.isArray(data.riskFlags) ? data.riskFlags : [],
    views: data.views ?? 0,
    likesCount: data.likesCount ?? 0,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
    publicationCode: typeof data.publicationCode === "number" ? data.publicationCode : null,
    userId: data.userId ?? "",
    userName: data.userName ?? "",
    userEmail: ownerEmail,
    userPlan: ownerPlan,
  });
});

export const PATCH = withApiErrors(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await request.json();

  // "delete" es más sensible que approve/reject de la cola de moderación
  // (puede bajar cualquier publicación viva, no solo pendientes) — admin
  // only, mismo criterio que la gestión de usuarios.
  if (body.action === "delete") await requireSuperAdmin(request);
  else await requireAdminRole(request);

  const vehicleRef = adminDb.doc(`vehicles/${id}`);
  const vehicleSnap = await vehicleRef.get();
  if (!vehicleSnap.exists) return Response.json({ error: "Vehículo no encontrado" }, { status: 404 });
  const vehicleData = vehicleSnap.data()!;
  const carModel = [vehicleData.brand, vehicleData.model, vehicleData.year].filter(Boolean).join(" ");
  const ownerId: string | undefined = vehicleData.userId;

  if (body.action === "approve") {
    await vehicleRef.update({ status: "available", published: true, approvedAt: new Date() });

    if (ownerId) {
      const notifRef = adminDb.collection(`users/${ownerId}/system_notifications`).doc();
      notifRef
        .set({
          type: "vehicle_approved",
          vehicleId: id,
          brand: vehicleData.brand || null,
          model: vehicleData.model || null,
          year: vehicleData.year || null,
          createdAt: new Date(),
          read: false,
        })
        .catch(() => {});

      sendNotificationEmail("vehicle_approved", {
        recipientUid: ownerId,
        senderName: "MatchCars",
        subject: "¡Tu publicación ya está activa!",
        carModel,
        ctaLink: `https://matchcars.app/car/${id}`,
      }).catch(() => {});

      adminDb
        .doc(`users/${ownerId}`)
        .get()
        .then((ownerSnap) => {
          const pushToken = ownerSnap.data()?.pushToken;
          if (pushToken) {
            sendPushNotification(
              pushToken,
              "¡Tu publicación ya está activa!",
              `${carModel || "Tu auto"} ya está visible para todos los compradores.`,
              { url: `matchcars://car/${id}` }
            );
          }
        })
        .catch(() => {});
    }

    return Response.json({ ok: true });
  }

  if (body.action === "reject") {
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) return Response.json({ error: "Ingresá un motivo de rechazo." }, { status: 400 });

    await vehicleRef.update({ status: "rejected", published: false, rejectedAt: new Date(), rejectionReason: reason });

    if (ownerId) {
      await adminDb
        .collection(`users/${ownerId}/system_notifications`)
        .doc()
        .set({
          type: "vehicle_rejected",
          vehicleId: id,
          brand: vehicleData.brand || null,
          model: vehicleData.model || null,
          year: vehicleData.year || null,
          rejectionReason: reason || null,
          createdAt: new Date(),
          read: false,
        });

      sendNotificationEmail("moderation_rejected", {
        recipientUid: ownerId,
        senderName: "MatchCars",
        subject: "Tu publicación fue rechazada para corrección",
        carModel,
        messagePreview: reason || undefined,
      }).catch(() => {});

      adminDb
        .doc(`users/${ownerId}`)
        .get()
        .then((ownerSnap) => {
          const pushToken = ownerSnap.data()?.pushToken;
          if (pushToken) {
            sendPushNotification(
              pushToken,
              "Tu publicación fue rechazada",
              `${carModel || "Tu auto"} necesita algunos cambios antes de publicarse.`,
              { url: `matchcars://car/${id}` }
            );
          }
        })
        .catch(() => {});
    }

    return Response.json({ ok: true });
  }

  if (body.action === "delete") {
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) return Response.json({ error: "Ingresá un motivo de eliminación." }, { status: 400 });

    const result = await deleteVehicleAsAdmin(id, reason);
    if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Acción inválida" }, { status: 400 });
});
