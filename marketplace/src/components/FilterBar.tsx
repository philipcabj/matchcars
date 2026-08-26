// Formulario GET simple, sin JS — el navegador arma la URL con los filtros
// (?brand=...&province=...) y Next.js la resuelve server-side en page.tsx.
// A propósito no es un client component: nada acá necesita interactividad.
//
// En mobile (<sm) los campos ocupan todo el ancho, apilados como un
// formulario prolijo; desde sm para arriba vuelve al layout original de una
// fila con wrap. Los pares año/precio usan `sm:contents` para que el div que
// los agrupa (necesario para que se vean lado a lado en mobile) desaparezca
// del layout en pantallas grandes, sin duplicar el resto del componente.
import Link from "next/link";

const FUEL_OPTIONS = ["Nafta", "Diésel", "Híbrido", "Eléctrico", "GNC"];

export function FilterBar({
  brands,
  provinces,
  cities,
  current,
}: {
  brands: string[];
  provinces: string[];
  // No encadenada a la provincia elegida (ver getFilterOptions en
  // lib/vehicles.ts) — lista plana de todas las ciudades/barrios con algún
  // auto publicado, sin importar la provincia.
  cities: string[];
  current: {
    brand?: string;
    province?: string;
    city?: string;
    fuelType?: string;
    minPrice?: string;
    maxPrice?: string;
    minYear?: string;
    maxYear?: string;
    financing?: string;
    tradeIn?: string;
  };
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
      <label className="flex w-full flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-auto">
        Marca
        <select
          name="brand"
          defaultValue={current.brand ?? ""}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground sm:w-auto"
        >
          <option value="">Todas</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>

      <label className="flex w-full flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-auto">
        Provincia
        <select
          name="province"
          defaultValue={current.province ?? ""}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground sm:w-auto"
        >
          <option value="">Todas</option>
          {provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <label className="flex w-full flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-auto">
        Ciudad/Barrio
        <select
          name="city"
          defaultValue={current.city ?? ""}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground sm:w-auto"
        >
          <option value="">Todas</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="flex w-full flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-auto">
        Combustible
        <select
          name="fuelType"
          defaultValue={current.fuelType ?? ""}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground sm:w-auto"
        >
          <option value="">Todos</option>
          {FUEL_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>

      <div className="flex w-full gap-2 sm:contents">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground sm:flex-none">
          Año desde
          <input
            type="number"
            name="minYear"
            defaultValue={current.minYear ?? ""}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground sm:w-24"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground sm:flex-none">
          Año hasta
          <input
            type="number"
            name="maxYear"
            defaultValue={current.maxYear ?? ""}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground sm:w-24"
          />
        </label>
      </div>

      <div className="flex w-full gap-2 sm:contents">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground sm:flex-none">
          Precio min
          <input
            type="number"
            name="minPrice"
            defaultValue={current.minPrice ?? ""}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground sm:w-28"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground sm:flex-none">
          Precio max
          <input
            type="number"
            name="maxPrice"
            defaultValue={current.maxPrice ?? ""}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground sm:w-28"
          />
        </label>
      </div>

      <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <input type="checkbox" name="financing" value="1" defaultChecked={current.financing === "1"} className="h-4 w-4 rounded border-border" />
          Con financiación
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <input type="checkbox" name="tradeIn" value="1" defaultChecked={current.tradeIn === "1"} className="h-4 w-4 rounded border-border" />
          Acepta permuta
        </label>
      </div>

      <button type="submit" className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground sm:w-auto">
        Buscar
      </button>
      {(current.brand ||
        current.province ||
        current.city ||
        current.fuelType ||
        current.minPrice ||
        current.maxPrice ||
        current.minYear ||
        current.maxYear ||
        current.financing ||
        current.tradeIn) && (
        <Link href="/" className="text-xs font-semibold text-muted-foreground underline">
          Limpiar filtros
        </Link>
      )}
    </form>
  );
}
