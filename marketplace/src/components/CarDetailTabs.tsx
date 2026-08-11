"use client";

import { StarRating } from "@/components/StarRating";
import type { PublicVehicle, Review } from "@/lib/vehicles";
import { useState } from "react";

// Mismas 3 secciones que la ficha de la app (resumen/ficha técnica/
// financiación) — se dejó afuera la pestaña de fotos/video de la app porque
// acá la galería ya está siempre visible arriba, no tiene sentido duplicarla.
type Tab = "resumen" | "ficha" | "financiacion";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <p className="text-sm font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2 border-b border-border/60 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function CarDetailTabs({ vehicle, reviews }: { vehicle: PublicVehicle; reviews: Review[] }) {
  const hasFinancing = vehicle.acceptsFinancing && !!vehicle.financing;
  const tabs: { key: Tab; label: string }[] = [
    { key: "resumen", label: "Resumen" },
    { key: "ficha", label: "Ficha técnica" },
    ...(hasFinancing ? [{ key: "financiacion" as Tab, label: "Financiación" }] : []),
  ];
  const [active, setActive] = useState<Tab>("resumen");

  const hasCharacteristics =
    vehicle.serviceRecords || vehicle.vtvValid || vehicle.papersUpToDate || vehicle.warranty || vehicle.negotiablePrice || vehicle.immediateDelivery;
  const hasReviewsSection = vehicle.sellerReviewCount > 0 || reviews.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              active === t.key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === "resumen" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Kilómetros" value={vehicle.km ? `${vehicle.km.toLocaleString("es-AR")} km` : "—"} />
            <StatTile label="Combustible" value={vehicle.fuelType || "—"} />
            <StatTile label="Caja" value={vehicle.gearbox || "—"} />
            <StatTile label="Dueño único" value={vehicle.singleOwner ? "Sí" : "—"} />
          </div>

          {vehicle.description && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-1 text-sm font-semibold">Descripción</p>
              <p className="whitespace-pre-line text-sm text-foreground">{vehicle.description}</p>
            </div>
          )}

          {hasCharacteristics && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-2 text-sm font-semibold">Características</p>
              <div className="flex flex-wrap gap-2">
                {vehicle.serviceRecords && <span className="rounded-full bg-background px-3 py-1 text-xs">✓ Service oficial al día</span>}
                {vehicle.vtvValid && <span className="rounded-full bg-background px-3 py-1 text-xs">✓ VTV vigente</span>}
                {vehicle.papersUpToDate && <span className="rounded-full bg-background px-3 py-1 text-xs">✓ Papeles al día</span>}
                {vehicle.warranty && <span className="rounded-full bg-background px-3 py-1 text-xs">✓ Con garantía</span>}
                {vehicle.negotiablePrice && <span className="rounded-full bg-background px-3 py-1 text-xs">✓ Precio conversable</span>}
                {vehicle.immediateDelivery && <span className="rounded-full bg-background px-3 py-1 text-xs">✓ Entrega inmediata</span>}
              </div>
            </div>
          )}

          {vehicle.priceHistory.length > 1 && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-2 text-sm font-semibold">Historial de precio</p>
              <div className="flex flex-col gap-1">
                {vehicle.priceHistory.map((h, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{h.changedAt ? new Date(h.changedAt).toLocaleDateString("es-AR") : "—"}</span>
                    <span className="font-semibold">
                      {h.currency} {Number(h.price).toLocaleString("es-AR")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasReviewsSection && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Reseñas del vendedor</p>
                {vehicle.sellerRating > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <StarRating rating={vehicle.sellerRating} />
                    <span>
                      {vehicle.sellerRating.toFixed(1)} ({vehicle.sellerReviewCount})
                    </span>
                  </div>
                )}
              </div>
              {reviews.length === 0 ? (
                <p className="text-xs text-muted-foreground">Todavía no hay reseñas.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {reviews.map((r) => (
                    <div key={r.id} className="border-b border-border/60 pb-2 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{r.reviewerName}</p>
                        <StarRating rating={r.rating} />
                      </div>
                      {r.comment && <p className="mt-0.5 text-sm text-muted-foreground">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {active === "ficha" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="mb-2 text-sm font-semibold">Ficha técnica</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <SpecRow label="Marca" value={vehicle.brand} />
              <SpecRow label="Modelo" value={vehicle.model} />
              <SpecRow label="Versión" value={vehicle.version} />
              <SpecRow label="Año" value={vehicle.year ? String(vehicle.year) : ""} />
              <SpecRow label="Motor" value={vehicle.engine} />
              <SpecRow label="Combustible" value={vehicle.fuelType} />
              <SpecRow label="Caja" value={vehicle.gearbox} />
              <SpecRow label="Tracción" value={vehicle.wheelType} />
              <SpecRow label="Airbags" value={vehicle.airbags} />
              <SpecRow label="Levantavidrios" value={vehicle.windowsAuto} />
              <SpecRow label="Tipo de operación" value={vehicle.operationType === "swap" ? "Permuta" : "Venta"} />
              <SpecRow label="Motivo de venta" value={vehicle.sellingReason} />
            </div>
          </div>

          {vehicle.features.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-2 text-sm font-semibold">Equipamiento</p>
              <div className="flex flex-wrap gap-2">
                {vehicle.features.map((f) => (
                  <span key={f} className="rounded-full bg-background px-3 py-1 text-xs">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {active === "financiacion" && vehicle.financing && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-2 text-sm font-semibold">Financiación</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            {vehicle.financing.entity && <SpecRow label="Entidad" value={vehicle.financing.entity} />}
            {vehicle.financing.type && (
              <SpecRow
                label="Tipo"
                value={vehicle.financing.type === "sin_interes" ? "Sin interés" : vehicle.financing.type === "banco" ? "Bancaria" : "Propia"}
              />
            )}
            {!!vehicle.financing.downPayment && (
              <SpecRow label="Anticipo" value={`${vehicle.currency} ${vehicle.financing.downPayment.toLocaleString("es-AR")}`} />
            )}
            {!!vehicle.financing.monthlyPayment && (
              <SpecRow label="Cuota estimada" value={`${vehicle.currency} ${vehicle.financing.monthlyPayment.toLocaleString("es-AR")}`} />
            )}
            {!!vehicle.financing.months && <SpecRow label="Plazo" value={`${vehicle.financing.months} meses`} />}
            {!!vehicle.financing.rate && <SpecRow label="Tasa" value={`${vehicle.financing.rate}%`} />}
          </div>
        </div>
      )}
    </div>
  );
}
