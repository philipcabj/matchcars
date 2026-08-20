// marketplace/src/app/api/confirm-delivery/route.ts
// POST -> confirma la entrega de un auto vendido (mismo efecto que
// handleConfirmReceived del chat en la app) + puntúa al vendedor
// (obligatorio, ver lib/ratings-server.ts) — pensado para el QR que la
// agencia le muestra al comprador en el momento físico de la entrega. No
// requiere que el comprador esté logueado: la autorización es el token
// que viaja en el link del QR (deliveryConfirmToken, generado al marcar
// "entregado" en el portal — ver mark_vehicle_sold en
// portal/src/app/api/agency/leads/[id]/route.ts), no una sesión propia.
//
// Escribir confirmedByBuyer:true acá dispara igual la Cloud Function
// onSaleConfirmed (functions/src/index.ts) que crea las tareas de
// Postventa — es un trigger de Firestore, no depende de qué SDK/app hizo
// el write.
import { adminDb } from "@/lib/firebase-admin";
import { loadDeliveryConfirmation } from "@/lib/delivery-confirmation";
import { submitSellerRatingServer } from "@/lib/ratings-server";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";

// GET -> mismos datos que consume la página web (SSR), pero como JSON — lo
// usa la pantalla nativa de la app (app/(screens)/confirmar-entrega/[vehicleId].tsx)
// al abrir el mismo link vía universal link/App Link, ya que ese lado no
// puede leer Firestore directo sin auth (el token del link es la única
// autorización, no una sesión propia).
export async function GET(request: NextRequest) {
  const vehicleId = request.nextUrl.searchParams.get("vehicleId") || "";
  const token = request.nextUrl.searchParams.get("token") || "";
  if (!vehicleId) return Response.json({ error: "Falta el auto." }, { status: 400 });
  const result = await loadDeliveryConfirmation(vehicleId, token);
  return Response.json(result);
}

export async function POST(request: NextRequest) {
  let body: { vehicleId?: string; token?: string; score?: number; comment?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const vehicleId = String(body.vehicleId || "");
  const token = String(body.token || "");
  const score = Number(body.score);
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";

  if (!vehicleId || !token) return Response.json({ error: "Falta el auto o el código de confirmación." }, { status: 400 });
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return Response.json({ error: "Elegí una puntuación de 1 a 5 estrellas." }, { status: 400 });
  }

  const saleRef = adminDb.doc(`sales/${vehicleId}`);
  const saleSnap = await saleRef.get();
  if (!saleSnap.exists) return Response.json({ error: "No encontramos esta venta." }, { status: 404 });
  const sale = saleSnap.data()!;

  if (sale.confirmedByBuyer === true) {
    return Response.json({ error: "Esta entrega ya fue confirmada anteriormente." }, { status: 400 });
  }
  if (!sale.deliveryConfirmToken || sale.deliveryConfirmToken !== token) {
    return Response.json({ error: "Código de confirmación inválido o vencido." }, { status: 403 });
  }
  if (!sale.buyerId) {
    return Response.json({ error: "Esta venta no tiene un comprador con cuenta en MatchCars." }, { status: 400 });
  }

  const vehicleRef = adminDb.doc(`vehicles/${vehicleId}`);
  await adminDb.runTransaction(async (t) => {
    const vehicleSnap = await t.get(vehicleRef);
    if (!vehicleSnap.exists) throw new Error("El auto ya no existe.");
    t.update(vehicleRef, { status: "sold" });
    t.update(saleRef, { confirmedByBuyer: true, confirmedAt: FieldValue.serverTimestamp() });
  });

  const buyerSnap = await adminDb.doc(`users/${sale.buyerId}`).get();
  const buyerData = buyerSnap.data() ?? {};
  const reviewerName =
    `${buyerData.firstName ?? ""} ${buyerData.lastName ?? ""}`.trim() || buyerData.displayName || buyerData.email || "Comprador";

  await submitSellerRatingServer({
    vehicleId,
    sellerId: sale.sellerId,
    reviewerId: sale.buyerId,
    reviewerName,
    vehicleBrand: sale.vehicleSnapshot?.brand ?? null,
    vehicleModel: sale.vehicleSnapshot?.model ?? null,
    score,
    comment,
  });

  return Response.json({ ok: true });
}
