// portal/src/app/dashboard/entre-agencias/BoardTab.tsx
// Pedidos abiertos de OTRAS agencias — "Tengo uno" abre (o reusa) el hilo
// privado con quien publicó, ver POST .../respond.
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { useState } from "react";
import { AgencyThreadPanel } from "./AgencyThreadPanel";
import type { AgencyRequestItem } from "./types";

function fmtRange(item: AgencyRequestItem): string {
  const parts: string[] = [];
  if (item.yearMin || item.yearMax) parts.push(`${item.yearMin ?? "…"}–${item.yearMax ?? "…"}`);
  if (item.priceMax) parts.push(`hasta ${item.currency} ${item.priceMax.toLocaleString("es-AR")}`);
  return parts.join(" · ");
}

export function BoardTab({ requests, onChanged }: { requests: AgencyRequestItem[]; onChanged: () => void }) {
  const { getIdToken } = useAuth();
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openThread, setOpenThread] = useState<{ id: string; title: string } | null>(null);

  const respond = async (item: AgencyRequestItem) => {
    setRespondingId(item.id);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/agency-requests/${item.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const data = await parseJsonResponse<{ id: string }>(res);
      setOpenThread({ id: data.id, title: `${item.agencyName} — ${item.brand} ${item.model}` });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setRespondingId(null);
    }
  };

  if (requests.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay pedidos abiertos de otras agencias por ahora.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-error">{error}</p>}
      {requests.map((item) => (
        <div key={item.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {item.brand} {item.model}
              </p>
              <p className="text-xs text-muted-foreground">{fmtRange(item) || "Sin más detalle de año/precio"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Pide: {item.agencyName}</p>
              {item.notes && <p className="mt-1 text-sm">{item.notes}</p>}
            </div>
            <button
              onClick={() => respond(item)}
              disabled={respondingId === item.id}
              className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-60"
            >
              {respondingId === item.id ? "…" : "Tengo uno"}
            </button>
          </div>
          {item.matches.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              💡 Ya hay {item.matches.length} auto{item.matches.length > 1 ? "s" : ""} publicado{item.matches.length > 1 ? "s" : ""} de otras agencias que podría{item.matches.length > 1 ? "n" : ""} servir.
            </p>
          )}
        </div>
      ))}

      {openThread && (
        <AgencyThreadPanel threadId={openThread.id} title={openThread.title} onClose={() => setOpenThread(null)} />
      )}
    </div>
  );
}
