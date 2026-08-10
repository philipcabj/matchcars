// portal/src/lib/catalog-server.ts
// Enriquecimiento del catálogo (catalog/default/makes/{make}/models/{model})
// al publicar/editar un vehículo — mismo catálogo que lee la app y el propio
// portal (lib/catalog.ts). La app intenta hacer esto mismo desde el cliente
// en app/(screens)/add-car.tsx, pero firestore.rules solo permite escribir
// `catalog` a staff (`allow write: if isStaff()`), así que ese write falla en
// silencio para cualquier vendedor común. Acá se hace con el Admin SDK
// (bypassea las reglas), así que funciona siempre.
import "server-only";

import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function ensureCatalogEntry(brand: string, model: string, version?: string | null) {
  try {
    const brandRef = adminDb.doc(`catalog/default/makes/${brand}`);
    await brandRef.set({ name: brand }, { merge: true });

    const modelRef = adminDb.doc(`catalog/default/makes/${brand}/models/${model}`);
    await modelRef.set({ name: model }, { merge: true });

    if (version) {
      await modelRef.set({ versions: FieldValue.arrayUnion(version) }, { merge: true });
    }
  } catch (e) {
    console.error("[catalog-server] No se pudo actualizar el catálogo:", e);
  }
}
