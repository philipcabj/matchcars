// portal/src/app/dashboard/admin/LoginsTab.tsx
// Tabla de los últimos logins a la plataforma — admin only (ver
// /api/admin/logins, gate requireSuperAdmin por la IP). Incluye tanto el
// portal (agencias/admin) como la app (compradores, mucho más volumen) —
// filtro por fuente para no perder los del portal entre los de la app.
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { useEffect, useMemo, useState } from "react";

interface LoginEvent {
  id: string;
  uid: string;
  email: string | null;
  name: string | null;
  method: string;
  source: string;
  platform: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  email: "Email",
  google: "Google",
  apple: "Apple",
  facebook: "Facebook",
  unknown: "?",
};

const SOURCE_LABELS: Record<string, string> = {
  portal: "Portal",
  app: "App",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function LoginsTab() {
  const { getIdToken } = useAuth();
  const [logins, setLogins] = useState<LoginEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("portal");

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/admin/logins", { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<{ logins: LoginEvent[] }>(res);
        setLogins(data.logins);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [getIdToken]);

  const filtered = useMemo(() => {
    if (sourceFilter === "all") return logins ?? [];
    return (logins ?? []).filter((l) => l.source === sourceFilter);
  }, [logins, sourceFilter]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Últimos accesos a la plataforma, más reciente primero.</p>

      {error && <p className="text-sm text-error">{error}</p>}
      {!logins && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {logins && (
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="w-fit rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
        >
          <option value="portal">Solo portal</option>
          <option value="app">Solo app</option>
          <option value="all">Todo</option>
        </select>
      )}

      {logins && filtered.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Sin accesos registrados para este filtro.
        </p>
      )}

      {logins && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-semibold text-muted-foreground">
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Usuario</th>
                <th className="px-3 py-2">Origen</th>
                <th className="px-3 py-2">Método</th>
                <th className="px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDateTime(l.createdAt)}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{l.name || l.email || l.uid}</p>
                    {l.name && l.email && <p className="text-xs text-muted-foreground">{l.email}</p>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {SOURCE_LABELS[l.source] ?? l.source}
                    {l.platform && <span className="text-muted-foreground"> · {l.platform}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{METHOD_LABELS[l.method] ?? l.method}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{l.ip || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
