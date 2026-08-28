// portal/src/app/dashboard/costos/ResumenTab.tsx
// KPIs de rentabilidad calculados en el cliente a partir del mismo payload
// de VentasCerradasTab (GET /api/agency/costos) — el % de margen (margen /
// precio de venta) es agnóstico de moneda, así que promedio/mejor/peor/
// evolución mensual se pueden comparar entre ventas en ARS y USD sin
// mezclar montos absolutos.
"use client";

import { useMemo } from "react";
import type { CostoEntry } from "./types";

interface Scored {
  entry: CostoEntry;
  pct: number;
}

function label(e: CostoEntry): string {
  if (!e.vehicleSnapshot) return "Auto";
  return `${e.vehicleSnapshot.brand ?? ""} ${e.vehicleSnapshot.model ?? ""} ${e.vehicleSnapshot.year ?? ""}`.trim();
}

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "short", year: "2-digit" });
}

export function ResumenTab({ entries }: { entries: CostoEntry[] }) {
  const scored: Scored[] = useMemo(
    () =>
      entries
        .filter((e): e is CostoEntry & { margin: number } => e.margin != null && e.dealPrice > 0)
        .map((e) => ({ entry: e, pct: (e.margin! / e.dealPrice) * 100 })),
    [entries]
  );

  const avgPct = scored.length > 0 ? scored.reduce((a, s) => a + s.pct, 0) / scored.length : null;
  const best = scored.length > 0 ? scored.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  const worst = scored.length > 0 ? scored.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;
  const coverage = { withCost: scored.length, total: entries.length };

  const monthly = useMemo(() => {
    const byMonth = new Map<string, { sum: number; count: number }>();
    for (const s of scored) {
      if (!s.entry.soldAt) continue;
      const key = monthKey(s.entry.soldAt);
      const acc = byMonth.get(key) ?? { sum: 0, count: 0 };
      acc.sum += s.pct;
      acc.count += 1;
      byMonth.set(key, acc);
    }
    return Array.from(byMonth.entries())
      .map(([key, acc]) => ({ key, avgPct: acc.sum / acc.count }))
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-12);
  }, [scored]);

  const maxAbsPct = Math.max(1, ...monthly.map((m) => Math.abs(m.avgPct)));

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay ventas cerradas para resumir.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">
            Margen promedio
            {coverage.withCost < coverage.total && (
              <span className="ml-1 text-muted-foreground/70">
                ({coverage.withCost}/{coverage.total})
              </span>
            )}
          </p>
          <p className="text-base font-bold">{avgPct != null ? `${avgPct.toFixed(1)}%` : "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Mejor auto</p>
          <p className="truncate text-base font-bold text-success">{best ? `${label(best.entry)} · ${best.pct.toFixed(1)}%` : "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Peor auto</p>
          <p className={`truncate text-base font-bold ${worst && worst.pct < 0 ? "text-error" : ""}`}>
            {worst ? `${label(worst.entry)} · ${worst.pct.toFixed(1)}%` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Ventas cerradas</p>
          <p className="text-base font-bold">{entries.length}</p>
        </div>
      </div>

      {monthly.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-xs font-semibold text-muted-foreground">Evolución del margen promedio (% sobre precio de venta)</p>
          <div className="flex flex-col gap-2">
            {monthly.map((m) => (
              <div key={m.key} className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-xs text-muted-foreground">{monthLabel(m.key)}</span>
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-background">
                  <div
                    className={`h-full rounded-full ${m.avgPct >= 0 ? "bg-success" : "bg-error"}`}
                    style={{ width: `${Math.min(100, (Math.abs(m.avgPct) / maxAbsPct) * 100)}%` }}
                  />
                </div>
                <span className={`w-14 shrink-0 text-right text-xs font-semibold ${m.avgPct >= 0 ? "text-success" : "text-error"}`}>
                  {m.avgPct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
