import { FilterBar } from "@/components/FilterBar";
import { TrackPageView } from "@/components/TrackPageView";
import { VehicleFeed } from "@/components/VehicleFeed";
import { facetPath, resolveFacet } from "@/lib/facets";
import { getBrandModelMap, getFilterOptions, listVehicles, VehicleFilters } from "@/lib/vehicles";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

const APP_BASE_URL = "https://matchcars.app";

// Landing SEO — contenido estable, se revalida cada 10 min en vez de en cada
// request (fetchPublishedVehicles trae ~500 docs).
export const revalidate = 600;

type SearchParams = Record<string, string | string[] | undefined>;
type Params = { slug?: string[] };

const asString = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v : undefined);
const asNumber = (v: string | string[] | undefined) => {
  const n = asString(v) ? Number(asString(v)) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const asFlag = (v: string | string[] | undefined) => asString(v) === "1";

function label(brand: string, model?: string) {
  return model ? `${brand} ${model}` : brand;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug = [] } = await params;
  if (slug.length === 0) return { title: "Autos usados en venta", alternates: { canonical: "/autos" } };

  const facet = await resolveFacet(slug);
  if (!facet) return { title: "Búsqueda no encontrada", robots: { index: false } };

  const { total } = await listVehicles({ brand: facet.brand, model: facet.model });
  const name = label(facet.brand, facet.model);
  const path = facetPath(facet.brand, facet.model);
  const title = `${name} usados en venta`;
  const description = `${total} ${name} usados publicados por particulares y agencias verificadas en Argentina. Precios, fotos, kilometraje y contacto directo en MatchCars.`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: "Matchcars", locale: "es_AR", type: "website" },
  };
}

export default async function AutosFacetPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug = [] } = await params;
  if (slug.length === 0) redirect("/");

  const facet = await resolveFacet(slug);
  if (!facet) notFound();

  const sp = await searchParams;
  const filters: VehicleFilters = {
    brand: facet.brand,
    model: facet.model,
    fuelType: asString(sp.fuelType),
    minPrice: asNumber(sp.minPrice),
    maxPrice: asNumber(sp.maxPrice),
    minYear: asNumber(sp.minYear),
    maxYear: asNumber(sp.maxYear),
    financing: asFlag(sp.financing),
    tradeIn: asFlag(sp.tradeIn),
    page: asNumber(sp.page) ?? 1,
  };

  const [{ vehicles, total, page, totalPages }, brandModelMap, { brands, provinces, cities }] = await Promise.all([
    listVehicles(filters),
    getBrandModelMap(),
    getFilterOptions(),
  ]);

  const name = label(facet.brand, facet.model);
  const path = facetPath(facet.brand, facet.model);

  const pageHref = (target: number) => {
    const qs = new URLSearchParams();
    if (filters.fuelType) qs.set("fuelType", filters.fuelType);
    if (filters.minPrice) qs.set("minPrice", String(filters.minPrice));
    if (filters.maxPrice) qs.set("maxPrice", String(filters.maxPrice));
    if (filters.minYear) qs.set("minYear", String(filters.minYear));
    if (filters.maxYear) qs.set("maxYear", String(filters.maxYear));
    if (filters.financing) qs.set("financing", "1");
    if (filters.tradeIn) qs.set("tradeIn", "1");
    if (target > 1) qs.set("page", String(target));
    const s = qs.toString();
    return s ? `${path}?${s}` : path;
  };

  const brandModels = brandModelMap[facet.brand] ?? [];
  const otherBrands = Object.keys(brandModelMap).filter((b) => b !== facet.brand);

  const breadcrumbItems = [
    { name: "Inicio", url: APP_BASE_URL },
    { name: facet.brand, url: `${APP_BASE_URL}${facetPath(facet.brand)}` },
    ...(facet.model ? [{ name: facet.model, url: `${APP_BASE_URL}${path}` }] : []),
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbItems.map((b, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: b.name,
          ...(i < breadcrumbItems.length - 1 ? { item: b.url } : {}),
        })),
      },
      {
        "@type": "ItemList",
        name: `${name} usados en venta`,
        numberOfItems: total,
        itemListElement: vehicles.map((v, i) => ({
          "@type": "ListItem",
          position: (page - 1) * 24 + i + 1,
          url: `${APP_BASE_URL}/car/${v.id}`,
          name: `${v.brand} ${v.model} ${v.version}`.replace(/\s+/g, " ").trim(),
        })),
      },
    ],
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <TrackPageView event="web_facet_view" params={{ brand: facet.brand, model: facet.model ?? "" }} />

      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-accent">
          Inicio
        </Link>
        <span>/</span>
        {facet.model ? (
          <>
            <Link href={facetPath(facet.brand)} className="hover:text-accent">
              {facet.brand}
            </Link>
            <span>/</span>
            <span className="text-foreground">{facet.model}</span>
          </>
        ) : (
          <span className="text-foreground">{facet.brand}</span>
        )}
      </nav>

      <div>
        <h1 className="text-2xl font-extrabold">{name} usados en venta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total.toLocaleString("es-AR")} {total === 1 ? "auto publicado" : "autos publicados"} en MatchCars
        </p>
      </div>

      <FilterBar
        brands={brands}
        provinces={provinces}
        cities={cities}
        action="/"
        current={{ brand: facet.brand }}
      />

      <VehicleFeed
        vehicles={vehicles}
        page={page}
        totalPages={totalPages}
        pageHref={pageHref}
        emptyLabel={`Todavía no hay ${name} publicados. Probá con otra búsqueda.`}
      />

      {/* Enlazado interno — que Google descubra las demás facetas */}
      {!facet.model && brandModels.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-border pt-5">
          <h2 className="text-sm font-bold">{facet.brand} por modelo</h2>
          <div className="flex flex-wrap gap-1.5">
            {brandModels.map((m) => (
              <Link
                key={m}
                href={facetPath(facet.brand, m)}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold transition hover:border-accent hover:text-accent"
              >
                {m}
              </Link>
            ))}
          </div>
        </section>
      )}

      {facet.model && brandModels.length > 1 && (
        <section className="flex flex-col gap-2 border-t border-border pt-5">
          <h2 className="text-sm font-bold">Otros modelos de {facet.brand}</h2>
          <div className="flex flex-wrap gap-1.5">
            {brandModels
              .filter((m) => m !== facet.model)
              .map((m) => (
                <Link
                  key={m}
                  href={facetPath(facet.brand, m)}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold transition hover:border-accent hover:text-accent"
                >
                  {facet.brand} {m}
                </Link>
              ))}
          </div>
        </section>
      )}

      {otherBrands.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-border pt-5">
          <h2 className="text-sm font-bold">Buscá por marca</h2>
          <div className="flex flex-wrap gap-1.5">
            {otherBrands.map((b) => (
              <Link
                key={b}
                href={facetPath(b)}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition hover:border-accent hover:text-accent"
              >
                {b}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
