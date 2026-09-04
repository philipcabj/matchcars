// marketplace/src/app/sitemap.ts
// Reemplaza al sitemap estático de 6 URLs de la app (raíz `public/sitemap.xml`)
// — este se genera con los vehículos publicados reales + las landings por
// faceta (marca / marca+modelo, ver lib/facets.ts).
import { facetPath } from "@/lib/facets";
import { getBrandModelMap, listAllVehicleIds } from "@/lib/vehicles";
import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3100";

// Se regenera cada hora — sin esto queda congelado al build y va acumulando
// URLs de autos ya vendidos / facetas sin stock.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [vehicles, brandModelMap] = await Promise.all([listAllVehicleIds(), getBrandModelMap()]);

  const vehicleEntries: MetadataRoute.Sitemap = vehicles.map((v) => ({
    url: `${SITE_URL}/car/${v.id}`,
    lastModified: v.createdAt ?? undefined,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const facetEntries: MetadataRoute.Sitemap = [];
  for (const [brand, models] of Object.entries(brandModelMap)) {
    facetEntries.push({
      url: `${SITE_URL}${facetPath(brand)}`,
      changeFrequency: "daily",
      priority: 0.7,
    });
    for (const model of models) {
      facetEntries.push({
        url: `${SITE_URL}${facetPath(brand, model)}`,
        changeFrequency: "daily",
        priority: 0.6,
      });
    }
  }

  return [
    { url: SITE_URL, changeFrequency: "hourly", priority: 1 },
    ...facetEntries,
    ...vehicleEntries,
  ];
}
