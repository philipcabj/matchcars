// portal/src/app/dashboard/team/activity/page.tsx
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";

interface ActivityEvent {
  id: string;
  actorUid: string;
  actorName: string;
  entityType: "vehicle" | "lead" | "operation" | "team";
  entityId: string;
  summary: string;
  createdAt: string | null;
}

const ENTITY_LABELS: Record<string, string> = {
  vehicle: "Stock",
  lead: "Lead",
  operation: "Operación",
  team: "Equipo",
};

const ENTITY_COLORS: Record<string, string> = {
  vehicle: "bg-accent/15 text-accent",
  lead: "bg-cyan-500/15 text-cyan-600",
  operation: "bg-success/15 text-success",
  team: "bg-amber-500/15 text-amber-600",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TeamActivityPage() {
  const { getIdToken } = useAuth();
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [actorFilter, setActorFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/agency/activity", { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<{ events: ActivityEvent[] }>(res);
        setEvents(data.events);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [getIdToken]);

  const actors = useMemo(() => {
    const map = new Map<string, string>();
    (events ?? []).forEach((e) => map.set(e.actorUid, e.actorName));
    return Array.from(map.entries());
  }, [events]);

  const filtered = useMemo(() => {
    return (events ?? []).filter((e) => {
      if (entityFilter !== "all" && e.entityType !== entityFilter) return false;
      if (actorFilter !== "all" && e.actorUid !== actorFilter) return false;
      return true;
    });
  }, [events, entityFilter, actorFilter]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link href="/dashboard/team" className="text-xs font-semibold text-accent">
          ← Volver a Equipo
        </Link>
        <h1 className="mt-2 text-xl font-bold">Actividad del equipo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quién hizo qué y cuándo — precios, estados de leads y operaciones, y cambios en el equipo.
        </p>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}
      {!events && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {events && (
        <div className="flex flex-wrap gap-2">
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value="all">Todo</option>
            {Object.entries(ENTITY_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value="all">Todos los usuarios</option>
            {actors.map(([uid, name]) => (
              <option key={uid} value={uid}>
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
                {e.actorName} · {fmtDateTime(e.createdAt)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
