import { StarRating } from "@/components/StarRating";
import { Agency } from "@/lib/agencies";
import Image from "next/image";

// La ficha propia de cada agencia (con su descripción, horario, mapa, etc.)
// ya existe en la app y tiene su propio tratamiento SEO (`ogPreview` cubre
// `/agencia/**`) — no se duplica acá, se linkea directo.
const APP_BASE_URL = "https://matchcars.app";

export function AgencyCard({ agency }: { agency: Agency }) {
  return (
    <a
      href={`${APP_BASE_URL}/agencia/${agency.slug || agency.id}`}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="flex items-center gap-3">
        {agency.photoURL ? (
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-background">
            <Image src={agency.photoURL} alt={agency.name} fill sizes="56px" className="object-cover" />
          </div>
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-lg font-bold text-accent">
            {agency.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{agency.name}</p>
          <p className="truncate text-xs text-muted-foreground">{[agency.city, agency.province].filter(Boolean).join(", ") || "Argentina"}</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        {agency.rating > 0 ? (
          <div className="flex items-center gap-1 text-muted-foreground">
            <StarRating rating={agency.rating} />
            <span>({agency.reviewCount})</span>
          </div>
        ) : (
          <span className="text-muted-foreground">Sin reseñas todavía</span>
        )}
        <span className="rounded-full bg-accent/10 px-2 py-0.5 font-semibold text-accent">{agency.activeCars} autos</span>
      </div>

      {agency.brandSpecialties.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {agency.brandSpecialties.slice(0, 4).map((b) => (
            <span key={b} className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
              {b}
            </span>
          ))}
        </div>
      )}
    </a>
  );
}
