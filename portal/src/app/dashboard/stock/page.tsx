// portal/src/app/dashboard/stock/page.tsx
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useAgencyMe } from "@/hooks/useAgencyMe";
import { parseJsonResponse } from "@/lib/api-client";
import { STATUS_LABELS, VehicleListItem } from "@/lib/vehicle";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";

type StatusFilter = "all" | "available" | "pending_review" | "reserved" | "a_preparar" | "sold" | "rejected" | "deleted";
type SortOption = "recent" | "price_desc" | "price_asc" | "name";

const FILTER_DEFS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "available", label: "Publicados" },
  { key: "pending_review", label: "En revisión" },
  { key: "reserved", label: "Reservados" },
  { key: "a_preparar", label: "A preparar" },
  { key: "sold", label: "Vendidos" },
  { key: "rejected", label: "Rechazados" },
  { key: "deleted", label: "Eliminados" },
];

const REJECTED_STATUSES = ["rejected", "rejected_limit", "blocked"];
const ACTIVE_STATUSES = ["available", "pending_review", "reserved"]; // cuentan para "valor de inventario"

function matchesFilter(status: string, filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "rejected") return REJECTED_STATUSES.includes(status);
  return status === filter;
}

function matchesSearch(v: VehicleListItem, q: string) {
  if (!q) return true;
  const haystack = `${v.brand ?? ""} ${v.model ?? ""} ${v.version ?? ""} ${v.licensePlate ?? ""} ${v.publicationCode ?? ""}`.toLowerCase();
  return haystack.includes(q.toLowerCase());
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  return `Hace ${days} días`;
}

function daysInStock(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

function sumByCurrency(vehicles: VehicleListItem[], field: "price" | "margin"): { ars: number; usd: number } {
  return vehicles.reduce(
    (acc, v) => {
      const value = field === "price" ? v.price : v.margin;
      if (typeof value !== "number") return acc;
      if (v.currency === "USD") acc.usd += value;
      else acc.ars += value;
      return acc;
    },
    { ars: 0, usd: 0 }
  );
}

function fmtMoney(ars: number, usd: number): string {
  const parts: string[] = [];
  if (ars !== 0) parts.push(`ARS ${ars.toLocaleString("es-AR")}`);
  if (usd !== 0) parts.push(`USD ${usd.toLocaleString("es-AR")}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function PriceEditor({ vehicle, onSaved }: { vehicle: VehicleListItem; onSaved: (price: number, currency: string) => void }) {
  const { getIdToken } = useAuth();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(vehicle.price ?? ""));
  const [currency, setCurrency] = useState(vehicle.currency ?? "ARS");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const num = Number(price);
    if (!num || num <= 0) return;
    setSaving(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/vehicles/${vehicle.id}/price`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ price: num, currency }),
      });
      await parseJsonResponse(res);
      onSaved(num, currency);
      setEditing(false);
    } catch {
      // silencioso a propósito — es un control chico inline
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        }}
        className="text-left text-sm font-bold text-accent hover:underline"
        title="Editar precio"
      >
        {vehicle.currency} {vehicle.price?.toLocaleString("es-AR")}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        type="number"
        autoFocus
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        className="w-24 rounded-md border border-accent bg-background px-1.5 py-0.5 text-xs"
      />
      <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-md border border-border bg-background px-1 py-0.5 text-xs">
        <option value="ARS">ARS</option>
        <option value="USD">USD</option>
      </select>
      <button onClick={save} disabled={saving} className="text-xs font-semibold text-success">
        ✓
      </button>
      <button onClick={() => setEditing(false)} className="text-xs text-muted-foreground">
        ✕
      </button>
    </div>
  );
}

