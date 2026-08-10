// marketplace/src/lib/catalog.ts
// Catálogo dinámico de marca/modelo (Firestore catalog/default/makes/**),
// mismo que ya lee la app (add-car.tsx) y el portal (portal/src/lib/catalog.ts,
// versión cliente) — acá Admin SDK porque el marketplace no tiene SDK de
// cliente de Firebase.
import "server-only";

import { adminDb } from "@/lib/firebase-admin";

export async function getCatalogMakes(): Promise<string[]> {
  const snap = await adminDb.collection("catalog/default/makes").get();
  const names: string[] = [];
  snap.forEach((d) => {
    const name = (d.data() as { name?: string })?.name || d.id;
    if (name) names.push(name);
  });
  return names.sort();
}

export async function getCatalogModels(make: string): Promise<string[]> {
  if (!make) return [];
  const snap = await adminDb.collection(`catalog/default/makes/${make}/models`).get();
  const names: string[] = [];
  snap.forEach((d) => {
    const name = (d.data() as { name?: string })?.name || d.id;
    if (name) names.push(name);
  });
  return names.sort();
}
