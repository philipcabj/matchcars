// portal/src/app/dashboard/stock/page.tsx
"use client";

import { ThousandsInput } from "@/components/ThousandsInput";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencyMe } from "@/hooks/useAgencyMe";
import { parseJsonResponse } from "@/lib/api-client";
import { STATUS_BAR_COLOR, STATUS_LABELS, VehicleListItem } from "@/lib/vehicle";
import Link from "next/link";
import { useMemo, useState, useEffect, useCallback } from "react";

interface StockViewFilters {
  statusFilter: string;
  agingFilter: string;
  sort: string;
  search: string;
  priceMin: string;
  priceMax: string;
}

interface StockView {
  id: string;
  name: string;
  filters: StockViewFilters;
}

type StatusFilter = "all" | "available" | "paused" | "pending_review" | "reserved" | "a_preparar" | "sold" | "rejected" | "deleted";
type SortOption = "recent" | "price_desc" | "price_asc" | "name" | "aging";
type AgingFilter = "all" | "green" | "yellow" | "red";

// Semáforo de antigüedad en stock — mismos cortes en toda la pantalla (fila
// y filtro), pedidos explícitamente: verde <30 días, amarillo 30-60, rojo >60.
function agingBucket(days: number | null): AgingFilter {
  if (days === null) return "all";
  if (days > 60) return "red";
  if (days >= 30) return "yellow";
  return "green";
}

const AGING_DOT_COLOR: Record<Exclude<AgingFilter, "all">, string> = {
  green: "bg-success",
  yellow: "bg-amber-500",
  red: "bg-error",
};

const AGING_LABEL: Record<AgingFilter, string> = {
  all: "Cualquier antigüedad",
  green: "Menos de 30 días",
  yellow: "Entre 30 y 60 días",
  red: "Más de 60 días",
};

const FILTER_DEFS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "available", label: "Publicados" },
  { key: "paused", label: "Pausados" },
  { key: "pending_review", label: "En revisión" },
  { key: "reserved", label: "Reservados" },
  { key: "a_preparar", label: "A preparar" },
  { key: "sold", label: "Vendidos" },
  { key: "rejected", label: "Rechazados" },
  { key: "deleted", label: "Eliminados" },
];

const REJECTED_STATUSES = ["rejected", "rejected_limit", "blocked"];
const ACTIVE_STATUSES = ["available", "pending_review", "reserved"]; // cuentan para "valor de inventario"

