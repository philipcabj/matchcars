import { PhotoGallery } from "@/components/Lightbox";
import { StarRating } from "@/components/StarRating";
import { VehicleCard } from "@/components/VehicleCard";
import { APPLE_URL, PLAY_URL } from "@/lib/app-links";
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
  const [seller, similar, reviews] = await Promise.all([
    getSellerProfile(vehicle.userId),
    getSimilarVehicles(vehicle),
    getSellerReviews(vehicle.userId),
  ]);
  return { vehicle, seller, similar, reviews };
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

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <p className="text-sm font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2 border-b border-border/60 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}


export default async function CarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadPageData(id);
  if (!data) notFound();
  const { vehicle, seller, similar, reviews } = data;

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
  // La app transaccional (Expo web) vive bajo /app — /car/{id} sin prefijo
  // ahora es la ficha propia de este marketplace, no la SPA.
  const appUrl = `${APP_BASE_URL}/app/car/${vehicle.id}`;
  const waDigits = seller?.whatsapp ? seller.whatsapp.replace(/\D/g, "") : "";
  const waText = encodeURIComponent(`Hola! Vi tu ${vehicle.brand} ${vehicle.model} en MatchCars y quería consultarte.`);
  const waLink = waDigits ? `https://wa.me/${waDigits}?text=${waText}` : null;
  const mailLink = !waLink && seller?.email ? `mailto:${seller.email}` : null;
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

          <div>
            <h1 className="text-2xl font-extrabold">
              {vehicle.brand} {vehicle.model} {vehicle.version}
            </h1>
            <p className="text-sm text-muted-foreground">
              {vehicle.year} · {[vehicle.city, vehicle.province].filter(Boolean).join(", ")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Kilómetros" value={vehicle.km ? `${vehicle.km.toLocaleString("es-AR")} km` : "—"} />
            <StatTile label="Combustible" value={vehicle.fuelType || "—"} />
            <StatTile label="Caja" value={vehicle.gearbox || "—"} />
            <StatTile label="Dueño único" value={vehicle.singleOwner ? "Sí" : "—"} />
          </div>

          {vehicle.description && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-1 text-sm font-semibold">Descripción</p>
              <p className="whitespace-pre-line text-sm text-foreground">{vehicle.description}</p>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="mb-2 text-sm font-semibold">Ficha técnica</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <SpecRow label="Marca" value={vehicle.brand} />
              <SpecRow label="Modelo" value={vehicle.model} />
              <SpecRow label="Versión" value={vehicle.version} />
              <SpecRow label="Año" value={vehicle.year ? String(vehicle.year) : ""} />
              <SpecRow label="Motor" value={vehicle.engine} />
              <SpecRow label="Combustible" value={vehicle.fuelType} />
              <SpecRow label="Caja" value={vehicle.gearbox} />
              <SpecRow label="Tracción" value={vehicle.wheelType} />
              <SpecRow label="Airbags" value={vehicle.airbags} />
              <SpecRow label="Levantavidrios" value={vehicle.windowsAuto} />
              <SpecRow label="Tipo de operación" value={vehicle.operationType === "swap" ? "Permuta" : "Venta"} />
              <SpecRow label="Motivo de venta" value={vehicle.sellingReason} />
            </div>
          </div>

          {vehicle.features.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-2 text-sm font-semibold">Equipamiento</p>
              <div className="flex flex-wrap gap-2">
                {vehicle.features.map((f) => (
                  <span key={f} className="rounded-full bg-background px-3 py-1 text-xs">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(vehicle.serviceRecords || vehicle.vtvValid || vehicle.papersUpToDate || vehicle.warranty || vehicle.negotiablePrice || vehicle.immediateDelivery) && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-2 text-sm font-semibold">Características</p>
              <div className="flex flex-wrap gap-2">
                {vehicle.serviceRecords && <span className="rounded-full bg-background px-3 py-1 text-xs">✓ Service oficial al día</span>}
                {vehicle.vtvValid && <span className="rounded-full bg-background px-3 py-1 text-xs">✓ VTV vigente</span>}
                {vehicle.papersUpToDate && <span className="rounded-full bg-background px-3 py-1 text-xs">✓ Papeles al día</span>}
                {vehicle.warranty && <span className="rounded-full bg-background px-3 py-1 text-xs">✓ Con garantía</span>}
                {vehicle.negotiablePrice && <span className="rounded-full bg-background px-3 py-1 text-xs">✓ Precio conversable</span>}
                {vehicle.immediateDelivery && <span className="rounded-full bg-background px-3 py-1 text-xs">✓ Entrega inmediata</span>}
              </div>
            </div>
          )}

          {vehicle.priceHistory.length > 1 && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-2 text-sm font-semibold">Historial de precio</p>
              <div className="flex flex-col gap-1">
                {vehicle.priceHistory.map((h, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{h.changedAt ? new Date(h.changedAt).toLocaleDateString("es-AR") : "—"}</span>
                    <span className="font-semibold">
                      {h.currency} {Number(h.price).toLocaleString("es-AR")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {vehicle.acceptsFinancing && vehicle.financing && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-2 text-sm font-semibold">Financiación</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                {vehicle.financing.entity && <SpecRow label="Entidad" value={vehicle.financing.entity} />}
                {vehicle.financing.type && (
                  <SpecRow
                    label="Tipo"
                    value={vehicle.financing.type === "sin_interes" ? "Sin interés" : vehicle.financing.type === "banco" ? "Bancaria" : "Propia"}
                  />
                )}
                {!!vehicle.financing.downPayment && (
                  <SpecRow label="Anticipo" value={`${vehicle.currency} ${vehicle.financing.downPayment.toLocaleString("es-AR")}`} />
                )}
                {!!vehicle.financing.monthlyPayment && (
                  <SpecRow label="Cuota estimada" value={`${vehicle.currency} ${vehicle.financing.monthlyPayment.toLocaleString("es-AR")}`} />
                )}
                {!!vehicle.financing.months && <SpecRow label="Plazo" value={`${vehicle.financing.months} meses`} />}
                {!!vehicle.financing.rate && <SpecRow label="Tasa" value={`${vehicle.financing.rate}%`} />}
              </div>
            </div>
          )}

          {(seller?.isDealer || vehicle.sellerReviewCount > 0 || reviews.length > 0) && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Reseñas del vendedor</p>
                {vehicle.sellerRating > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <StarRating rating={vehicle.sellerRating} />
                    <span>
                      {vehicle.sellerRating.toFixed(1)} ({vehicle.sellerReviewCount})
                    </span>
                  </div>
                )}
              </div>
              {reviews.length === 0 ? (
                <p className="text-xs text-muted-foreground">Todavía no hay reseñas.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {reviews.map((r) => (
                    <div key={r.id} className="border-b border-border/60 pb-2 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{r.reviewerName}</p>
                        <StarRating rating={r.rating} />
                      </div>
                      {r.comment && <p className="mt-0.5 text-sm text-muted-foreground">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-2xl font-extrabold text-accent">
              {vehicle.currency} {vehicle.price.toLocaleString("es-AR")}
            </p>
            {vehicle.acceptsFinancing && <p className="mt-1 text-xs font-semibold text-primary">Acepta financiación</p>}
            {vehicle.acceptsTradeIn && <p className="text-xs text-muted-foreground">Acepta permuta</p>}

            <div className="mt-4 flex flex-col gap-2">
              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-[#25D366] px-4 py-2.5 text-center text-sm font-semibold text-white"
                >
                  Escribir por WhatsApp
                </a>
              )}
              {mailLink && (
                <a href={mailLink} className="rounded-lg bg-accent px-4 py-2.5 text-center text-sm font-semibold text-accent-foreground">
                  Enviar email
                </a>
              )}
              <a
                href={appUrl}
                className={
                  waLink || mailLink
                    ? "rounded-lg border border-border px-4 py-2.5 text-center text-sm font-semibold text-foreground"
                    : "rounded-lg bg-accent px-4 py-2.5 text-center text-sm font-semibold text-accent-foreground"
                }
              >
                Seguir por la app
              </a>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              {waLink || mailLink ? "También podés seguir la conversación desde la app." : "Se abre en la app de Matchcars para continuar."}
            </p>
            <p className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-center text-[11px] text-muted-foreground">
              Para mensajes privados dentro de la app, descargá MatchCars:{" "}
              <a href={APPLE_URL} className="font-semibold text-accent">
                App Store
              </a>{" "}
              ·{" "}
              <a href={PLAY_URL} className="font-semibold text-accent">
                Google Play
              </a>
            </p>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {similar.map((v) => (
              <VehicleCard key={v.id} vehicle={v} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
