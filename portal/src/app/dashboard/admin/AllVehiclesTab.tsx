"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { STATUS_LABELS } from "@/lib/vehicle";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface SearchVehicle {
  id: string;
  brand: string;
  model: string;
  version: string;
  year: number | null;
  price: number;
  currency: string;
  coverImage: string;
  status: string;
  userId: string;
  userName: string;
  publicationCode: number | null;
}

const PAGE_SIZE = 10;

// Busca y elimina CUALQUIER publicación (no solo pendientes/reportadas) —
// distinto de ModerationTab (cola de pendientes) y ReportsTab (reportes).
// Admin only: se muestra condicionado a isAdmin en page.tsx, igual que Usuarios.
//
// Carga TODAS las publicaciones no eliminadas una sola vez al entrar
// (ordenadas por código, más recientes primero) y el input de arriba filtra
// en vivo sobre esa lista en memoria — no hace falta re-pegarle al server en
// cada letra, y al eliminar una publicación el filtro/paginado se recalculan
// solos porque salen de la misma lista base (nada de resultados "viejos"
// colgados de una búsqueda anterior).
export function AllVehiclesTab() {
  const { getIdToken } = useAuth();
  const [vehicles, setVehicles] = useState<SearchVehicle[] | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Un solo panel de "motivo" sirve tanto para borrar una fila puntual
  // (deletingIds = [id]) como para el borrado masivo (deletingIds =
  // [...selectedIds]) — mismo motivo aplicado a todas las que tenga adentro.
  const [deletingIds, setDeletingIds] = useState<string[] | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/admin/vehicles/search", { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<{ vehicles: SearchVehicle[] }>(res);
        setVehicles(data.vehicles);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const list = vehicles ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    const codeMatch = q.replace(/^#/, "");
    const asCode = /^\d+$/.test(codeMatch) ? Number(codeMatch) : null;
    return list.filter((v) => {
      if (asCode !== null && v.publicationCode === asCode) return true;
      return `${v.brand} ${v.model} ${v.version} ${v.userName}`.toLowerCase().includes(q);
    });
  }, [vehicles, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allPageSelected = pageItems.length > 0 && pageItems.every((v) => selectedIds.has(v.id));

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageItems.forEach((v) => next.delete(v.id));
      } else {
        pageItems.forEach((v) => next.add(v.id));
      }
      return next;
    });
  };

  const openReasonPanel = (ids: string[]) => {
    setDeletingIds(ids);
    setReason("");
    setReasonError("");
  };

  const confirmDelete = async () => {
    if (!deletingIds || deletingIds.length === 0) return;
    if (!reason.trim()) {
      setReasonError("Ingresá un motivo de eliminación.");
      return;
    }
    setDeleting(true);
    try {
      const token = await getIdToken();
      if (deletingIds.length === 1) {
        const res = await fetch(`/api/admin/vehicles/${deletingIds[0]}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "delete", reason: reason.trim() }),
        });
        await parseJsonResponse(res);
      } else {
        const res = await fetch("/api/admin/vehicles/bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ids: deletingIds, reason: reason.trim() }),
        });
        await parseJsonResponse(res);
      }
      // Sale de la lista base (no solo del resultado filtrado actual) — así
      // no reaparece si se cambia o borra el filtro después.
      const deletedSet = new Set(deletingIds);
      setVehicles((prev) => prev?.filter((v) => !deletedSet.has(v.id)) ?? null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deletingIds.forEach((id) => next.delete(id));
        return next;
      });
      setDeletingIds(null);
      setReason("");
    } catch (e) {
      setReasonError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setDeleting(false);
    }
  };

  if (error) return <p className="text-sm text-error">{error}</p>;
  if (loading) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="flex flex-col gap-4">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1); // el filtro cambió — volver a la primera página, no dejar una vieja fuera de rango
        }}
        placeholder="Filtrar por marca, modelo, vendedor o código (#4821)…"
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {filtered.length} publicaci{filtered.length !== 1 ? "ones" : "ón"}
          {query.trim() && ` de ${vehicles?.length ?? 0} en total`} · página {page} de {totalPages}
        </p>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">{selectedIds.size} seleccionada{selectedIds.size !== 1 ? "s" : ""}</span>
            <button type="button" onClick={() => setSelectedIds(new Set())} className="text-xs font-semibold text-muted-foreground">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => openReasonPanel(Array.from(selectedIds))}
              className="rounded-lg bg-error px-3 py-1.5 text-xs font-bold text-white"
            >
              Eliminar seleccionadas
            </button>
          </div>
        )}
      </div>

      {deletingIds && deletingIds.length > 1 && (
        <div className="flex flex-col gap-2 rounded-lg border border-error/40 bg-error/5 p-3">
          <p className="text-xs font-semibold">Motivo de la eliminación — se aplica a las {deletingIds.length} publicaciones seleccionadas</p>
          {reasonError && <p className="text-xs text-error">{reasonError}</p>}
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (reasonError) setReasonError("");
            }}
            placeholder="Ej: Publicaciones duplicadas / spam…"
            className="min-h-16 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDeletingIds(null);
                setReason("");
                setReasonError("");
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleting}
              className="rounded-lg bg-error px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
            >
              {deleting ? "Eliminando…" : `Confirmar (${deletingIds.length})`}
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 && <p className="text-sm text-muted-foreground">Sin resultados.</p>}

      {pageItems.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={allPageSelected} onChange={toggleAllOnPage} className="h-4 w-4" />
          Seleccionar todas en esta página
        </label>
      )}

      <div className="flex flex-col gap-2">
        {pageItems.map((v) => {
          const statusInfo = STATUS_LABELS[v.status] ?? { label: v.status, className: "bg-muted/20 text-muted-foreground" };
          const isBulkEditingThis = deletingIds?.length === 1 && deletingIds[0] === v.id;
          return (
            <div key={v.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center">
              <input
                type="checkbox"
                checked={selectedIds.has(v.id)}
                onChange={() => toggleOne(v.id)}
                className="h-4 w-4 shrink-0"
              />
              <div className="flex w-14 shrink-0 items-center justify-center font-mono text-lg font-extrabold text-muted-foreground">
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
                  {v.brand} {v.model} {v.version} {v.year ?? ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {v.currency} {v.price.toLocaleString("es-AR")} · Vendedor: {v.userName || v.userId}
                </p>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusInfo.className}`}>
                  {statusInfo.label}
                </span>{" "}
                <Link href={`/dashboard/admin/vehicles/${v.id}`} className="text-[11px] font-semibold text-accent">
                  Ver detalle →
                </Link>
              </div>

              {isBulkEditingThis ? (
                <div className="flex w-full flex-col gap-2 rounded-lg border border-error/40 bg-error/5 p-3 sm:w-72">
                  <p className="text-xs font-semibold">Motivo de la eliminación</p>
                  {reasonError && <p className="text-xs text-error">{reasonError}</p>}
                  <textarea
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      if (reasonError) setReasonError("");
                    }}
                    placeholder="Ej: Publicación duplicada / contenido inapropiado…"
                    className="min-h-14 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDeletingIds(null);
                        setReason("");
                        setReasonError("");
                      }}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={confirmDelete}
                      disabled={deleting}
                      className="rounded-lg bg-error px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {deleting ? "Eliminando…" : "Confirmar"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openReasonPanel([v.id])}
                  className="shrink-0 rounded-lg border border-error px-4 py-2 text-xs font-bold text-error"
                >
                  Eliminar publicación
                </button>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span className="text-xs text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
