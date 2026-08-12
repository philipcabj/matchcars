import { SellerContactButtons } from "@/components/SellerContactButtons";
import { ShareModal } from "@/components/ShareModal";
import { StarRating } from "@/components/StarRating";
import { VehicleCard } from "@/components/VehicleCard";
import { legacyAppUrl } from "@/lib/app-links";
import { getAgencyProfile } from "@/lib/agencies";
import { generateQrSvg } from "@/lib/qrcode";
import { getSellerReviews, getVehiclesBySeller } from "@/lib/vehicles";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

const APP_BASE_URL = "https://matchcars.app";

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 rounded-xl border border-border bg-background px-3 py-3 text-center">
      <p className="text-xl font-extrabold text-accent">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

async function loadPageData(slug: string) {
  const agency = await getAgencyProfile(slug);
  if (!agency) return null;
  const profileUrl = `${APP_BASE_URL}/agencia/${agency.slug ?? agency.id}`;
  const [vehicles, reviews, qrSvg] = await Promise.all([
    getVehiclesBySeller(agency.id, true, agency.photoURL),
    getSellerReviews(agency.id),
    generateQrSvg(profileUrl),
  ]);
  return { agency, vehicles, reviews, profileUrl, qrSvg };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadPageData(slug);
  if (!data) return { title: "Agencia no encontrada" };
  const { agency } = data;
  const description = `${agency.name} en Matchcars — ${agency.activeCars} autos publicados${
    agency.city ? ` en ${agency.city}` : ""
  }. Mirá su stock, reputación y contacto.`;
  return {
    title: agency.name,
    description,
    alternates: { canonical: `/agencia/${agency.slug ?? agency.id}` },
    openGraph: {
      title: `${agency.name} | Agencia en Matchcars`,
      description,
      images: agency.photoURL ? [agency.photoURL] : [],
      type: "profile",
    },
  };
}

export default async function AgencyProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadPageData(slug);
  if (!data) notFound();
  const { agency, vehicles, reviews, profileUrl, qrSvg } = data;

  const appUrl = legacyAppUrl(`/user-profile/${agency.id}`);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="relative flex h-40 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-accent/25 via-primary/15 to-accent/10 sm:h-56">
          {agency.bannerUrl ? (
            <Image src={agency.bannerUrl} alt="" fill sizes="100vw" className="object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 text-center">
              <p className="text-2xl font-extrabold sm:text-4xl">{agency.name}</p>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:text-sm">
                Agencia verificada en MatchCars
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:gap-6">
          <div className="relative -mt-14 h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-4 border-card bg-background shadow sm:-mt-16 sm:h-28 sm:w-28">
            {agency.photoURL ? (
              <Image src={agency.photoURL} alt={agency.name} fill sizes="112px" className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-accent">
                {agency.name.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-extrabold">{agency.name}</h1>
              <span className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground">
                ✓ Agencia verificada
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {[agency.city, agency.province].filter(Boolean).join(", ") || "Argentina"}
              {agency.foundedYear ? ` · Desde ${agency.foundedYear}` : ""}
            </p>
            {agency.rating > 0 && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <StarRating rating={agency.rating} />
                <span>
                  {agency.rating.toFixed(1)} ({agency.reviewCount})
                </span>
              </div>
            )}
          </div>
          <ShareModal url={profileUrl} title={agency.name} qrSvg={qrSvg} />
        </div>
        {agency.brandSpecialties.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-5 pb-5">
            {agency.brandSpecialties.map((b) => (
              <span key={b} className="rounded-full bg-background px-2.5 py-1 text-xs text-muted-foreground">
                {b}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            <StatTile value={agency.activeCars} label="Publicados" />
            <StatTile value={agency.soldCount} label="Vendidos" />
            <StatTile value={agency.reviewCount} label="Reseñas" />
          </div>

          {agency.description && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-1 text-sm font-semibold">Sobre la agencia</p>
              <p className="whitespace-pre-line text-sm text-foreground">{agency.description}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <p className="text-lg font-bold">Stock ({vehicles.length})</p>
            {vehicles.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
                Esta agencia no tiene autos publicados en este momento.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {vehicles.map((v) => (
                  <VehicleCard key={v.id} vehicle={v} />
                ))}
              </div>
            )}
          </div>

          {reviews.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-2 text-sm font-semibold">Reseñas</p>
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
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <SellerContactButtons
              whatsapp={agency.whatsapp}
              email={agency.email}
              appUrl={appUrl}
              waMessage={`Hola! Vi tu perfil de ${agency.name} en MatchCars y quería consultarte.`}
            />
          </div>

          {(agency.businessAddress || agency.businessHours || agency.website || agency.instagram) && (
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-sm">
              {agency.businessCoordinates && (
                <div className="-mx-4 -mt-4 mb-1 h-40 w-[calc(100%+2rem)] overflow-hidden rounded-t-2xl">
                  <iframe
                    title={`Ubicación de ${agency.name}`}
                    src={`https://maps.google.com/maps?q=${agency.businessCoordinates.latitude},${agency.businessCoordinates.longitude}&z=15&output=embed`}
                    className="h-full w-full border-0"
                    loading="lazy"
                  />
                </div>
              )}
              {agency.businessAddress && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Dirección</p>
                  <p>{agency.businessAddress}</p>
                  {!agency.businessCoordinates && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(agency.businessAddress)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-accent"
                    >
                      Ver en Google Maps
                    </a>
                  )}
                </div>
              )}
              {agency.businessHours && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Horarios</p>
                  <p>{agency.businessHours}</p>
                </div>
              )}
              {agency.website && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Sitio web</p>
                  <a href={agency.website} target="_blank" rel="noopener noreferrer" className="text-accent">
                    {agency.website}
                  </a>
                </div>
              )}
              {agency.instagram && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Instagram</p>
                  <a
                    href={`https://instagram.com/${agency.instagram.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent"
                  >
                    @{agency.instagram.replace(/^@/, "")}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
