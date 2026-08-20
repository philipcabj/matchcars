// marketplace/src/app/confirmar-entrega/[vehicleId]/page.tsx
// Página pública a la que apunta el QR que la agencia le muestra al
// comprador en el momento físico de la entrega (ver botón en
// portal/src/app/dashboard/leads/[id]/page.tsx). No requiere login propio
// — la autorización es el token del link, no una sesión. El comprador
// confirma que recibió el auto y puntúa al vendedor (obligatorio) desde
// acá; el POST real vive en /api/confirm-delivery.
import { loadDeliveryConfirmation } from "@/lib/delivery-confirmation";
import type { Metadata } from "next";
import { ConfirmDeliveryForm } from "./ConfirmDeliveryForm";

export const metadata: Metadata = { title: "Confirmar entrega" };

export default async function ConfirmarEntregaPage({
  params,
  searchParams,
}: {
  params: Promise<{ vehicleId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { vehicleId } = await params;
  const { token } = await searchParams;
  const result = await loadDeliveryConfirmation(vehicleId, token ?? "");

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
              {String(result.vehicle.brand ?? "")} {String(result.vehicle.model ?? "")} {String(result.vehicle.year ?? "")}
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
