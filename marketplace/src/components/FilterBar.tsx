// Formulario GET simple, sin JS — el navegador arma la URL con los filtros
// (?brand=...&province=...) y Next.js la resuelve server-side en page.tsx.
// A propósito no es un client component: nada acá necesita interactividad.
import Link from "next/link";

const FUEL_OPTIONS = ["Nafta", "Diésel", "Híbrido", "Eléctrico", "GNC"];

export function FilterBar({
  brands,
  provinces,
  current,
}: {
  brands: string[];
  provinces: string[];
  current: {
    brand?: string;
    province?: string;
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
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Marca
        <select name="brand" defaultValue={current.brand ?? ""} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
          <option value="">Todas</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Provincia
        <select name="province" defaultValue={current.province ?? ""} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
          <option value="">Todas</option>
          {provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Combustible
        <select name="fuelType" defaultValue={current.fuelType ?? ""} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
          <option value="">Todos</option>
          {FUEL_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Año desde
        <input type="number" name="minYear" defaultValue={current.minYear ?? ""} className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Año hasta
        <input type="number" name="maxYear" defaultValue={current.maxYear ?? ""} className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Precio min
        <input type="number" name="minPrice" defaultValue={current.minPrice ?? ""} className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Precio max
        <input type="number" name="maxPrice" defaultValue={current.maxPrice ?? ""} className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
      </label>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <input type="checkbox" name="financing" value="1" defaultChecked={current.financing === "1"} className="h-4 w-4 rounded border-border" />
          Con financiación
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <input type="checkbox" name="tradeIn" value="1" defaultChecked={current.tradeIn === "1"} className="h-4 w-4 rounded border-border" />
          Acepta permuta
        </label>
      </div>

      <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">
        Buscar
      </button>
      {(current.brand ||
        current.province ||
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
