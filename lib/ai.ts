// lib/ai.ts
// Antes llamaba directo a Firebase AI Logic (firebase/vertexai) desde el
// cliente. Google exige App Check obligatorio para eso a partir del
// 2026-11-02 (hubiera implicado sumar un módulo nativo de attestation solo
// para esto), así que se migró a Cloud Functions con la API key propia de
// Gemini — ver functions/src/index.ts (detectVehicleFeature). Firma pública
// de detectLicensePlate/detectCar sin cambios para no tocar los call sites.
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebase";
import { logger } from "./logger";

export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export type AIResult = {
  success: boolean;
  box?: BoundingBox;
  error?: string;
};

async function callDetectVehicleFeature(base64Image: string, feature: "plate" | "car"): Promise<AIResult> {
  try {
    const fns = getFunctions(app);
    const detect = httpsCallable<{ base64Image: string; feature: "plate" | "car" }, AIResult>(
      fns,
      "detectVehicleFeature"
    );
    const res = await detect({ base64Image, feature });
    logger.log(`AI Response (${feature}):`, res.data);
    return res.data;
  } catch (error: any) {
    console.error(`Error detecting ${feature}:`, error);
    return { success: false, error: error?.message || "Unknown AI error" };
  }
}

/**
 * Detects the license plate in an image using Gemini (vía Cloud Function).
 */
export async function detectLicensePlate(base64Image: string): Promise<AIResult> {
  return callDetectVehicleFeature(base64Image, "plate");
}

/**
 * Detects the car in an image using Gemini (vía Cloud Function).
 */
export async function detectCar(base64Image: string): Promise<AIResult> {
  return callDetectVehicleFeature(base64Image, "car");
}
