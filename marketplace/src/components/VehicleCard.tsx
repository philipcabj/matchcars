"use client";

import { CompareCheckbox } from "@/components/CompareCheckbox";
import { useCompare } from "@/contexts/CompareContext";
import { PublicVehicle } from "@/lib/vehicles";
import Image from "next/image";
import Link from "next/link";

export function VehicleCard({ vehicle }: { vehicle: PublicVehicle }) {
  const { isSelected } = useCompare();
  const selected = isSelected(vehicle.id);

  return (
    <Link
      href={`/car/${vehicle.id}`}
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-card transition hover:-translate-y-0.5 hover:shadow-lg ${
        selected ? "border-primary ring-2 ring-primary" : "border-border"
      }`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-background">
        {vehicle.coverImage ? (
          <Image
            src={vehicle.coverImage}
            alt={`${vehicle.brand} ${vehicle.model}`}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 100vw"
            className="object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sin foto</div>
        )}
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {vehicle.isFeatured && (
            <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground shadow">Destacado</span>
          )}
          {vehicle.sellerIsDealer && (
            <span className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground shadow">
              ✓ Agencia verificada
            </span>
          )}
        </div>
        {vehicle.sellerIsDealer && vehicle.sellerLogoUrl && (
          <div className="absolute bottom-3 left-3 h-9 w-9 overflow-hidden rounded-full border-2 border-white bg-card shadow">
            <Image src={vehicle.sellerLogoUrl} alt="" fill sizes="36px" className="object-cover" />
          </div>
        )}
        <CompareCheckbox vehicleId={vehicle.id} className="absolute right-3 top-3 bg-card/95 shadow" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="truncate text-sm font-semibold text-foreground">
          {vehicle.brand} {vehicle.model} {vehicle.version}
        </p>
        <p className="text-xs text-muted-foreground">
          {vehicle.year || "—"} · {vehicle.km ? `${vehicle.km.toLocaleString("es-AR")} km` : "0 km"}
        </p>
        <p className="mt-1 text-lg font-extrabold text-accent">
          {vehicle.currency} {vehicle.price.toLocaleString("es-AR")}
        </p>
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">
            {[vehicle.city, vehicle.province].filter(Boolean).join(", ") || "Ubicación no informada"}
          </p>
          {vehicle.sellerRating > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-muted-foreground">
              ★ {vehicle.sellerRating.toFixed(1)}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {vehicle.acceptsFinancing && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Financiación</span>
          )}
          {vehicle.acceptsTradeIn && (
            <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Acepta permuta</span>
          )}
        </div>
      </div>
    </Link>
  );
}
