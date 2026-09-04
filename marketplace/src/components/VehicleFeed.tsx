import { VehicleCard } from "@/components/VehicleCard";
import type { PublicVehicle } from "@/lib/vehicles";
import Link from "next/link";

// Grilla + paginación, compartida entre la home (/) y las landings por faceta
// (/autos/{marca}/{modelo}). El caller arma los hrefs de página porque cada
// ruta pagina distinto (querystring en la home, path + querystring en facetas).
export function VehicleFeed({
  vehicles,
  page,
  totalPages,
  pageHref,
  emptyLabel = "No encontramos autos con esos filtros.",
}: {
  vehicles: PublicVehicle[];
  page: number;
  totalPages: number;
  pageHref: (page: number) => string;
  emptyLabel?: string;
}) {
  return (
    <>
      {vehicles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => (
            <VehicleCard key={v.id} vehicle={v} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="flex flex-wrap items-center justify-center gap-2 pt-4">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={pageHref(p)}
              aria-current={p === page ? "page" : undefined}
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold ${
                p === page ? "bg-accent text-accent-foreground" : "border border-border bg-card text-foreground"
              }`}
            >
              {p}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
