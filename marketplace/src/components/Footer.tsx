// marketplace/src/components/Footer.tsx
// Antes el único link al portal en toda la web pública era el del NavBar —
// ver AgencyPromoCard.tsx para el resto de la promoción del portal. Este
// footer suma presencia de marca (redes, descarga) y los links legales que
// antes no existían en ningún lado del sitio.
import { APPLE_URL, PLAY_URL } from "@/lib/app-links";
import Image from "next/image";
import Link from "next/link";

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || "http://localhost:3000";
const INSTAGRAM_URL = "https://instagram.com/matchcars.app";
const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61571061579647";
// Ícono en vez de mostrar el texto del mail — así no se ve a simple vista
// que es una dirección de Gmail.
const CONTACT_MAILTO = "mailto:matchcarsinfo@gmail.com";

function SocialIcon({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-[11px] border border-border bg-background text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-foreground hover:bg-foreground hover:text-background"
    >
      {children}
    </a>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-8 gap-y-10 px-6 py-14 sm:grid-cols-5 sm:gap-10">
        <div className="col-span-2 flex max-w-xs flex-col gap-4 sm:col-span-2">
          <Link href="/" className="flex items-center gap-2 text-[19px] font-extrabold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white p-1 shadow-sm">
              <Image src="/brand/logo-icon.png" alt="" width={28} height={28} className="rounded-lg" />
            </span>
            Match<span className="text-accent">Cars</span>
          </Link>
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            El marketplace de autos usados de Argentina. Comprá directo de particulares y agencias verificadas, sin
            vueltas.
          </p>

          <div className="flex gap-2.5">
            <SocialIcon href={INSTAGRAM_URL} label="Instagram">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
              </svg>
            </SocialIcon>
            <SocialIcon href={FACEBOOK_URL} label="Facebook">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M15 8.5h-2a1.5 1.5 0 0 0-1.5 1.5v2h3.3l-.5 3H11.5V21H8.5v-6H6.5v-3h2V9.7C8.5 7.1 9.9 5.5 12.7 5.5H15v3Z" />
              </svg>
            </SocialIcon>
            <SocialIcon href={CONTACT_MAILTO} label="Contacto por mail">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="5" width="18" height="14" rx="3" />
                <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </SocialIcon>
          </div>

          <div className="flex gap-2">
            <a
              href={APPLE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-bold text-background transition hover:opacity-85"
            >
              🍏 App Store
            </a>
            <a
              href={PLAY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-bold text-background transition hover:opacity-85"
            >
              🤖 Google Play
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Explorar</p>
          <Link href="/" className="text-sm hover:text-accent">
            Autos en venta
          </Link>
          <Link href="/agencias" className="text-sm hover:text-accent">
            Agencias
          </Link>
          <Link href="/comparar" className="text-sm hover:text-accent">
            Comparar autos
          </Link>
          <Link href="/tasador" className="text-sm hover:text-accent">
            Tasador gratis
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Para agencias</p>
          <a href={PORTAL_URL} className="text-sm hover:text-accent">
            Portal de Agencias
          </a>
          <a href={`${PORTAL_URL}/planes`} className="text-sm hover:text-accent">
            Ver planes
          </a>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ayuda</p>
          <Link href="/terminos" className="text-sm hover:text-accent">
            Términos y condiciones
          </Link>
          <Link href="/privacidad" className="text-sm hover:text-accent">
            Privacidad
          </Link>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-5 text-xs text-muted-foreground">
          © {new Date().getFullYear()} MatchCars
        </div>
      </div>
    </footer>
  );
}
