// marketplace/src/lib/ratings-server.ts
// Gemelo server-side (Admin SDK) de lib/ratings.ts en la raíz del repo (app
// Expo) — mismo criterio ahí documentado: escribe en `reviews` y recalcula
// users.sellerRating/sellerReviewCount, que es lo único que lee toda la app
// para mostrar la calificación. No se puede compartir el archivo tal cual
// porque son SDKs distintos (cliente vs. Admin), pero la lógica tiene que
// ser la misma a propósito — separarla fue justo lo que causó que la
// calificación desde el chat quedara rota (ver commit de esa sesión).
import "server-only";

import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export interface SubmitSellerRatingServerParams {
  vehicleId: string;
  sellerId: string;
  reviewerId: string;
  reviewerName: string;
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  score: number;
  comment: string;
}

export async function submitSellerRatingServer(params: SubmitSellerRatingServerParams): Promise<void> {
  const { vehicleId, sellerId, reviewerId, reviewerName, vehicleBrand, vehicleModel, score, comment } = params;

  await adminDb.doc(`sales/${vehicleId}`).update({
    ratingByBuyer: { score, comment: comment || null, ratedAt: FieldValue.serverTimestamp(), ratedByUid: reviewerId },
    rating: score,
    review: comment || null,
  });

  await adminDb.collection("reviews").add({
    sellerId,
    reviewerId,
    reviewerName,
    reviewerPhotoUrl: null,
    vehicleId,
    vehicleBrand: vehicleBrand ?? null,
    vehicleModel: vehicleModel ?? null,
    rating: score,
    review: comment || null,
    createdAt: FieldValue.serverTimestamp(),
  });

  // Promedio recalculado desde todas las ventas del vendedor — mismo
  // criterio que la versión cliente, no un contador incremental.
  const salesSnap = await adminDb.collection("sales").where("sellerId", "==", sellerId).get();
  let total = 0;
  let count = 0;
  for (const d of salesSnap.docs) {
    const data = d.data();
    const r = d.id === vehicleId ? score : Number(data.rating);
    if (!isNaN(r) && r > 0) {
      total += r;
      count++;
    }
  }
  if (count > 0) {
    const avg = total / count;
    await adminDb.doc(`users/${sellerId}`).update({ sellerRating: avg, sellerReviewCount: count });
    const vehiclesSnap = await adminDb.collection("vehicles").where("userId", "==", sellerId).get();
    const batch = adminDb.batch();
    for (const v of vehiclesSnap.docs) {
      batch.update(v.ref, { sellerRating: avg, sellerReviewCount: count });
    }
    await batch.commit();
  }
}
