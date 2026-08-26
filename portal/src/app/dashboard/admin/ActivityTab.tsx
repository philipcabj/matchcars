// portal/src/app/dashboard/admin/ActivityTab.tsx
// Feed de actividad de TODA la plataforma para el admin — mismo esqueleto
// que dashboard/team/activity/page.tsx (esa es por agencia), acá agregado
// entre agencias + acciones del propio panel de admin. Ver /api/admin/activity.
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { useEffect, useMemo, useState } from "react";

interface ActivityEvent {
  id: string;
  source: "agency" | "platform";
  actorUid: string;
  actorName: string;
  entityType: string;
  entityId: string | null;
  agencyId: string | null;
  agencyName: string | null;
  summary: string;
  createdAt: string | null;
}

const ENTITY_LABELS: Record<string, string> = {
  vehicle: "Stock",
  lead: "Lead",
  operation: "Operación",
  team: "Equipo",
  profile: "Perfil",
  "user.blocked": "Usuario",
  "user.updated": "Usuario",
  "report.dismissed": "Reporte",
  "pricing.updated": "Cotización",
};

const ENTITY_COLORS: Record<string, string> = {
  vehicle: "bg-accent/15 text-accent",
  lead: "bg-cyan-500/15 text-cyan-600",
  operation: "bg-success/15 text-success",
  team: "bg-amber-500/15 text-amber-600",
  profile: "bg-violet-500/15 text-violet-600",
  "user.blocked": "bg-error/15 text-error",
  "user.updated": "bg-amber-500/15 text-amber-600",
  "report.dismissed": "bg-muted/20 text-muted-foreground",
  "pricing.updated": "bg-cyan-500/15 text-cyan-600",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ActivityTab() {
  const { getIdToken } = useAuth();
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [agencyFilter, setAgencyFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/admin/activity", { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<{ events: ActivityEvent[] }>(res);
        setEvents(data.events);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [getIdToken]);

  const agencies = useMemo(() => {
    const map = new Map<string, string>();
    (events ?? []).forEach((e) => {
      if (e.agencyId) map.set(e.agencyId, e.agencyName ?? e.agencyId);
    });
    return Array.from(map.entries());
  }, [events]);

  const filtered = useMemo(() => {
    return (events ?? []).filter((e) => {
      if (sourceFilter === "platform" && e.source !== "platform") return false;
      if (sourceFilter === "agency" && e.source !== "agency") return false;
      if (agencyFilter !== "all" && e.agencyId !== agencyFilter) return false;
      return true;
    });
  }, [events, sourceFilter, agencyFilter]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Lo que hacen las agencias (precios, leads, operaciones, equipo) y lo que hace el panel de administración, todo junto.
      </p>

      {error && <p className="text-sm text-error">{error}</p>}
      {!events && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {events && (
        <div className="flex flex-wrap gap-2">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value="all">Todo</option>
            <option value="agency">Solo agencias</option>
            <option value="platform">Solo administración</option>
          </select>
          <select
            value={agencyFilter}
            onChange={(e) => setAgencyFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value="all">Todas las agencias</option>
            {agencies.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      {events && filtered.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Sin actividad para este filtro todavía.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {filtered.map((e) => (
          <div key={e.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
            <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${ENTITY_COLORS[e.entityType] ?? "bg-muted/20 text-muted-foreground"}`}>
              {ENTITY_LABELS[e.entityType] ?? e.entityType}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">{e.summary}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {e.actorName}
                {e.agencyName ? ` · ${e.agencyName}` : ""} · {fmtDateTime(e.createdAt)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
