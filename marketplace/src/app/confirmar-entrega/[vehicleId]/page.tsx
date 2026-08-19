// marketplace/src/app/confirmar-entrega/[vehicleId]/page.tsx
// Página pública a la que apunta el QR que la agencia le muestra al
// comprador en el momento físico de la entrega (ver botón en
// portal/src/app/dashboard/leads/[id]/page.tsx). No requiere login propio
// — la autorización es el token del link, no una sesión. El comprador
// confirma que recibió el auto y puntúa al vendedor (obligatorio) desde
// acá; el POST real vive en /api/confirm-delivery.
import { adminDb } from "@/lib/firebase-admin";
import type { Metadata } from "next";
import { ConfirmDeliveryForm } from "./ConfirmDeliveryForm";

export const metadata: Metadata = { title: "Confirmar entrega" };

async function loadSale(vehicleId: string, token: string) {
  const saleSnap = await adminDb.doc(`sales/${vehicleId}`).get();
  if (!saleSnap.exists) return { state: "not_found" as const };
  const sale = saleSnap.data()!;

  if (sale.confirmedByBuyer === true) return { state: "already_confirmed" as const, sale };
  if (!sale.deliveryConfirmToken || sale.deliveryConfirmToken !== token) return { state: "invalid_token" as const };

  const [vehicleSnap, sellerSnap] = await Promise.all([
    adminDb.doc(`vehicles/${vehicleId}`).get(),
    sale.sellerId ? adminDb.doc(`users/${sale.sellerId}`).get() : Promise.resolve(null),
  ]);
  const vehicle = vehicleSnap.exists ? vehicleSnap.data()! : sale.vehicleSnapshot ?? {};
  const sellerData = sellerSnap?.exists ? sellerSnap.data()! : {};
  const sellerName = sellerData.agencyName || sellerData.displayName || `${sellerData.firstName ?? ""} ${sellerData.lastName ?? ""}`.trim() || "el vendedor";

  return { state: "ready" as const, vehicle, sellerName };
}

export default async function ConfirmarEntregaPage({
  params,
  searchParams,
}: {
  params: Promise<{ vehicleId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { vehicleId } = await params;
  const { token } = await searchParams;
  const result = await loadSale(vehicleId, token ?? "");

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-10">
      {result.state === "not_found" && (
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm font-semibold">No encontramos esta venta.</p>
          <p className="mt-1 text-sm text-muted-foreground">Verificá el link o pedile a la agencia que te muestre el QR de nuevo.</p>
        </div>
      )}

      {result.state === "invalid_token" && (
        <div className="rounded-2xl border border-error/40 bg-error/5 p-6 text-center">
          <p className="text-sm font-semibold text-error">Este link no es válido.</p>
          <p className="mt-1 text-sm text-muted-foreground">Pedile a la agencia que te muestre el código de confirmación de nuevo.</p>
        </div>
      )}

      {result.state === "already_confirmed" && (
        <div className="rounded-2xl border border-success/40 bg-success/5 p-6 text-center">
          <p className="text-sm font-semibold text-success">✓ Esta entrega ya fue confirmada.</p>
          <p className="mt-1 text-sm text-muted-foreground">Gracias — ¡disfrutá tu auto!</p>
        </div>
      )}

      {result.state === "ready" && (
        <>
          <div className="rounded-2xl border border-border bg-card p-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Confirmar entrega</p>
            <h1 className="mt-1 text-lg font-bold">
              {result.vehicle.brand} {result.vehicle.model} {result.vehicle.year ?? ""}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              ¿Confirmás que recibiste este auto de {result.sellerName}?
            </p>
          </div>
          <ConfirmDeliveryForm vehicleId={vehicleId} token={token ?? ""} />
        </>
      )}
    </main>
  );
}
