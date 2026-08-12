import { SellerContactButtons } from "@/components/SellerContactButtons";
import { ShareButton } from "@/components/ShareButton";
import { StarRating } from "@/components/StarRating";
import { VehicleCard } from "@/components/VehicleCard";
import { getSellerReviews, getUserProfile, getVehiclesBySeller } from "@/lib/vehicles";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";

const APP_BASE_URL = "https://matchcars.app";

type PageData =
  | { kind: "redirect"; to: string }
  | { kind: "profile"; profile: Awaited<ReturnType<typeof getUserProfile>> & object; vehicles: Awaited<ReturnType<typeof getVehiclesBySeller>>; reviews: Awaited<ReturnType<typeof getSellerReviews>> };

async function loadPageData(uid: string): Promise<PageData | null> {
  const profile = await getUserProfile(uid);
  if (!profile) return null;
  if (profile.isDealer) return { kind: "redirect", to: `/agencia/${profile.slug ?? profile.id}` };
  const [vehicles, reviews] = await Promise.all([
    getVehiclesBySeller(profile.id, false, null),
    getSellerReviews(profile.id),
  ]);
  return { kind: "profile", profile, vehicles, reviews };
}

export async function generateMetadata({ params }: { params: Promise<{ uid: string }> }): Promise<Metadata> {
  const { uid } = await params;
  const data = await loadPageData(uid);
  if (!data || data.kind === "redirect") return { title: "Perfil no encontrado" };
  const { profile } = data;
  const description = `${profile.displayName} en Matchcars — mirá sus autos publicados y contactalo directo.`;
  return {
    title: profile.displayName,
    description,
    alternates: { canonical: `/user-profile/${profile.id}` },
    openGraph: {
      title: `${profile.displayName} | Matchcars`,
      description,
      images: profile.avatarUrl ? [profile.avatarUrl] : [],
      type: "profile",
    },
  };
}

export default async function UserProfilePage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const data = await loadPageData(uid);
  if (!data) notFound();
  if (data.kind === "redirect") redirect(data.to);
  const { profile, vehicles, reviews } = data;

  const appUrl = `${APP_BASE_URL}/app/user-profile/${profile.id}`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:gap-6">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-background">
          {profile.avatarUrl ? (
            <Image src={profile.avatarUrl} alt={profile.displayName} fill sizes="80px" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xl font-bold text-accent">
              {profile.displayName.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold">{profile.displayName}</h1>
          <p className="text-sm text-muted-foreground">Vendedor particular</p>
          {profile.rating > 0 && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <StarRating rating={profile.rating} />
              <span>
                {profile.rating.toFixed(1)} ({profile.reviewCount})
              </span>
            </div>
          )}
        </div>
        <ShareButton url={`${APP_BASE_URL}/user-profile/${profile.id}`} title={profile.displayName} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          {profile.description && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-1 text-sm font-semibold">Sobre el vendedor</p>
              <p className="whitespace-pre-line text-sm text-foreground">{profile.description}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <p className="text-lg font-bold">Publicaciones ({vehicles.length})</p>
            {vehicles.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
                Este vendedor no tiene autos publicados en este momento.
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

        <div className="rounded-2xl border border-border bg-card p-5">
          <SellerContactButtons
            whatsapp={profile.whatsapp}
            email={profile.email}
            appUrl={appUrl}
            waMessage={`Hola! Vi tu perfil en MatchCars y quería consultarte.`}
          />
        </div>
      </div>
    </div>
  );
}
