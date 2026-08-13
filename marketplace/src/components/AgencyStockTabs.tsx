"use client";

import { StarRating } from "@/components/StarRating";
import { VehicleCard } from "@/components/VehicleCard";
import type { PublicVehicle, Review } from "@/lib/vehicles";
import { useState } from "react";

// Antes los 3 números (Publicados/Vendidos/Reseñas) eran solo texto, sin
// conectar con nada de lo que había debajo — acá pasan a ser tabs reales
// que cambian qué lista se muestra, mismo patrón que CarDetailTabs.tsx.
type Tab = "publicados" | "vendidos" | "resenas";

export function AgencyStockTabs({
  activeVehicles,
  soldVehicles,
  reviews,
}: {
  activeVehicles: PublicVehicle[];
  soldVehicles: PublicVehicle[];
  reviews: Review[];
}) {
  const [active, setActive] = useState<Tab>("publicados");
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "publicados", label: "Publicados", count: activeVehicles.length },
    { key: "vendidos", label: "Vendidos", count: soldVehicles.length },
    { key: "resenas", label: "Reseñas", count: reviews.length },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl border px-3 py-3 text-center transition ${
              active === t.key ? "border-accent bg-accent/10" : "border-border bg-background hover:border-accent/50"
            }`}
          >
            <p className="text-xl font-extrabold text-accent">{t.count}</p>
            <p className="text-[11px] text-muted-foreground">{t.label}</p>
          </button>
        ))}
      </div>

      {active === "publicados" &&
        (activeVehicles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Esta agencia no tiene autos publicados en este momento.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {activeVehicles.map((v) => (
              <VehicleCard key={v.id} vehicle={v} />
            ))}
          </div>
        ))}

      {active === "vendidos" &&
        (soldVehicles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Todavía no hay autos vendidos registrados.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {soldVehicles.map((v) => (
              <VehicleCard key={v.id} vehicle={v} sold />
            ))}
          </div>
        ))}

      {active === "resenas" &&
        (reviews.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Todavía no hay reseñas.
          </p>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-4">
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
          </div>
        ))}
    </div>
  );
}
