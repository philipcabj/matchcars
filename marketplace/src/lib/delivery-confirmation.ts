// marketplace/src/lib/delivery-confirmation.ts
// Validación + datos para mostrar en la confirmación de entrega — usado
// tanto por la página web (confirmar-entrega/[vehicleId]/page.tsx, SSR)
// como por el GET de /api/confirm-delivery (que consume la pantalla nativa
// de la app al abrir el mismo link vía universal link/App Link).
import "server-only";

import { adminDb } from "@/lib/firebase-admin";

export type DeliveryConfirmationState =
  | { state: "not_found" }
  | { state: "invalid_token" }
  | { state: "already_confirmed" }
  | { state: "ready"; vehicle: Record<string, unknown>; sellerName: string };

export async function loadDeliveryConfirmation(vehicleId: string, token: string): Promise<DeliveryConfirmationState> {
  const saleSnap = await adminDb.doc(`sales/${vehicleId}`).get();
  if (!saleSnap.exists) return { state: "not_found" };
  const sale = saleSnap.data()!;

  if (sale.confirmedByBuyer === true) return { state: "already_confirmed" };
  if (!sale.deliveryConfirmToken || sale.deliveryConfirmToken !== token) return { state: "invalid_token" };

  const [vehicleSnap, sellerSnap] = await Promise.all([
    adminDb.doc(`vehicles/${vehicleId}`).get(),
    sale.sellerId ? adminDb.doc(`users/${sale.sellerId}`).get() : Promise.resolve(null),
  ]);
  const vehicle = vehicleSnap.exists ? vehicleSnap.data()! : sale.vehicleSnapshot ?? {};
  const sellerData = sellerSnap?.exists ? sellerSnap.data()! : {};
  const sellerName =
    sellerData.agencyName || sellerData.displayName || `${sellerData.firstName ?? ""} ${sellerData.lastName ?? ""}`.trim() || "el vendedor";

  return { state: "ready", vehicle, sellerName };
}
