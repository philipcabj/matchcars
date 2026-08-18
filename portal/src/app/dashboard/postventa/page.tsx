// portal/src/app/dashboard/postventa/page.tsx
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useAgencyMe } from "@/hooks/useAgencyMe";
import { parseJsonResponse } from "@/lib/api-client";
import { PostSaleTask, TASK_TYPE_ICONS, TASK_TYPE_LABELS } from "@/lib/post-sale";
import { useEffect, useMemo, useState } from "react";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function PostventaPage() {
  const { getIdToken } = useAuth();
  const { data: agency } = useAgencyMe();
  const [tasks, setTasks] = useState<PostSaleTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/agency/post-sale-tasks", { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<{ tasks: PostSaleTask[] }>(res);
        setTasks(data.tasks);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [getIdToken, reloadKey]);

  const markDone = async (id: string) => {
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/post-sale-tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "mark_done" }),
      });
      await parseJsonResponse(res);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
  };

  const { pending, recontactos, done } = useMemo(() => {
    const all = tasks ?? [];
    return {
      pending: all.filter((t) => t.estado !== "hecha" && t.canal === "auto"),
      recontactos: all.filter((t) => t.estado !== "hecha" && t.canal === "manual"),
      done: all.filter((t) => t.estado === "hecha"),
    };
  }, [tasks]);

  if (agency && !agency.hasCRM) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
        <p className="font-semibold">Función exclusiva de planes pagos</p>
        <p className="mt-2 text-sm text-muted-foreground">Postventa está disponible desde el plan Pro Plus.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Postventa</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Seguimientos automáticos tras cada venta confirmada — encuesta, reseña y recordatorio de service se mandan
          solos. Recontacto comercial queda como recordatorio: lo hacés vos.
        </p>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}
      {!tasks && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {tasks && tasks.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Todavía no hay tareas de postventa — se generan solas cuando se confirma una venta con comprador real.
        </p>
      )}

      {recontactos.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">📞 Para recontactar</p>
          {recontactos.map((t) => (
            <TaskRow key={t.id} task={t} onMarkDone={markDone} />
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-muted-foreground">Automáticas (pendientes/enviadas)</p>
          {pending.map((t) => (
            <TaskRow key={t.id} task={t} onMarkDone={markDone} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-muted-foreground">Hechas</p>
          {done.map((t) => (
            <TaskRow key={t.id} task={t} onMarkDone={markDone} />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, onMarkDone }: { task: PostSaleTask; onMarkDone: (id: string) => void }) {
  const remaining = daysUntil(task.programadaPara);
  const overdue = task.estado !== "hecha" && remaining !== null && remaining < 0;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <span className="text-lg">{TASK_TYPE_ICONS[task.tipo]}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{TASK_TYPE_LABELS[task.tipo]}</p>
        <p className="truncate text-xs text-muted-foreground">
          {task.buyerLabel} · {task.vehicleSnapshot?.brand} {task.vehicleSnapshot?.model}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {task.estado === "hecha" ? (
          <span className="text-xs font-semibold text-success">✓ {fmtDate(task.doneAt)}</span>
        ) : (
          <>
            <p className={`text-xs font-semibold ${overdue ? "text-error" : "text-muted-foreground"}`}>
              {task.estado === "enviada" ? `Enviada ${fmtDate(task.sentAt)}` : `Programada ${fmtDate(task.programadaPara)}`}
            </p>
            <button onClick={() => onMarkDone(task.id)} className="text-xs font-semibold text-accent">
              Marcar hecha
            </button>
          </>
        )}
      </div>
    </div>
  );
}
