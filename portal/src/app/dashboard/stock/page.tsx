// portal/src/app/dashboard/stock/page.tsx
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useAgencyMe } from "@/hooks/useAgencyMe";
import { parseJsonResponse } from "@/lib/api-client";
import { STATUS_LABELS, VehicleListItem } from "@/lib/vehicle";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";

type StatusFilter = "all" | "available" | "pending_review" | "reserved" | "sold" | "rejected" | "deleted";
type SortOption = "recent" | "price_desc" | "price_asc" | "name";

const FILTER_DEFS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "available", label: "Publicados" },
  { key: "pending_review", label: "En revisión" },
  { key: "reserved", label: "Reservados" },
  { key: "sold", label: "Vendidos" },
  { key: "rejected", label: "Rechazados" },
  { key: "deleted", label: "Eliminados" },
];

const REJECTED_STATUSES = ["rejected", "rejected_limit", "blocked"];

function matchesFilter(status: string, filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "rejected") return REJECTED_STATUSES.includes(status);
  return status === filter;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  return `Hace ${days} días`;
}

export default function StockPage() {
  const { getIdToken } = useAuth();
  const { data: agency } = useAgencyMe();
  const [vehicles, setVehicles] = useState<VehicleListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortOption>("recent");

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/agency/vehicles", { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<{ vehicles: VehicleListItem[] }>(res);
        setVehicles(data.vehicles);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [getIdToken]);

  const filtered = useMemo(() => {
    if (!vehicles) return [];
    const list = vehicles.filter((v) => matchesFilter(v.status ?? "available", statusFilter));
    const sorted = [...list];
    switch (sort) {
      case "price_desc":
        sorted.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
        break;
      case "price_asc":
        sorted.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
        break;
      case "name":
        sorted.sort((a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`));
        break;
      default:
        sorted.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    }
    return sorted;
  }, [vehicles, statusFilter, sort]);

  const countFor = (filter: StatusFilter) => (vehicles ? vehicles.filter((v) => matchesFilter(v.status ?? "available", filter)).length : 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-6 -mt-6 flex flex-col gap-4 border-b border-border bg-background px-6 pb-4 pt-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Stock</h1>
          <div className="flex items-center gap-2">
            {agency?.isDealerPlan && agency.myUid === agency.agencyId && (
              <Link
                href="/dashboard/stock/import"
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold"
              >
                Carga masiva (CSV)
              </Link>
            )}
            <Link
              href="/dashboard/stock/new"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
            >
              + Publicar auto
            </Link>
          </div>
        </div>

        {vehicles && vehicles.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {FILTER_DEFS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    statusFilter === f.key ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {f.label} ({countFor(f.key)})
                </button>
              ))}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
            >
              <option value="recent">Más reciente</option>
              <option value="price_desc">Precio: mayor a menor</option>
              <option value="price_asc">Precio: menor a mayor</option>
              <option value="name">Marca / modelo (A-Z)</option>
            </select>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-error">No pudimos cargar tu stock: {error}</p>}
      {!vehicles && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {vehicles?.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Todavía no publicaste ningún auto.
        </p>
      )}
      {vehicles && vehicles.length > 0 && filtered.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Sin autos para este filtro.
        </p>
      )}

      <div className="relative z-0 flex flex-col gap-2">
        {filtered.map((v) => {
          const statusInfo = STATUS_LABELS[v.status ?? "available"] ?? { label: v.status, className: "bg-muted/20 text-muted-foreground" };
          return (
            <Link
              key={v.id}
              href={`/dashboard/stock/${v.id}`}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-3 transition hover:border-accent"
            >
              <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-background">
                {v.coverImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.coverImage} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {v.brand} {v.model} {v.year}
                </p>
                <p className="text-sm font-bold text-accent">
                  {v.currency} {v.price?.toLocaleString("es-AR")}
                </p>
                {v.createdAt && <p className="text-xs text-muted-foreground">{fmtDate(v.createdAt)}</p>}
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusInfo.className}`}>{statusInfo.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
