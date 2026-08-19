// lib/ratings.ts
// Único camino para que un comprador puntúe al vendedor de una venta —
// antes había dos implementaciones independientes que divergieron: la de
// Perfil > Mis Compras (app/profile.tsx) sí escribía en `reviews` y
// actualizaba sellerRating/sellerReviewCount (lo único que se lee en toda
// la app para mostrar la calificación), pero la de justo después de
// confirmar la entrega en el chat (app/(screens)/chat/[uid].tsx) escribía
// en ratingSum/ratingCount, campos que ningún lado de la app lee — la
// puntuación se guardaba y no se veía en ningún lado. Se consolida acá para
// que no vuelvan a divergir.
import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";

export interface SubmitSellerRatingParams {
  vehicleId: string;
  sellerId: string;
  reviewerId: string;
  reviewerName: string;
  reviewerPhotoUrl: string | null;
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  score: number;
  comment: string;
}

export async function submitSellerRating(params: SubmitSellerRatingParams): Promise<void> {
  const { vehicleId, sellerId, reviewerId, reviewerName, reviewerPhotoUrl, vehicleBrand, vehicleModel, score, comment } = params;

  await updateDoc(doc(db, "sales", vehicleId), {
    ratingByBuyer: { score, comment: comment || null, ratedAt: serverTimestamp(), ratedByUid: reviewerId },
    rating: score,
    review: comment || null,
  });

  try {
    await addDoc(collection(db, "reviews"), {
      sellerId,
      reviewerId,
      reviewerName,
      reviewerPhotoUrl,
      vehicleId,
      vehicleBrand: vehicleBrand ?? null,
      vehicleModel: vehicleModel ?? null,
      rating: score,
      review: comment || null,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    logger.log("Error saving review to reviews collection", e);
  }

  // Promedio recalculado desde todas las ventas del vendedor (mismo criterio
  // que ya usaba profile.tsx) — no un contador incremental, para que quede
  // consistente aunque una calificación se edite o la venta que se acaba de
  // puntuar todavía no esté en el resultado de la query por lag de índice.
  try {
    const salesSnap = await getDocs(query(collection(db, "sales"), where("sellerId", "==", sellerId)));
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
      await updateDoc(doc(db, "users", sellerId), { sellerRating: avg, sellerReviewCount: count });
      try {
        const vehiclesSnap = await getDocs(query(collection(db, "vehicles"), where("userId", "==", sellerId)));
        for (const v of vehiclesSnap.docs) {
          await updateDoc(doc(db, "vehicles", v.id), { sellerRating: avg, sellerReviewCount: count });
        }
      } catch (syncError) {
        logger.log("Error syncing seller rating to vehicles", syncError);
      }
    }
  } catch (e) {
    logger.log("Error updating seller rating", e);
  }
}