// "Pausado" no es un status propio hoy — es available + published:false. Se
// distingue de "available" (publicado de verdad) solo para filtrar/contar,
// nunca se escribe un status distinto para esto (ver PATCH .../visibility).
function matchesFilter(v: VehicleListItem, filter: StatusFilter) {
  const status = v.status ?? "available";
  if (filter === "all") return true;
  if (filter === "rejected") return REJECTED_STATUSES.includes(status);
  if (filter === "available") return status === "available" && v.published !== false;
  if (filter === "paused") return status === "available" && v.published === false;
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

function sumByCurrency(vehicles: VehicleListItem[], field: "price" | "margin" | "purchasePrice"): { ars: number; usd: number } {
  return vehicles.reduce(
    (acc, v) => {
      const value = field === "price" ? v.price : field === "margin" ? v.margin : v.purchasePrice;
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
      <ThousandsInput
        autoFocus
        value={price}
        onChange={setPrice}
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
  const [agingFilter, setAgingFilter] = useState<AgingFilter>("all");
  const [sort, setSort] = useState<SortOption>("recent");
  const [search, setSearch] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [views, setViews] = useState<StockView[]>([]);
  const [showPriceRange, setShowPriceRange] = useState(false);

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

  const loadViews = useCallback(async () => {
    try {
      const token = await getIdToken();
      const res = await fetch("/api/agency/stock-views", { headers: { Authorization: `Bearer ${token}` } });
      const data = await parseJsonResponse<{ views: StockView[] }>(res);
      setViews(data.views);
    } catch {
      // silencioso — las vistas guardadas son una comodidad, no algo crítico
    }
  }, [getIdToken]);

  useEffect(() => {
    (async () => {
      await loadViews();
    })();
  }, [loadViews]);

  const applyView = (v: StockView) => {
    setStatusFilter(v.filters.statusFilter as StatusFilter);
    setAgingFilter(v.filters.agingFilter as AgingFilter);
    setSort(v.filters.sort as SortOption);
    setSearch(v.filters.search);
    setPriceMin(v.filters.priceMin);
    setPriceMax(v.filters.priceMax);
    setShowPriceRange(!!(v.filters.priceMin || v.filters.priceMax));
  };

  const saveCurrentView = async () => {
    const name = prompt("Nombre para esta vista (ej. \"Autos viejos sin vender\"):");
    if (!name?.trim()) return;
    try {
      const token = await getIdToken();
      const filters: StockViewFilters = { statusFilter, agingFilter, sort, search, priceMin, priceMax };
      const res = await fetch("/api/agency/stock-views", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim(), filters }),
      });
      await parseJsonResponse(res);
      await loadViews();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
  };

  const deleteView = async (id: string) => {
    try {
      const token = await getIdToken();
      await fetch(`/api/agency/stock-views/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setViews((prev) => prev.filter((v) => v.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
  };

  const filtered = useMemo(() => {
    if (!vehicles) return [];
    const min = priceMin ? Number(priceMin) : null;
    const max = priceMax ? Number(priceMax) : null;
    const list = vehicles.filter(
      (v) =>
        matchesFilter(v, statusFilter) &&
        (min === null || (v.price ?? 0) >= min) &&
        (max === null || (v.price ?? 0) <= max) &&
        matchesSearch(v, search) &&
        (agingFilter === "all" || agingBucket(daysInStock(v.createdAt)) === agingFilter)
    );
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
      case "aging":
        sorted.sort((a, b) => (daysInStock(b.createdAt) ?? -1) - (daysInStock(a.createdAt) ?? -1));
        break;
      default:
        sorted.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    }
    return sorted;
  }, [vehicles, statusFilter, agingFilter, sort, search, priceMin, priceMax]);

  const countFor = (filter: StatusFilter) => (vehicles ? vehicles.filter((v) => matchesFilter(v, filter)).length : 0);

  // Distribución por estado (para el dashboard) — a diferencia de countFor
  // (que agrupa "rejected"/"rejected_limit"/"blocked" en un solo filtro),
  // acá se muestra cada status real tal cual está en el dato, para no
  // esconder la diferencia entre un rechazo de moderación y un bloqueo.
  const byStatus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of vehicles ?? []) {
      const status = v.status ?? "available";
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [vehicles]);

  const inventory = useMemo(() => {
    const active = (vehicles ?? []).filter((v) => ACTIVE_STATUSES.includes(v.status ?? "available"));
    const withCost = active.filter((v) => typeof v.purchasePrice === "number");
    const agingDays = active.map((v) => daysInStock(v.createdAt)).filter((d): d is number => d !== null);
    const avgAging = agingDays.length > 0 ? Math.round(agingDays.reduce((a, b) => a + b, 0) / agingDays.length) : null;
    return {
      count: active.length,
      value: sumByCurrency(active, "price"),
      invested: sumByCurrency(active, "margin"),
      cost: sumByCurrency(withCost, "purchasePrice"),
      costCoverage: { withCost: withCost.length, total: active.length },
      avgAging,
    };
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

  // Pausar/republicar — individual y en lote. Solo afecta autos ya
  // aprobados (status:"available"); el endpoint devuelve 400 para el resto,
  // así que se filtran acá antes de mandar el pedido.
  const setVisibility = async (ids: string[], published: boolean) => {
    const token = await getIdToken();
    const eligible = ids.filter((id) => vehicles?.find((v) => v.id === id)?.status === "available");
    if (eligible.length === 0) return;
    await Promise.all(
      eligible.map((id) =>
        fetch(`/api/agency/vehicles/${id}/visibility`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ published }),
        })
      )
    );
    setVehicles((prev) => (prev ?? []).map((v) => (eligible.includes(v.id) ? { ...v, published } : v)));
  };

  const bulkSetVisibility = async (published: boolean) => {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    try {
      await setVisibility(Array.from(selected), published);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBulkDeleting(false);
    }
  };

  const bulkChangePrice = async () => {
    if (selected.size === 0) return;
    const rawCurrency = prompt(`Moneda para ${selected.size} auto${selected.size === 1 ? "" : "s"} seleccionado${selected.size === 1 ? "" : "s"} — escribí ARS o USD:`, "ARS");
    if (rawCurrency === null) return;
    const currency = rawCurrency.trim().toUpperCase() === "USD" ? "USD" : "ARS";
    const raw = prompt(`Nuevo precio en ${currency} para los ${selected.size} seleccionados (mismo precio para todos):`);
    if (raw === null) return;
    const price = Number(raw);
    if (!price || price <= 0) {
      setError("Ingresá un precio válido.");
      return;
    }
    setBulkDeleting(true);
    try {
      const token = await getIdToken();
      const ids = Array.from(selected);
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/agency/vehicles/${id}/price`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ price, currency }),
          })
        )
      );
      setVehicles((prev) => (prev ?? []).map((v) => (ids.includes(v.id) ? { ...v, price, currency } : v)));
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div
        className="sticky top-0 z-10 -mx-6 -mt-6 flex flex-col gap-4 border-b border-border bg-background px-6 pb-4 pt-6"
        style={{ willChange: "transform" }}
      >
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
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={agingFilter}
                  onChange={(e) => setAgingFilter(e.target.value as AgingFilter)}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                  title="Filtrar por antigüedad"
                >
                  {(Object.keys(AGING_LABEL) as AgingFilter[]).map((k) => (
                    <option key={k} value={k}>
                      {AGING_LABEL[k]}
                    </option>
                  ))}
                </select>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortOption)}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                >
                  <option value="recent">Más reciente</option>
                  <option value="aging">Más antiguo primero</option>
                  <option value="price_desc">Precio: mayor a menor</option>
                  <option value="price_asc">Precio: menor a mayor</option>
                  <option value="name">Marca / modelo (A-Z)</option>
                </select>
                <button
                  type="button"
                  onClick={() => setShowPriceRange((s) => !s)}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                    showPriceRange || priceMin || priceMax ? "border-accent bg-accent/10 text-accent" : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  Rango de precio
                </button>
                {showPriceRange && (
                  <>
                    <ThousandsInput
                      value={priceMin}
                      onChange={setPriceMin}
                      placeholder="Mín."
                      className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">a</span>
                    <ThousandsInput
                      value={priceMax}
                      onChange={setPriceMax}
                      placeholder="Máx."
                      className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                    />
                    {(priceMin || priceMax) && (
                      <button
                        type="button"
                        onClick={() => {
                          setPriceMin("");
                          setPriceMax("");
                        }}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        Limpiar
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {(views.length > 0 || search || statusFilter !== "all" || agingFilter !== "all" || priceMin || priceMax) && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {views.map((v) => (
                  <span key={v.id} className="flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1">
                    <button type="button" onClick={() => applyView(v)} className="font-semibold hover:text-accent">
                      {v.name}
                    </button>
                    <button type="button" onClick={() => deleteView(v.id)} title="Borrar vista" className="text-muted-foreground hover:text-error">
                      ×
                    </button>
                  </span>
                ))}
                <button type="button" onClick={saveCurrentView} className="font-semibold text-accent hover:underline">
                  + Guardar vista actual
                </button>
              </div>
            )}

            {selected.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/40 bg-accent/5 px-3 py-2">
                <p className="text-sm font-semibold">{selected.size} seleccionado{selected.size === 1 ? "" : "s"}</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setSelected(new Set())} className="text-xs font-semibold text-muted-foreground">
                    Cancelar
                  </button>
                  <button
                    onClick={() => bulkSetVisibility(true)}
                    disabled={bulkDeleting}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                    title="Solo afecta a los ya aprobados de la selección"
                  >
                    Republicar
                  </button>
                  <button
                    onClick={() => bulkSetVisibility(false)}
                    disabled={bulkDeleting}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                    title="Solo afecta a los ya aprobados de la selección"
                  >
                    Pausar
                  </button>
                  <button
                    onClick={bulkChangePrice}
                    disabled={bulkDeleting}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    Cambiar precio
                  </button>
                  <button onClick={bulkDelete} disabled={bulkDeleting} className="rounded-lg bg-error px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                    {bulkDeleting ? "Aplicando…" : "Eliminar"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {inventory.count > 0 && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Autos activos</p>
              <p className="text-base font-bold">{inventory.count}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Antigüedad promedio</p>
              <p className="text-base font-bold">{inventory.avgAging !== null ? `${inventory.avgAging} días` : "—"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Valor de venta del stock</p>
              <p className="text-base font-bold">{fmtMoney(inventory.value.ars, inventory.value.usd)}</p>
            </div>
            {(inventory.cost.ars !== 0 || inventory.cost.usd !== 0) && (
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">
                  Valor a costo
                  {inventory.costCoverage.withCost < inventory.costCoverage.total && (
                    <span className="ml-1 text-muted-foreground/70">
                      ({inventory.costCoverage.withCost}/{inventory.costCoverage.total})
                    </span>
                  )}
                </p>
                <p className="text-base font-bold">{fmtMoney(inventory.cost.ars, inventory.cost.usd)}</p>
              </div>
            )}
            {(inventory.invested.ars !== 0 || inventory.invested.usd !== 0) && (
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">Margen estimado del stock</p>
                <p className="text-base font-bold">{fmtMoney(inventory.invested.ars, inventory.invested.usd)}</p>
              </div>
            )}
          </div>

          {byStatus.length > 1 && (
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="mb-2 text-xs text-muted-foreground">Distribución por estado</p>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-background">
                {byStatus.map(([status, count]) => (
                  <div
                    key={status}
                    title={`${STATUS_LABELS[status]?.label ?? status}: ${count}`}
                    className={STATUS_BAR_COLOR[status] ?? "bg-muted-foreground"}
                    style={{ width: `${(count / (vehicles?.length || 1)) * 100}%` }}
                  />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {byStatus.map(([status, count]) => (
                  <span key={status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`h-2 w-2 rounded-full ${STATUS_BAR_COLOR[status] ?? "bg-muted-foreground"}`} />
                    {STATUS_LABELS[status]?.label ?? status} ({count})
                  </span>
                ))}
              </div>
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

      <div className="relative z-0 flex flex-col gap-2">
        {filtered.map((v) => {
          const isPaused = v.status === "available" && v.published === false;
          const statusInfo = isPaused
            ? { label: "Pausado", className: "bg-amber-500/15 text-amber-600" }
            : STATUS_LABELS[v.status ?? "available"] ?? { label: v.status, className: "bg-muted/20 text-muted-foreground" };
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
                    {days !== null && ACTIVE_STATUSES.includes(v.status ?? "available") && (
                      <span className="flex items-center gap-1">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${AGING_DOT_COLOR[agingBucket(days) as Exclude<AgingFilter, "all">]}`}
                          title={`${days} días en stock`}
                        />
                        {fmtDate(v.createdAt)}
                      </span>
                    )}
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
              {v.status === "available" && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setVisibility([v.id], isPaused);
                  }}
                  title={isPaused ? "Republicar" : "Pausar sin eliminar"}
                  className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:border-accent"
                >
                  {isPaused ? "▶" : "⏸"}
                </button>
              )}
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusInfo.className}`}>{statusInfo.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
