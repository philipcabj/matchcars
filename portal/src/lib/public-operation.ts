// portal/src/lib/public-operation.ts
// Resuelve una saleOperation por su buyerAccessToken — usado por las rutas
// públicas de portal/src/app/api/public/operations/[token]/**, que no
// tienen ningún uid autenticado (el comprador puede no tener cuenta en
// MatchCars). Un solo lugar para no repetir la query en cada ruta.
import "server-only";

import { adminDb } from "@/lib/firebase-admin";

export async function loadOperationByToken(
  token: string
): Promise<{ ref: FirebaseFirestore.DocumentReference; snap: FirebaseFirestore.QueryDocumentSnapshot } | null> {
  if (!token) return null;
  const snap = await adminDb.collection("saleOperations").where("buyerAccessToken", "==", token).limit(1).get();
  if (snap.empty) return null;
  return { ref: snap.docs[0].ref, snap: snap.docs[0] };
}
