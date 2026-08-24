import { SellerContactButtons } from "@/components/SellerContactButtons";
import { ShareModal } from "@/components/ShareModal";
import { StarRating } from "@/components/StarRating";
import { VehicleCard } from "@/components/VehicleCard";
import { generateQrSvg } from "@/lib/qrcode";
import { getSellerReviews, getUserProfile, getVehiclesBySeller } from "@/lib/vehicles";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";

const APP_BASE_URL = "https://matchcars.app";
const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || "http://localhost:3000";

type PageData =
  | { kind: "redirect"; to: string }
  | {
      kind: "profile";
      profile: Awaited<ReturnType<typeof getUserProfile>> & object;
      vehicles: Awaited<ReturnType<typeof getVehiclesBySeller>>;
      reviews: Awaited<ReturnType<typeof getSellerReviews>>;
      profileUrl: string;
      qrSvg: string;
    };

async function loadPageData(uid: string): Promise<PageData | null> {
  const profile = await getUserProfile(uid);
  if (!profile) return null;
  if (profile.isDealer) return { kind: "redirect", to: `/agencia/${profile.slug ?? profile.id}` };
  const profileUrl = `${APP_BASE_URL}/user-profile/${profile.id}`;
  const [vehicles, reviews, qrSvg] = await Promise.all([
    getVehiclesBySeller(profile.id, false, null),
    getSellerReviews(profile.id),
    generateQrSvg(profileUrl),
  ]);
  return { kind: "profile", profile, vehicles, reviews, profileUrl, qrSvg };
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
  const { profile, vehicles, reviews, profileUrl, qrSvg } = data;

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
        <ShareModal url={profileUrl} title={profile.displayName} qrSvg={qrSvg} />
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

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <SellerContactButtons
              whatsapp={profile.whatsapp}
              email={profile.email}
              waMessage={`Hola! Vi tu perfil en MatchCars y quería consultarte.`}
            />
          </div>

          {/* Este perfil es exclusivamente de vendedores en plan free (los
              pagos redirigen a /agencia/[slug] más arriba), y el plan free
              tiene tope de 1 auto activo (getMaxCars) — no hay forma de que
              este perfil tenga 2+ publicaciones a la vez, así que el CTA no
              puede depender de eso. Se muestra siempre, apuntando al límite
              real que resuelve pasarse a agencia. */}
          <div className="flex flex-col gap-2 rounded-2xl border border-accent/40 bg-accent/5 p-5">
            <p className="text-sm font-extrabold">🏢 ¿Necesitás publicar más de un auto?</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              El plan gratis permite 1 auto activo a la vez. Convertite en agencia: ficha propia verificada, más
              cupo y el Portal de Agencias para gestionar tus ventas.
            </p>
            <a
              href={`${PORTAL_URL}/planes`}
              className="mt-1 rounded-lg bg-accent px-3 py-2 text-center text-xs font-bold text-accent-foreground transition hover:opacity-90"
            >
              Ver planes →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
