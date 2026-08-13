import { CarDetailTabs } from "@/components/CarDetailTabs";
import { PhotoGallery } from "@/components/Lightbox";
import { SellerContactButtons } from "@/components/SellerContactButtons";
import { ShareModal } from "@/components/ShareModal";
import { VehicleCard } from "@/components/VehicleCard";
import { generateQrSvg } from "@/lib/qrcode";
import { getSellerProfile, getSellerReviews, getSimilarVehicles, getVehicle } from "@/lib/vehicles";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

// La app actual (Expo web) sigue siendo la única que permite favoritear/
// chatear en privado — acá se muestra la ficha y, cuando el vendedor cargó
// WhatsApp o tiene email, un contacto directo sin pasar por la app.
const APP_BASE_URL = "https://matchcars.app";

async function loadPageData(id: string) {
  const vehicle = await getVehicle(id);
  if (!vehicle) return null;
  const [seller, similar, reviews, qrSvg] = await Promise.all([
    getSellerProfile(vehicle.userId),
    getSimilarVehicles(vehicle),
    getSellerReviews(vehicle.userId),
    generateQrSvg(`${APP_BASE_URL}/car/${vehicle.id}`),
  ]);
  return { vehicle, seller, similar, reviews, qrSvg };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await loadPageData(id);
  if (!data) return { title: "Auto no encontrado" };
  const { vehicle } = data;
  const title = `${vehicle.brand} ${vehicle.model} ${vehicle.version} ${vehicle.year ?? ""}`.replace(/\s+/g, " ").trim();
  const description =
    vehicle.description?.slice(0, 160) ||
    `${title} — ${vehicle.currency} ${vehicle.price.toLocaleString("es-AR")}. ${vehicle.km.toLocaleString("es-AR")} km en ${vehicle.city || vehicle.province}.`;
  return {
    title,
    description,
    alternates: { canonical: `/car/${id}` },
    openGraph: {
      title,
      description,
      images: vehicle.coverImage ? [vehicle.coverImage] : [],
      type: "website",
    },
  };
}

export default async function CarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadPageData(id);
  if (!data) notFound();
  const { vehicle, seller, similar, reviews, qrSvg } = data;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${vehicle.brand} ${vehicle.model} ${vehicle.version}`.trim(),
    description: vehicle.description || undefined,
    image: vehicle.coverImage ? [vehicle.coverImage, ...vehicle.gallery] : vehicle.gallery,
    brand: { "@type": "Brand", name: vehicle.brand },
    offers: {
      "@type": "Offer",
      priceCurrency: vehicle.currency,
      price: vehicle.price,
      availability: "https://schema.org/InStock",
      url: `${APP_BASE_URL}/car/${vehicle.id}`,
    },
  };

  const photos = [vehicle.coverImage, ...vehicle.gallery].filter(Boolean);
  const sellerLink = seller
    ? seller.isDealer
      ? `${APP_BASE_URL}/agencia/${seller.slug || vehicle.userId}`
      : `${APP_BASE_URL}/user-profile/${vehicle.userId}`
    : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Link href="/" className="text-sm font-semibold text-accent">
        ← Volver a la búsqueda
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-4">
          <PhotoGallery photos={photos} alt={`${vehicle.brand} ${vehicle.model}`} />

          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold">
                {vehicle.brand} {vehicle.model} {vehicle.version}
              </h1>
              <p className="text-sm text-muted-foreground">
                {vehicle.year} · {[vehicle.city, vehicle.province].filter(Boolean).join(", ")}
                {vehicle.publicationCode && <span className="ml-2 font-mono text-xs text-muted-foreground/70">#{vehicle.publicationCode}</span>}
              </p>
            </div>
            <ShareModal
              url={`${APP_BASE_URL}/car/${vehicle.id}`}
              title={`${vehicle.brand} ${vehicle.model} ${vehicle.version}`.trim()}
              qrSvg={qrSvg}
            />
          </div>

          <CarDetailTabs vehicle={vehicle} reviews={reviews} />
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-2xl font-extrabold text-accent">
              {vehicle.currency} {vehicle.price.toLocaleString("es-AR")}
            </p>
            {vehicle.acceptsFinancing && <p className="mt-1 text-xs font-semibold text-primary">Acepta financiación</p>}
            {vehicle.acceptsTradeIn && <p className="text-xs text-muted-foreground">Acepta permuta</p>}

            <div className="mt-4">
              <SellerContactButtons
                whatsapp={seller?.whatsapp ?? ""}
                email={seller?.email ?? ""}
                waMessage={`Hola! Vi tu ${vehicle.brand} ${vehicle.model} en MatchCars y quería consultarte.`}
              />
            </div>
          </div>

          {seller && sellerLink && (
            <a href={sellerLink} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-accent">
              {seller.avatarUrl ? (
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-background">
                  <Image src={seller.avatarUrl} alt={seller.displayName} fill sizes="48px" className="object-cover" />
                </div>
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
                  {seller.displayName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{seller.displayName}</p>
                <p className="text-xs text-muted-foreground">{seller.isDealer ? "Agencia verificada" : "Vendedor particular"}</p>
              </div>
            </a>
          )}
        </div>
      </div>

      {similar.length > 0 && (
        <div className="flex flex-col gap-3 pt-4">
          <p className="text-lg font-bold">Autos similares</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((v) => (
              <VehicleCard key={v.id} vehicle={v} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
