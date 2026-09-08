import { listAgencies } from "@/lib/agencies";
import { listAllVehicleIds } from "@/lib/vehicles";
import type { Metadata } from "next";
import Link from "next/link";

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || "https://portal.matchcars.app";
const APP_BASE_URL = "https://matchcars.app";

// Landing estable — se revalida cada hora.
export const revalidate = 3600;

const display = "[font-family:var(--font-sora)]";

export const metadata: Metadata = {
  title: "Portal de Agencias — publicá y gestioná tu stock",
  description:
    "El software para agencias de autos usados en Argentina: publicá tu stock en MatchCars, gestioná leads y ventas, sumá a tu equipo y hacé seguimiento postventa. Todo desde un lugar.",
  alternates: { canonical: "/para-agencias" },
  openGraph: {
    title: "Portal de Agencias de MatchCars",
    description: "Publicá tu stock, gestioná leads y ventas, y hacé crecer tu agencia.",
    url: "/para-agencias",
    siteName: "Matchcars",
    locale: "es_AR",
    type: "website",
  },
};

const FEATURES = [
  {
    title: "Control total del stock",
    body: "Cargás tus autos una vez y aparecen al instante en la app y en la web de MatchCars, frente a miles de compradores.",
    icon: (
      <path d="M3 3v18h18M7 14l4-4 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    title: "Gestión comercial",
    body: "Leads ordenados por etapa, ventas mes a mes, comisiones automáticas y roles para cada persona de tu equipo.",
    icon: (
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    title: "Conexión y postventa",
    body: "Conectás con otras agencias del sector y llevás un seguimiento postventa impecable para fidelizar a tus clientes.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" strokeLinecap="round" />
      </>
    ),
  },
];

const STEPS = [
  { n: "1", title: "Creá tu cuenta", body: "Elegís un plan y en minutos tenés el portal listo para tu agencia." },
  { n: "2", title: "Cargá tu stock", body: "Subís tus autos con fotos y ficha técnica. Se publican en la app y en la web." },
  { n: "3", title: "Gestioná y vendé", body: "Recibís consultas, seguís cada lead, cerrás ventas y medís todo desde el panel." },
];

const FAQ = [
  {
    q: "¿Mis autos aparecen en la web y en la app?",
    a: "Sí. Cargás el stock una sola vez desde el portal y se publica automáticamente en matchcars.app y en la app de MatchCars, con tu ficha de agencia verificada.",
  },
  {
    q: "¿Cuánto cuesta?",
    a: "Hay distintos planes según el tamaño de tu agencia y las funciones que necesites. Podés ver el detalle y los precios en la página de planes.",
  },
  {
    q: "¿Sirve si tengo pocos autos?",
    a: "Sí. Incluso con una unidad te conviene: ganás visibilidad, las consultas quedan registradas y tenés el historial de cada operación.",
  },
  {
    q: "¿Puedo sumar a mi equipo?",
    a: "Sí. Invitás a tus vendedores, les asignás roles y permisos por sección, y el portal calcula las comisiones de cada venta automáticamente.",
  },
  {
    q: "¿Cómo cargo el stock si ya lo tengo en otro lado?",
    a: "Podés cargarlo manualmente o importarlo. Si tenés muchas unidades, te ayudamos con la importación inicial.",
  },
];

export default async function ParaAgenciasPage() {
  const [{ agencies }, vehicleIds] = await Promise.all([listAgencies(), listAllVehicleIds()]);
  const agencyCount = agencies.length;
  const vehicleCount = vehicleIds.length;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        name: "Portal de Agencias de MatchCars",
        serviceType: "Software de gestión para agencias de autos",
        provider: { "@type": "Organization", name: "MatchCars", url: APP_BASE_URL },
        areaServed: "AR",
        url: `${APP_BASE_URL}/para-agencias`,
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <div className="w-full">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-14 md:py-20 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className={`${display} text-sm font-bold uppercase tracking-[0.14em] text-accent`}>Portal de Agencias</p>
          <h1 className={`${display} mt-4 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]`}>
            Todo tu negocio de autos,{" "}
            <span className="relative whitespace-nowrap text-accent">
              conectado
              <span className="absolute inset-x-0 -bottom-1 h-3 rounded-full bg-accent/25" aria-hidden />
            </span>
            .
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Publicá tu stock, gestioná tus leads y hacé crecer tu agencia desde un solo lugar. La app, la web y el
            portal, unidos en un mismo ecosistema.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={`${PORTAL_URL}/planes`}
              className="rounded-full bg-accent px-7 py-3.5 text-base font-bold text-accent-foreground shadow-[5px_5px_0_rgba(37,99,235,0.15)] transition hover:-translate-y-0.5"
            >
              Sumá tu agencia →
            </a>
            <a
              href="#como-funciona"
              className="rounded-full border-2 border-foreground px-6 py-3.5 text-base font-bold transition hover:bg-foreground hover:text-background"
            >
              Ver cómo funciona
            </a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            ¿Ya tenés cuenta?{" "}
            <a href={PORTAL_URL} className="font-semibold text-accent underline-offset-2 hover:underline">
              Ingresá al portal →
            </a>
          </p>
          {(agencyCount > 0 || vehicleCount > 0) && (
            <p className="mt-6 text-sm text-muted-foreground">
              {agencyCount > 0 && <span className="font-semibold text-foreground">{agencyCount} agencias</span>}
              {agencyCount > 0 && vehicleCount > 0 && " · "}
              {vehicleCount > 0 && (
                <>
                  <span className="font-semibold text-foreground">
                    {vehicleCount >= 100 ? `${Math.floor(vehicleCount / 100) * 100}+` : vehicleCount}
                  </span>{" "}
                  autos publicados
                </>
              )}
            </p>
          )}
        </div>

        {/* Ecosistema */}
        <div className="rounded-3xl bg-[#171b24] p-8 shadow-2xl sm:p-10">
          <h2 className={`${display} text-xl font-bold text-white`}>Un ecosistema, tres accesos</h2>
          <div className="mt-7 flex flex-col gap-3">
            {[
              { lbl: "App", sub: "Tus autos en el bolsillo", final: false, icon: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" strokeLinecap="round" /></> },
              { lbl: "Web", sub: "Visible para más compradores", final: false, icon: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M9 20h6M12 17v3" strokeLinecap="round" /></> },
              { lbl: "Portal de Agencias", sub: "Todo tu negocio, en un lugar", final: true, icon: <path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6" strokeLinecap="round" strokeLinejoin="round" /> },
            ].map((it, i) => (
              <div key={it.lbl}>
                {i > 0 && <div className="py-1 text-center text-lg leading-none text-accent">↓</div>}
                <div
                  className={`flex items-center gap-5 rounded-2xl border p-5 ${
                    it.final ? "border-accent bg-accent" : "border-white/12 bg-white/[0.06]"
                  }`}
                >
                  <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${it.final ? "bg-white/20" : "bg-white/10"}`}>
                    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#fff" strokeWidth={2}>
                      {it.icon}
                    </svg>
                  </span>
                  <span className={`${display} font-bold text-white`}>
                    <span className="text-lg">{it.lbl}</span>
                    <span className={`block text-sm font-normal ${it.final ? "text-white/90" : "text-white/60"}`}>{it.sub}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features strip */}
      <section className="bg-[#171b24] px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-12 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex flex-col gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="#fff" strokeWidth={2}>
                  {f.icon}
                </svg>
              </span>
              <h3 className={`${display} text-xl font-bold text-white`}>{f.title}</h3>
              <p className="leading-relaxed text-white/60">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="mx-auto max-w-5xl scroll-mt-20 px-6 py-20">
        <h2 className={`${display} text-center text-3xl font-extrabold tracking-tight`}>Cómo funciona</h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-border bg-card p-6">
              <span className={`${display} flex h-10 w-10 items-center justify-center rounded-full bg-accent text-lg font-extrabold text-accent-foreground`}>
                {s.n}
              </span>
              <h3 className={`${display} mt-4 text-lg font-bold`}>{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 pb-20">
        <h2 className={`${display} text-center text-3xl font-extrabold tracking-tight`}>Preguntas frecuentes</h2>
        <div className="mt-10 flex flex-col gap-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-border bg-card p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {f.q}
                <span className="text-muted-foreground transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="bg-foreground px-6 py-20 text-background">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className={`${display} text-3xl font-extrabold tracking-tight sm:text-4xl`}>
            Sumá tu agencia a MatchCars
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-background/70">
            Creá tu cuenta, cargá tu stock y empezá a recibir consultas hoy mismo.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href={`${PORTAL_URL}/planes`}
              className="rounded-full bg-accent px-7 py-3.5 text-base font-bold text-accent-foreground transition hover:opacity-90"
            >
              Ver planes y crear cuenta →
            </a>
            <a
              href={PORTAL_URL}
              className="rounded-full border-2 border-background/40 px-6 py-3.5 text-base font-bold transition hover:border-background"
            >
              Ya tengo cuenta
            </a>
          </div>
          <p className="mt-6 text-sm text-background/60">
            ¿Dudas? Escribinos a{" "}
            <a href="mailto:matchcarsinfo@gmail.com" className="underline">
              matchcarsinfo@gmail.com
            </a>
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6 py-8 text-center">
        <Link href="/agencias" className="text-sm font-semibold text-accent">
          Ver las agencias que ya publican en MatchCars →
        </Link>
      </div>
    </div>
  );
}
