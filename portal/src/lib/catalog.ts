// portal/src/lib/catalog.ts
// Catálogo dinámico de marca/modelo/versión (Firestore catalog/default/makes/**),
// mismo que ya usa loadMakes/loadModels en app/(screens)/add-car.tsx — lectura
// pública (firestore.rules: catalog allow read: if true), así que se lee
// directo con el SDK de cliente, sin pasar por el backend del portal.
"use client";

import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase-client";

export async function loadCatalogMakes(): Promise<string[]> {
  try {
    const snap = await getDocs(collection(db, "catalog", "default", "makes"));
    const names: string[] = [];
    snap.forEach((d) => {
      const name = (d.data() as { name?: string })?.name || d.id;
      if (name) names.push(name);
    });
    return names.sort();
  } catch {
    return [];
  }
}

export async function loadCatalogModels(make: string): Promise<{ name: string; versions: string[] }[]> {
  if (!make) return [];
  try {
    const snap = await getDocs(collection(db, "catalog", "default", "makes", make, "models"));
    const models: { name: string; versions: string[] }[] = [];
    snap.forEach((d) => {
      const data = d.data() as { name?: string; versions?: string[] };
      const name = data?.name || d.id;
      if (name) models.push({ name, versions: Array.isArray(data.versions) ? data.versions : [] });
    });
    return models.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