export default function StockPage() {
  const { getIdToken } = useAuth();
  const { data: agency } = useAgencyMe();
  const [vehicles, setVehicles] = useState<VehicleListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortOption>("recent");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

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
    const list = vehicles.filter((v) => matchesFilter(v.status ?? "available", statusFilter) && matchesSearch(v, search));
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
  }, [vehicles, statusFilter, sort, search]);

  const countFor = (filter: StatusFilter) => (vehicles ? vehicles.filter((v) => matchesFilter(v.status ?? "available", filter)).length : 0);

  const inventory = useMemo(() => {
    const active = (vehicles ?? []).filter((v) => ACTIVE_STATUSES.includes(v.status ?? "available"));
    return { count: active.length, value: sumByCurrency(active, "price"), invested: sumByCurrency(active, "margin") };
  }, [vehicles]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`¿Eliminar ${selected.size} publicaci${selected.size === 1 ? "ón" : "ones"}? Esta acción no se puede deshacer.`)) return;
    setBulkDeleting(true);
    try {
      const token = await getIdToken();
      const ids = Array.from(selected);
      await Promise.all(
        ids.map((id) => fetch(`/api/agency/vehicles/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }))
      );
      setVehicles((prev) => (prev ?? []).map((v) => (ids.includes(v.id) ? { ...v, status: "deleted" } : v)));
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBulkDeleting(false);
    }
  };

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
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por marca, modelo, patente o código…"
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
            />

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
          </>
        )}
      </div>

      {inventory.count > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Autos activos</p>
            <p className="text-base font-bold">{inventory.count}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Valor de venta del stock</p>
            <p className="text-base font-bold">{fmtMoney(inventory.value.ars, inventory.value.usd)}</p>
          </div>
          {(inventory.invested.ars !== 0 || inventory.invested.usd !== 0) && (
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Margen estimado del stock</p>
              <p className="text-base font-bold">{fmtMoney(inventory.invested.ars, inventory.invested.usd)}</p>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-error">No pudimos cargar tu stock: {error}</p>}
      {!vehicles && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {vehicles?.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Todavía no publicaste ningún auto.
        </p>
      )}
      {vehicles && vehicles.length > 0 && filtered.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Sin autos para este filtro o búsqueda.
        </p>
      )}

      {selected.size > 0 && (
        <div className="sticky top-[7.5rem] z-10 flex items-center justify-between rounded-xl border border-error/40 bg-error/5 px-4 py-2.5">
          <p className="text-sm font-semibold">{selected.size} seleccionado{selected.size === 1 ? "" : "s"}</p>
          <div className="flex gap-2">
            <button onClick={() => setSelected(new Set())} className="text-xs font-semibold text-muted-foreground">
              Cancelar
            </button>
            <button onClick={bulkDelete} disabled={bulkDeleting} className="rounded-lg bg-error px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {bulkDeleting ? "Eliminando…" : "Eliminar seleccionados"}
            </button>
          </div>
        </div>
      )}

      <div className="relative z-0 flex flex-col gap-2">
        {filtered.map((v) => {
          const statusInfo = STATUS_LABELS[v.status ?? "available"] ?? { label: v.status, className: "bg-muted/20 text-muted-foreground" };
          const days = daysInStock(v.createdAt);
          const canDelete = v.status !== "deleted";
          return (
            <div
              key={v.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-accent"
            >
              {canDelete && (
                <input
                  type="checkbox"
                  checked={selected.has(v.id)}
                  onChange={() => toggleSelect(v.id)}
                  className="h-4 w-4 shrink-0 accent-accent"
                />
              )}
              <Link href={`/dashboard/stock/${v.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                <div className="flex w-12 shrink-0 items-center justify-center font-mono text-base font-extrabold text-muted-foreground">
                  {v.publicationCode ? `#${v.publicationCode}` : "—"}
                </div>
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
                  <PriceEditor vehicle={v} onSaved={(price, currency) => setVehicles((prev) => (prev ?? []).map((x) => (x.id === v.id ? { ...x, price, currency } : x)))} />
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {v.km != null && <span>{v.km.toLocaleString("es-AR")} km</span>}
                    {v.licensePlate && <span className="font-mono">{v.licensePlate}</span>}
                    {days !== null && ACTIVE_STATUSES.includes(v.status ?? "available") && <span>{fmtDate(v.createdAt)}</span>}
                  </div>
                  {typeof v.margin === "number" && (
                    <p className={`text-xs font-semibold ${v.margin >= 0 ? "text-success" : "text-error"}`}>
                      Margen: {v.currency} {v.margin.toLocaleString("es-AR")}
                    </p>
                  )}
                </div>
              </Link>
              <Link
                href={`/ficha/${v.id}`}
                target="_blank"
                title="Ficha PDF"
                className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:border-accent"
              >
                📄
              </Link>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusInfo.className}`}>{statusInfo.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
