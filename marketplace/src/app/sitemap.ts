// marketplace/src/app/sitemap.ts
// Reemplaza al sitemap estático de 6 URLs de la app (raíz `public/sitemap.xml`)
// — este se genera con los vehículos publicados reales.
import { listAllVehicleIds } from "@/lib/vehicles";
import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3100";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const vehicles = await listAllVehicleIds();

  const vehicleEntries: MetadataRoute.Sitemap = vehicles.map((v) => ({
    url: `${SITE_URL}/car/${v.id}`,
    lastModified: v.createdAt ?? undefined,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  return [{ url: SITE_URL, changeFrequency: "hourly", priority: 1 }, ...vehicleEntries];
}
