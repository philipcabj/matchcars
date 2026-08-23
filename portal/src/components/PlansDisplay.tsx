// portal/src/components/PlansDisplay.tsx
// Presentación de planes, compartida entre /dashboard/plans (con sesión —
// muestra el plan actual) y /planes (pública, sin sesión — CTA de descarga
// con QR). Los 3 números (autos/destacados/usuarios) son el único eje real
// de diferenciación; todo lo demás (PORTAL_ITEMS) es idéntico en los 3
// planes pagos, por eso se cuenta una sola vez en la banda "todo incluido"
// en vez de repetirse en cada card — repetirlo 3 veces (versión anterior)
// era justamente lo que hacía sentir la página desordenada.
"use client";

import { Big_Shoulders, IBM_Plex_Mono } from "next/font/google";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { FREE_PLAN, PLAN_PRICING, PORTAL_CAPABILITIES, PORTAL_ITEMS } from "@/lib/plan-pricing";

const display = Big_Shoulders({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-plan-display" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-plan-mono" });

const APPLE_URL = "https://apps.apple.com/ar/app/matchcars/id6757968664";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.matchcars.app";

function fmtUsd(n: number): string {
  return `USD ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function useQrDataUrl(url: string): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, width: 180, color: { dark: "#1C1A16", light: "#FFFFFF" } }).then((d) => {
      if (!cancelled) setDataUrl(d);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return dataUrl;
}

export function PlansDisplay({
  currentPlanId,
  currentPlanLabel,
  showDownloadCta = false,
}: {
  // undefined = todavía cargando (no mostrar banner ni resaltar ninguna
  // card); null = sin plan pago; string = id del plan actual.
  currentPlanId?: string | null;
  currentPlanLabel?: string | null;
  showDownloadCta?: boolean;
}) {
  const appleQr = useQrDataUrl(APPLE_URL);
  const playQr = useQrDataUrl(PLAY_URL);

  return (
    <div className={`${display.variable} ${mono.variable} flex flex-col gap-10`}>
      {/* ---------- Hero ---------- */}
      <div className="mx-auto max-w-xl text-center">
        <span className="inline-block rounded-full bg-accent/10 px-3 py-1 [font-family:var(--font-plan-mono)] text-[11px] font-semibold tracking-widest text-accent uppercase">
          Planes
        </span>
        <h1
          className="mt-3 text-[34px] leading-[0.98] font-extrabold tracking-tight text-balance sm:text-[44px]"
          style={{ fontFamily: "var(--font-plan-display)" }}
        >
          Un portal, tres tamaños
        </h1>
        <p className="mt-2.5 text-[15px] text-muted-foreground">
          El mismo Portal de Agencias completo en los tres — CRM, ventas, comisiones, reportes. Lo único que cambia es
          cuánto stock manejás.
        </p>

        {currentPlanId !== undefined && (
          <div className="mx-auto mt-6 max-w-md rounded-xl border border-border bg-card p-3 text-sm shadow-sm">
            {currentPlanId ? (
              <>
                Tu plan actual: <span className="font-bold text-accent">{currentPlanLabel}</span>
              </>
            ) : (
              <>
                Estás en el plan <span className="font-bold text-accent">Gratis</span> — actualizalo desde la app
                para desbloquear el portal completo.
              </>
            )}
          </div>
        )}
      </div>

      {/* ---------- Banda "todo incluido" (una sola vez) ---------- */}
      <div className="rounded-[20px] border border-border bg-card/60 p-6 sm:p-9">
        <div className="mx-auto mb-6 max-w-md text-center">
          <p className="[font-family:var(--font-plan-mono)] text-[11px] font-semibold tracking-widest text-accent uppercase">
            Incluido en Pro, Pro Plus y Pro Dealer
          </p>
          <h2 className="mt-1 text-[24px] font-extrabold" style={{ fontFamily: "var(--font-plan-display)" }}>
            Portal de Agencias completo
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            No es un extra de los planes grandes — viene entero desde el más chico.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {PORTAL_ITEMS.map((item) => (
            <div key={item.label} className="flex flex-col items-center text-center">
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-[19px]">
                {item.icon}
              </div>
              <p className="text-xs font-semibold">{item.label}</p>
              <p className="text-[11px] text-muted-foreground">{item.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- Cards ---------- */}
      <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-4 rounded-[20px] border border-border bg-card p-6 shadow-sm">
          <div className="min-h-[22px]" />
          <div>
            <p className="text-[22px] font-extrabold leading-none" style={{ fontFamily: "var(--font-plan-display)" }}>
              {FREE_PLAN.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{FREE_PLAN.subtitle}</p>
          </div>
          <div className="flex-1" />
          <p className="[font-family:var(--font-plan-mono)] text-2xl font-semibold">$0</p>
          <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            {FREE_PLAN.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>

        {PLAN_PRICING.map((plan) => {
          const isCurrent = currentPlanId === plan.id;
          return (
            <div
              key={plan.id}
              className={`flex flex-col gap-4 rounded-[20px] border bg-card p-6 shadow-sm ${
                isCurrent
                  ? "border-2 border-accent shadow-lg"
                  : plan.recommended
                    ? "border-accent shadow-lg lg:-translate-y-3.5"
                    : "border-border"
              }`}
            >
              <div className="flex min-h-[22px] items-center gap-1.5">
                {plan.recommended && !isCurrent && (
                  <span className="rounded-full bg-accent px-2.5 py-0.5 [font-family:var(--font-plan-mono)] text-[10px] font-bold text-accent-foreground">
                    Recomendado
                  </span>
                )}
                {isCurrent && (
                  <span className="rounded-full bg-foreground px-2.5 py-0.5 [font-family:var(--font-plan-mono)] text-[10px] font-bold text-background">
                    Tu plan actual
                  </span>
                )}
              </div>

              <div>
                <p className="text-[22px] font-extrabold leading-none" style={{ fontFamily: "var(--font-plan-display)" }}>
                  {plan.title.replace("Plan ", "")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{plan.subtitle}</p>
              </div>

              <div className="flex divide-x divide-border border-y border-border py-3">
                <div className="flex-1 text-center">
                  <span className="block [font-family:var(--font-plan-mono)] text-xl font-semibold tabular-nums">
                    {Number.isFinite(plan.maxCars) ? plan.maxCars : "∞"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">autos</span>
                </div>
                <div className="flex-1 text-center">
                  <span className="block [font-family:var(--font-plan-mono)] text-xl font-semibold tabular-nums">
                    {Number.isFinite(plan.featuredPerMonth) ? plan.featuredPerMonth : "∞"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">destacados/mes</span>
                </div>
                <div className="flex-1 text-center">
                  <span className="block [font-family:var(--font-plan-mono)] text-xl font-semibold tabular-nums">{plan.seats}</span>
                  <span className="text-[10px] text-muted-foreground">usuarios</span>
                </div>
              </div>

              <div>
                <p className="[font-family:var(--font-plan-mono)] text-[26px] font-semibold tabular-nums">
                  {fmtUsd(plan.priceMonthly)} <span className="text-xs font-normal text-muted-foreground">/mes</span>
                </p>
                <p className="text-[11px] text-muted-foreground">o {fmtUsd(plan.priceAnnual)}/año</p>
              </div>

              {showDownloadCta && (
                <a
                  href="#descargar"
                  className={`mt-auto rounded-lg py-2.5 text-center text-[13px] font-bold ${
                    plan.recommended ? "bg-accent text-accent-foreground" : "border border-border text-foreground"
                  }`}
                >
                  Empezar con {plan.title.replace("Plan ", "")}
                </a>
              )}
            </div>
          );
        })}
      </div>

      {/* ---------- Detalle expandible ---------- */}
      <details className="border-t border-border pt-5">
        <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 [font-family:var(--font-plan-mono)] text-xs font-semibold tracking-wide text-accent uppercase [&::-webkit-details-marker]:hidden">
          Ver el detalle completo del portal
          <span aria-hidden>▾</span>
        </summary>
        <div className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {PORTAL_CAPABILITIES.map((cat) => (
            <div key={cat.title} className="rounded-lg border border-accent/40 bg-accent/5 p-4">
              <p className="text-[11px] font-bold tracking-wide text-accent uppercase">{cat.title}</p>
              <ul className="mt-1.5 flex flex-col gap-1 text-xs text-foreground">
                {cat.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>

      {/* ---------- Footer: descarga (público) ---------- */}
      {showDownloadCta && (
        <div id="descargar" className="flex flex-col items-center gap-6 rounded-[20px] bg-foreground p-8 text-background sm:flex-row sm:justify-between">
          <div className="max-w-sm text-center sm:text-left">
            <p className="[font-family:var(--font-plan-mono)] text-[11px] font-semibold tracking-widest text-accent uppercase">
              Para contratar
            </p>
            <h3 className="mt-1.5 text-2xl font-extrabold" style={{ fontFamily: "var(--font-plan-display)" }}>
              Descargá la app de MatchCars
            </h3>
            <p className="mt-1.5 text-[13px] text-background/70">
              Los planes se contratan y gestionan desde la app — creá tu cuenta, elegí tu plan, y entrá al portal
              desde acá con el mismo mail.
            </p>
          </div>
          <div className="flex gap-4">
            <a href={APPLE_URL} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2">
              <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-white p-2">
                {appleQr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={appleQr} alt="Código QR para descargar en App Store" width={80} height={80} />
                ) : (
                  <div className="h-20 w-20 animate-pulse rounded bg-muted/30" />
                )}
              </div>
              <span className="text-[11px] font-semibold text-background/80">🍏 App Store</span>
            </a>
            <a href={PLAY_URL} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2">
              <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-white p-2">
                {playQr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={playQr} alt="Código QR para descargar en Google Play" width={80} height={80} />
                ) : (
                  <div className="h-20 w-20 animate-pulse rounded bg-muted/30" />
                )}
              </div>
              <span className="text-[11px] font-semibold text-background/80">🤖 Google Play</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
