// portal/src/lib/admin-vehicle-actions.ts
// Lógica compartida de "eliminar publicación como admin" — usada tanto por
// el PATCH individual (/api/admin/vehicles/[id]) como por el borrado masivo
// (/api/admin/vehicles/bulk-delete), para no duplicar el soft-delete + las
// notificaciones en dos lugares.
import "server-only";

import { logActivity } from "@/lib/activity-log";
import { adminDb } from "@/lib/firebase-admin";
import { sendNotificationEmail } from "@/lib/notify-mail";
import { sendPushNotification } from "@/lib/notify-push";

export async function deleteVehicleAsAdmin(id: string, reason: string, actorUid: string): Promise<{ ok: boolean; error?: string }> {
  const vehicleRef = adminDb.doc(`vehicles/${id}`);
  const vehicleSnap = await vehicleRef.get();
  if (!vehicleSnap.exists) return { ok: false, error: "Vehículo no encontrado" };

  const vehicleData = vehicleSnap.data()!;
  const carModel = [vehicleData.brand, vehicleData.model, vehicleData.year].filter(Boolean).join(" ");
  const ownerId: string | undefined = vehicleData.userId;

  await vehicleRef.update({ status: "deleted", published: false, deletedAt: new Date(), rejectionReason: reason });

  if (ownerId) {
    await logActivity({
      agencyId: ownerId,
      actorUid,
      entityType: "vehicle",
      entityId: id,
      summary: `Publicación eliminada por administración (${carModel || id}): ${reason}`,
    });
  }

  if (ownerId) {
    await adminDb
      .collection(`users/${ownerId}/system_notifications`)
      .doc()
      .set({
        type: "vehicle_deleted_by_admin",
        vehicleId: id,
        brand: vehicleData.brand || null,
        model: vehicleData.model || null,
        year: vehicleData.year || null,
        rejectionReason: reason,
        createdAt: new Date(),
        read: false,
      });

    sendNotificationEmail("vehicle_deleted_by_admin", {
      recipientUid: ownerId,
      senderName: "MatchCars",
      subject: "Tu publicación fue eliminada",
      carModel,
      messagePreview: reason,
    }).catch(() => {});

    adminDb
      .doc(`users/${ownerId}`)
      .get()
      .then((ownerSnap) => {
        const pushToken = ownerSnap.data()?.pushToken;
        if (pushToken) {
          sendPushNotification(pushToken, "Tu publicación fue eliminada", `${carModel || "Tu auto"} fue eliminado por MatchCars.`, {
            url: `matchcars://mycars`,
          });
        }
      })
      .catch(() => {});
  }

  return { ok: true };
}
