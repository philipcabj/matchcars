import { AgencyCard } from "@/components/AgencyCard";
import { AgencyPromoCard } from "@/components/AgencyPromoCard";
import { AppDownloadCard } from "@/components/AppDownloadCard";
import { FilterBar } from "@/components/FilterBar";
import { VehicleCard } from "@/components/VehicleCard";
import { getFeaturedAgencies } from "@/lib/agencies";
import { getUsdToArsRate } from "@/lib/pricing-admin";
import { getFeaturedVehicles, getFilterOptions, getPopularBrands, listVehicles, VehicleFilters } from "@/lib/vehicles";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Autos usados en venta",
  description: "Explorá miles de autos usados de particulares y agencias verificadas en toda Argentina.",
  alternates: { canonical: "/" },
};

type SearchParams = Record<string, string | string[] | undefined>;

function asString(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function asNumber(v: string | string[] | undefined): number | undefined {
  const s = asString(v);
  const n = s ? Number(s) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function asFlag(v: string | string[] | undefined): boolean {
  return asString(v) === "1";
}

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const filters: VehicleFilters = {
    brand: asString(sp.brand),
    province: asString(sp.province),
    fuelType: asString(sp.fuelType),
    minPrice: asNumber(sp.minPrice),
    maxPrice: asNumber(sp.maxPrice),
    minYear: asNumber(sp.minYear),
    maxYear: asNumber(sp.maxYear),
    financing: asFlag(sp.financing),
    tradeIn: asFlag(sp.tradeIn),
    page: asNumber(sp.page) ?? 1,
  };

  const [{ vehicles, total, page, totalPages }, { brands, provinces }, featuredAgencies, featuredVehicles, popularBrands, usdRate] =
    await Promise.all([
      listVehicles(filters),
      getFilterOptions(),
      getFeaturedAgencies(),
      getFeaturedVehicles(),
      getPopularBrands(),
      getUsdToArsRate(),
    ]);

  const buildPageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (filters.brand) params.set("brand", filters.brand);
    if (filters.province) params.set("province", filters.province);
    if (filters.fuelType) params.set("fuelType", filters.fuelType);
    if (filters.minPrice) params.set("minPrice", String(filters.minPrice));
    if (filters.maxPrice) params.set("maxPrice", String(filters.maxPrice));
    if (filters.minYear) params.set("minYear", String(filters.minYear));
    if (filters.maxYear) params.set("maxYear", String(filters.maxYear));
    if (filters.financing) params.set("financing", "1");
    if (filters.tradeIn) params.set("tradeIn", "1");
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  };

  const currentFilters = {
    brand: filters.brand,
    province: filters.province,
    fuelType: filters.fuelType,
    minPrice: filters.minPrice ? String(filters.minPrice) : undefined,
    maxPrice: filters.maxPrice ? String(filters.maxPrice) : undefined,
    minYear: filters.minYear ? String(filters.minYear) : undefined,
    maxYear: filters.maxYear ? String(filters.maxYear) : undefined,
    financing: filters.financing ? "1" : undefined,
    tradeIn: filters.tradeIn ? "1" : undefined,
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl gap-6 px-6 py-8">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <p className="text-sm text-muted-foreground">Autos usados de particulares y agencias verificadas.</p>

        <div className="xl:hidden">
          <AppDownloadCard source="home" />
        </div>

        <Link
          href="/tasador"
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-accent/5 px-4 py-2.5 transition hover:border-accent"
        >
          <p className="text-sm">
            <span className="font-bold">¿Cuánto vale tu auto?</span>{" "}
            <span className="text-muted-foreground">
              Estimá un precio de mercado en segundos, sin registrarte. Para publicarlo, lo hacés desde la app.
            </span>
          </p>
          <span className="shrink-0 text-xs font-semibold text-accent">Calcular ahora →</span>
        </Link>

        <div className="hidden md:block">
          <FilterBar brands={brands} provinces={provinces} current={currentFilters} />
        </div>
        <details className="group flex flex-col gap-3 md:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold">
            Filtros
            <span className="text-muted-foreground transition group-open:rotate-180">⌄</span>
          </summary>
          <FilterBar brands={brands} provinces={provinces} current={currentFilters} />
        </details>

        <p className="text-sm text-muted-foreground">{total.toLocaleString("es-AR")} autos encontrados</p>

        {vehicles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            No encontramos autos con esos filtros.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => (
              <VehicleCard key={v.id} vehicle={v} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <nav className="flex items-center justify-center gap-2 pt-4">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={buildPageHref(p)}
                className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold ${
                  p === page ? "bg-accent text-accent-foreground" : "border border-border bg-card text-foreground"
                }`}
              >
                {p}
              </Link>
            ))}
          </nav>
        )}

        <div className="xl:hidden">
          <AgencyPromoCard source="home_mobile" />
        </div>
      </div>

      <aside className="hidden w-72 shrink-0 flex-col gap-4 xl:flex">
        <AppDownloadCard />

        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
          <div>
            <p className="text-xs text-muted-foreground">Dólar blue</p>
            <p className="text-lg font-extrabold text-foreground">${usdRate.rate.toLocaleString("es-AR")}</p>
          </div>
          <span className="max-w-[45%] text-right text-[11px] text-muted-foreground">{usdRate.source}</span>
        </div>

        {featuredVehicles.length > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-bold">Autos destacados</p>
            <div className="flex flex-col gap-3">
              {featuredVehicles.map((v) => (
                <Link key={v.id} href={`/car/${v.id}`} className="flex items-center gap-3 group">
                  <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-background">
                    {v.coverImage && (
                      <Image src={v.coverImage} alt={`${v.brand} ${v.model}`} fill sizes="64px" className="object-cover" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold group-hover:text-accent">
                      {v.brand} {v.model} {v.year || ""}
                    </p>
                    <p className="text-xs font-bold text-accent">
                      {v.currency} {v.price.toLocaleString("es-AR")}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {popularBrands.length > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-bold">Marcas populares</p>
            <div className="flex flex-wrap gap-1.5">
              {popularBrands.map((b) => (
                <Link
                  key={b.brand}
                  href={`/?brand=${encodeURIComponent(b.brand)}`}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground transition hover:border-accent hover:text-accent"
                >
                  {b.brand} <span className="text-muted-foreground">({b.count})</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {featuredAgencies.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Agencias destacadas</p>
              <Link href="/agencias" className="text-xs font-semibold text-accent">
                Ver todas →
              </Link>
            </div>
            {featuredAgencies.map((a) => (
              <AgencyCard key={a.id} agency={a} />
            ))}
          </div>
        )}

        <AgencyPromoCard source="home_sidebar" />
      </aside>
    </div>
  );
}
