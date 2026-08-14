// portal/src/app/dashboard/reports/page.tsx
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { AgencyReports } from "@/lib/reports";
import { STATUS_BAR_COLOR as BAR_COLOR } from "@/lib/vehicle";
import Link from "next/link";
import { useEffect, useState } from "react";

// Mismo valor que STALE_DAYS_THRESHOLD en api/agency/reports/route.ts — solo
// para el texto explicativo, no cambia el cálculo (ese es 100% server-side).
const STALE_DAYS = 30;

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-2xl font-extrabold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default function ReportsPage() {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<AgencyReports | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/agency/reports", { headers: { Authorization: `Bearer ${token}` } });
        setData(await parseJsonResponse<AgencyReports>(res));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [getIdToken]);

  if (error) return <p className="text-sm text-error">No pudimos cargar los reportes: {error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const maxCount = Math.max(...data.statusBreakdown.map((s) => s.count), 1);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Reportes</h1>
        <p className="mt-1 text-sm text-muted-foreground">Cómo está performando tu stock publicado.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Autos activos" value={data.activeCount} />
        <StatTile label="Vistas totales" value={data.totalViews.toLocaleString("es-AR")} />
        <StatTile label="Me gusta totales" value={data.totalLikes.toLocaleString("es-AR")} />
        <StatTile label="Días prom. en stock" value={data.avgDaysInStock ?? "—"} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="mb-4 text-sm font-semibold">Autos por estado</p>
        <div className="flex flex-col gap-3">
          {data.statusBreakdown.map((s) => (
            <div key={s.status} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{s.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
                <div
                  className={`h-full rounded-full ${BAR_COLOR[s.status] || "bg-muted-foreground"}`}
                  style={{ width: `${Math.max(4, Math.round((s.count / maxCount) * 100))}%` }}
                />
              </div>
              <span className="w-6 shrink-0 text-right text-xs font-semibold">{s.count}</span>
            </div>
          ))}
        </div>
      </div>

      {data.needsAttention.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
          <p className="mb-1 text-sm font-semibold">⚠️ Necesitan atención</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Autos activos que nunca generaron un lead — o tienen bastantes vistas y ninguna consulta (puede ser precio
            o fotos), o llevan más de {STALE_DAYS} días publicados sin movimiento.
          </p>
          <div className="flex flex-col gap-2">
            {data.needsAttention.map((v) => (
              <Link
                key={v.id}
                href={`/dashboard/stock/${v.id}`}
                className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-background"
              >
                <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-background">
                  {v.coverImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.coverImage} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {v.brand} {v.model} {v.year}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {v.currency} {v.price?.toLocaleString("es-AR")}
                  </p>
                </div>
                <p className="shrink-0 text-xs font-semibold text-amber-600">
                  {v.reason === "no_leads_high_views" ? `👁 ${v.views} vistas, 0 leads` : `${v.daysInStock} días sin leads`}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="mb-3 text-sm font-semibold">Más vistos</p>
        {data.topVehicles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay vistas registradas.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.topVehicles.map((v) => (
              <Link
                key={v.id}
                href={`/dashboard/stock/${v.id}`}
                className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-background"
              >
                <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-background">
                  {v.coverImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.coverImage} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {v.brand} {v.model} {v.year}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {v.currency} {v.price?.toLocaleString("es-AR")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                  <span>👁 {v.views}</span>
                  <span>♥ {v.likesCount}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
