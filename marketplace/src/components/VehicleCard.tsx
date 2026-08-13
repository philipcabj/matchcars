"use client";

import { CompareCheckbox } from "@/components/CompareCheckbox";
import { useCompare } from "@/contexts/CompareContext";
import { PublicVehicle } from "@/lib/vehicles";
import Image from "next/image";
import Link from "next/link";

// `sold`: para la tab "Vendidos" de la ficha de agencia — esos autos ya no
// tienen ficha propia navegable (getVehicle() en el server devuelve null
// para status "sold", así que /car/{id} daría 404), por eso acá se renderiza
// como div en vez de Link, con un ribbon "Vendido" y menos énfasis visual.
export function VehicleCard({ vehicle, sold = false }: { vehicle: PublicVehicle; sold?: boolean }) {
  const { isSelected } = useCompare();
  const selected = isSelected(vehicle.id);

  const className = `group flex flex-col overflow-hidden rounded-2xl border bg-card transition ${
    sold ? "opacity-70" : "hover:-translate-y-0.5 hover:shadow-lg"
  } ${selected ? "border-primary ring-2 ring-primary" : "border-border"}`;

  const content = (
    <>
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-background">
        {vehicle.coverImage ? (
          <Image
            src={vehicle.coverImage}
            alt={`${vehicle.brand} ${vehicle.model}`}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 100vw"
            className={`object-cover transition duration-300 ${sold ? "grayscale" : "group-hover:scale-105"}`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sin foto</div>
        )}
        {sold && (
          <span className="absolute left-3 top-3 rounded-full bg-foreground px-2.5 py-1 text-xs font-bold text-background shadow">Vendido</span>
        )}
        {!sold && vehicle.isFeatured && (
          <span className="absolute left-3 top-3 rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground shadow">
            Destacado
          </span>
        )}
        {vehicle.sellerIsDealer && vehicle.sellerLogoUrl && (
          <div className="absolute bottom-3 left-3 h-8 w-8 overflow-hidden rounded-full border-2 border-card bg-card shadow">
            <Image src={vehicle.sellerLogoUrl} alt="" fill sizes="32px" className="object-cover" />
          </div>
        )}
        {!sold && <CompareCheckbox vehicleId={vehicle.id} className="absolute right-3 top-3 bg-card/95 shadow" />}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="truncate text-sm font-semibold text-foreground">
          {vehicle.brand} {vehicle.model} {vehicle.version}
        </p>
        <p className="text-xs text-muted-foreground">
          {vehicle.year || "—"} · {vehicle.km ? `${vehicle.km.toLocaleString("es-AR")} km` : "0 km"}
          {vehicle.publicationCode && <span className="ml-1 font-mono opacity-70">· #{vehicle.publicationCode}</span>}
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
          {vehicle.sellerIsDealer && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">✓ Agencia verificada</span>
          )}
          {vehicle.acceptsFinancing && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Financiación</span>
          )}
          {vehicle.acceptsTradeIn && (
            <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Acepta permuta</span>
          )}
        </div>
      </div>
    </>
  );

  if (sold) return <div className={className}>{content}</div>;

  return (
    <Link href={`/car/${vehicle.id}`} className={className}>
      {content}
    </Link>
  );
}
