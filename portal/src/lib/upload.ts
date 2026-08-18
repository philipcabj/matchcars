// portal/src/lib/upload.ts
// Sube directo a Firebase Storage desde el cliente (igual que la app). Usa las
// mismas rutas que ya permiten las storage.rules existentes (uploads/{uid}/...),
// así no hizo falta tocar storage.rules.
"use client";

import { storage } from "@/lib/firebase-client";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

export async function uploadVehiclePhoto(userId: string, file: File): Promise<string> {
  const filename = `${Date.now()}_${Math.floor(Math.random() * 1e6)}.jpg`;
  const storageRef = ref(storage, `uploads/${userId}/${filename}`);
  await uploadBytes(storageRef, file, { contentType: file.type || "image/jpeg" });
  return getDownloadURL(storageRef);
}

export async function uploadVehicleVideo(userId: string, file: File): Promise<string> {
  const filename = `${Date.now()}_video.mp4`;
  const storageRef = ref(storage, `uploads/${userId}/videos/${filename}`);
  await uploadBytes(storageRef, file, { contentType: file.type || "video/mp4" });
  return getDownloadURL(storageRef);
}

// Mismo path que ya usa edit-profile.tsx de la app (`logos/${uid}_${ts}.png`).
// A propósito NO va bajo uploads/{userId}/... — ese path dispara la Cloud
// Function autoEnhancePhoto (auto-mejora + watermark), que no tiene sentido
// aplicarle al logo mismo.
export async function uploadAgencyLogo(userId: string, file: File): Promise<string> {
  const storageRef = ref(storage, `logos/${userId}_${Date.now()}.png`);
  await uploadBytes(storageRef, file, { contentType: file.type || "image/png" });
  return getDownloadURL(storageRef);
}

// Mismo path que ya usa edit-profile.tsx de la app (`banners/${uid}_${ts}.jpg`).
export async function uploadAgencyBanner(userId: string, file: File): Promise<string> {
  const storageRef = ref(storage, `banners/${userId}_${Date.now()}.jpg`);
  await uploadBytes(storageRef, file, { contentType: file.type || "image/jpeg" });
  return getDownloadURL(storageRef);
}

// Documentos de una operación de venta (Módulo A) — bajo uploads/{userId}/...
// como el resto, así no hace falta tocar storage.rules (cae en el mismo
// catch-all que ya usa uploadVehicleVideo para paths anidados).
export async function uploadOperationDocument(userId: string, operationId: string, file: File): Promise<string> {
  const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const storageRef = ref(storage, `uploads/${userId}/operations/${operationId}/${filename}`);
  await uploadBytes(storageRef, file, { contentType: file.type || "application/octet-stream" });
  return getDownloadURL(storageRef);
}

// Fotos del auto recibido como parte de pago.
export async function uploadTradeInPhoto(userId: string, operationId: string, file: File): Promise<string> {
  const filename = `${Date.now()}_${Math.floor(Math.random() * 1e6)}.jpg`;
  const storageRef = ref(storage, `uploads/${userId}/operations/${operationId}/tradein/${filename}`);
  await uploadBytes(storageRef, file, { contentType: file.type || "image/jpeg" });
  return getDownloadURL(storageRef);
}
