// portal/src/app/dashboard/plans/page.tsx
// Vista informativa de los planes — no se contratan ni gestionan acá (eso
// sigue siendo exclusivo de la app vía RevenueCat/App Store/Google Play).
// Solo para que el dealer pueda ver qué incluye cada plan y comparar sin
// salir del portal.
"use client";

import { useAgencyMe } from "@/hooks/useAgencyMe";
import { FREE_PLAN, PLAN_PRICING } from "@/lib/plan-pricing";

const APPLE_URL = "https://apps.apple.com/ar/app/matchcars/id6757968664";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.matchcars.app";

function fmtUsd(n: number): string {
  return `USD ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PlansPage() {
  const { data: agency } = useAgencyMe();
  const currentPlanId = agency?.plan?.includes("pro_dealer")
    ? "pro_dealer"
    : agency?.plan?.includes("pro_plus")
      ? "pro_plus"
      : agency?.plan?.includes("pro")
        ? "pro"
        : "free";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Planes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Los planes se contratan y gestionan desde la app de MatchCars, no desde acá — esta pantalla es solo para comparar qué incluye cada uno.
        </p>
      </div>

      <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4 text-sm">
        Tu plan actual: <span className="font-bold text-accent">{agency?.planLabel ?? "Cargando…"}</span>
        {currentPlanId === "free" && agency && (
          <span className="ml-1 text-muted-foreground">— actualizalo desde la app para desbloquear más funciones.</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          className={`flex flex-col gap-3 rounded-2xl border p-5 ${
            currentPlanId === "free" ? "border-accent ring-2 ring-accent/30" : "border-border"
          }`}
        >
          <div>
            <p className="text-sm font-bold">{FREE_PLAN.title}</p>
            <p className="text-xs text-muted-foreground">{FREE_PLAN.subtitle}</p>
          </div>
          <p className="text-2xl font-extrabold">Gratis</p>
          <ul className="flex flex-1 flex-col gap-1.5 text-xs">
            {FREE_PLAN.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {currentPlanId === "free" && (
            <span className="w-fit rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-foreground">Plan actual</span>
          )}
        </div>

        {PLAN_PRICING.map((plan) => (
          <div
            key={plan.id}
            className={`flex flex-col gap-3 rounded-2xl border p-5 ${
              currentPlanId === plan.id ? "border-accent ring-2 ring-accent/30" : "border-border"
            }`}
            style={{ borderTopColor: plan.color, borderTopWidth: 3 }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold">{plan.title}</p>
                <p className="text-xs text-muted-foreground">{plan.subtitle}</p>
              </div>
              {plan.recommended && (
                <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">Recomendado</span>
              )}
            </div>

            {plan.comingSoon ? (
              <p className="text-lg font-extrabold text-muted-foreground">Próximamente</p>
            ) : (
              <div>
                <p className="text-2xl font-extrabold">
                  {fmtUsd(plan.priceMonthly)}
                  <span className="text-xs font-normal text-muted-foreground"> /mes</span>
                </p>
                <p className="text-xs text-muted-foreground">o {fmtUsd(plan.priceAnnual)} /año</p>
              </div>
            )}

            <ul className="flex flex-1 flex-col gap-1.5 text-xs">
              {plan.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>

            {currentPlanId === plan.id && (
              <span className="w-fit rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-foreground">Plan actual</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-center">
        <p className="text-sm font-semibold">Para contratar o cambiar de plan, hacelo desde la app de MatchCars</p>
        <div className="mx-auto flex w-full max-w-xs gap-2">
          <a
            href={APPLE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-bold text-background transition hover:opacity-90"
          >
            🍏 App Store
          </a>
          <a
            href={PLAY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-bold text-background transition hover:opacity-90"
          >
            🤖 Google Play
          </a>
        </div>
      </div>
    </div>
  );
}
