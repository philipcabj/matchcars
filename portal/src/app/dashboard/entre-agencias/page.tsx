// portal/src/app/dashboard/entre-agencias/page.tsx
// Entre Agencias — bolsa de pedidos: una agencia busca un auto puntual
// para un cliente, lo ve el resto en un board compartido, y si alguna
// responde se abre un hilo privado dentro del portal (ver
// AgencyThreadPanel). Mismo patrón de tabs que dashboard/admin/page.tsx.
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { useCallback, useEffect, useState } from "react";
import { BoardTab } from "./BoardTab";
import { MyRequestsTab } from "./MyRequestsTab";
import { ThreadsTab } from "./ThreadsTab";
import type { AgencyRequestItem, AgencyThreadItem } from "./types";

type Tab = "board" | "mine" | "threads";

export default function EntreAgenciasPage() {
  const { getIdToken } = useAuth();
  const [tab, setTab] = useState<Tab>("board");
  const [board, setBoard] = useState<AgencyRequestItem[] | null>(null);
  const [mine, setMine] = useState<AgencyRequestItem[] | null>(null);
  const [threads, setThreads] = useState<AgencyThreadItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    try {
      const token = await getIdToken();
      const res = await fetch("/api/agency/agency-requests", { headers: { Authorization: `Bearer ${token}` } });
      const data = await parseJsonResponse<{ board: AgencyRequestItem[]; mine: AgencyRequestItem[] }>(res);
      setBoard(data.board);
      setMine(data.mine);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
  }, [getIdToken]);

  const loadThreads = useCallback(async () => {
    try {
      const token = await getIdToken();
      const res = await fetch("/api/agency/agency-threads", { headers: { Authorization: `Bearer ${token}` } });
      const data = await parseJsonResponse<{ threads: AgencyThreadItem[] }>(res);
      setThreads(data.threads);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
  }, [getIdToken]);

  // Carga inicial — inline en vez de llamar a loadRequests/loadThreads
  // directo (esas quedan para los callbacks que pasan los hijos), mismo
  // criterio que mi-operacion/[token]/page.tsx para no disparar setState
  // sincrónico encadenado dentro del efecto.
  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const [reqRes, threadsRes] = await Promise.all([
          fetch("/api/agency/agency-requests", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/agency/agency-threads", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const reqData = await parseJsonResponse<{ board: AgencyRequestItem[]; mine: AgencyRequestItem[] }>(reqRes);
        const threadsData = await parseJsonResponse<{ threads: AgencyThreadItem[] }>(threadsRes);
        setBoard(reqData.board);
        setMine(reqData.mine);
        setThreads(threadsData.threads);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unreadThreads = threads?.reduce((sum, t) => sum + (t.unreadForMe > 0 ? 1 : 0), 0) ?? 0;

  // Responder un pedido crea un hilo nuevo — hay que refrescar las dos
  // listas, no solo los pedidos.
  const refreshAfterRespond = useCallback(() => {
    loadRequests();
    loadThreads();
  }, [loadRequests, loadThreads]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Entre Agencias</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pedí un auto puntual para un cliente y lo ven las demás agencias — si alguna tiene uno, se abre una
          conversación privada acá mismo.
        </p>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => setTab("board")}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold ${tab === "board" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
        >
          Board
        </button>
        <button
          type="button"
          onClick={() => setTab("mine")}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold ${tab === "mine" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
        >
          Mis pedidos
        </button>
        <button
          type="button"
          onClick={() => setTab("threads")}
          className={`relative flex-1 rounded-xl px-4 py-2 text-sm font-semibold ${tab === "threads" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
        >
          Mis conversaciones
          {unreadThreads > 0 && (
            <span className="ml-1.5 rounded-full bg-error px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadThreads}</span>
          )}
        </button>
      </div>

      {tab === "board" && (board === null ? <p className="text-sm text-muted-foreground">Cargando…</p> : <BoardTab requests={board} onChanged={refreshAfterRespond} />)}
      {tab === "mine" && (mine === null ? <p className="text-sm text-muted-foreground">Cargando…</p> : <MyRequestsTab requests={mine} onChanged={loadRequests} />)}
      {tab === "threads" && (threads === null ? <p className="text-sm text-muted-foreground">Cargando…</p> : <ThreadsTab threads={threads} onOpened={loadThreads} />)}
    </div>
  );
}
