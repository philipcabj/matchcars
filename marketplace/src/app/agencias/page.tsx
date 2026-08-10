import { AgencyCard } from "@/components/AgencyCard";
import { listAgencies } from "@/lib/agencies";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agencias y concesionarias verificadas",
  description: "Directorio de agencias de autos verificadas en Argentina — stock, ubicación y calificación.",
  alternates: { canonical: "/agencias" },
};

type SearchParams = Record<string, string | string[] | undefined>;

function asString(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

export default async function AgenciesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const search = asString(sp.search);
  const province = asString(sp.province);
  const sort = (asString(sp.sort) as "name" | "rating" | "cars" | undefined) ?? "name";

  const { agencies, provinces } = await listAgencies({ search, province, sort });

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-extrabold">Agencias verificadas</h1>
        <p className="text-sm text-muted-foreground">{agencies.length} agencias con stock activo en Matchcars.</p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
        <label className="flex w-full min-w-[180px] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Buscar
          <input
            type="text"
            name="search"
            defaultValue={search ?? ""}
            placeholder="Nombre, ciudad o marca…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <label className="flex w-full flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-auto">
          Provincia
          <select
            name="province"
            defaultValue={province ?? ""}
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
          Orden
          <select
            name="sort"
            defaultValue={sort}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground sm:w-auto"
          >
            <option value="name">A-Z</option>
            <option value="rating">Mejor valoradas</option>
            <option value="cars">Más autos</option>
          </select>
        </label>
        <button type="submit" className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground sm:w-auto">
          Buscar
        </button>
      </form>

      {agencies.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No encontramos agencias con esos filtros.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {agencies.map((a) => (
            <AgencyCard key={a.id} agency={a} />
          ))}
        </div>
      )}
    </div>
  );
}
