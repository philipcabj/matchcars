// portal/src/app/dashboard/operaciones/page.tsx
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useAgencyMe } from "@/hooks/useAgencyMe";
import { parseJsonResponse } from "@/lib/api-client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface OperationListItem {
  id: string;
  leadId: string;
  status: "en_curso" | "completada" | "cancelada";
  assignedTo: string | null;
  vehicleSnapshot: { brand?: string; model?: string; year?: number } | null;
  buyerLabel: string;
  stepsDone: number;
  stepsTotal: number;
  dueSeverity: "overdue" | "soon" | null;
  createdAt: string | null;
  updatedAt: string | null;
}

const STATUS_LABELS: Record<string, string> = { en_curso: "En curso", completada: "Completada", cancelada: "Cancelada" };
const STATUS_COLORS: Record<string, string> = {
  en_curso: "bg-accent/15 text-accent",
  completada: "bg-success/15 text-success",
  cancelada: "bg-muted/20 text-muted-foreground",
};

export default function OperacionesPage() {
  const { getIdToken } = useAuth();
  const { data: agency } = useAgencyMe();
  const [operations, setOperations] = useState<OperationListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/agency/sale-operations", { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<{ operations: OperationListItem[] }>(res);
        setOperations(data.operations);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [getIdToken]);

  const memberName = useMemo(() => {
    const map = new Map((agency?.members ?? []).map((m) => [m.uid, m.name || m.email || m.uid]));
    return (uid: string | null) => (uid ? map.get(uid) || uid : null);
  }, [agency]);

  const activeOps = operations?.filter((o) => o.status === "en_curso") ?? [];
  const closedOps = operations?.filter((o) => o.status !== "en_curso") ?? [];

  if (agency && !agency.hasCRM) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
        <p className="font-semibold">Función exclusiva de planes pagos</p>
        <p className="mt-2 text-sm text-muted-foreground">Las operaciones de venta están disponibles desde el plan Pro Plus.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Operaciones de venta</h1>
        <p className="mt-1 text-sm text-muted-foreground">Checklist de trámites, financiación y parte de pago por venta.</p>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}
      {!operations && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {operations && operations.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Todavía no iniciaste ninguna operación. Se inician desde el detalle de un lead en negociación o vendido.
        </p>
      )}

      {activeOps.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">En curso</p>
          {activeOps.map((op) => (
            <OperationRow key={op.id} op={op} assignedName={memberName(op.assignedTo)} />
          ))}
        </div>
      )}

      {closedOps.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-muted-foreground">Cerradas</p>
          {closedOps.map((op) => (
            <OperationRow key={op.id} op={op} assignedName={memberName(op.assignedTo)} />
          ))}
        </div>
      )}
    </div>
  );
}

function OperationRow({ op, assignedName }: { op: OperationListItem; assignedName: string | null }) {
  const pct = op.stepsTotal > 0 ? Math.round((op.stepsDone / op.stepsTotal) * 100) : 0;
  return (
    <Link
      href={`/dashboard/operaciones/${op.id}`}
      className="flex items-center gap-4 rounded-xl border border-border bg-card p-3 transition hover:border-accent"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">
            {op.vehicleSnapshot?.brand} {op.vehicleSnapshot?.model} {op.vehicleSnapshot?.year}
          </p>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[op.status]}`}>
            {STATUS_LABELS[op.status]}
          </span>
          {op.dueSeverity && (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                op.dueSeverity === "overdue" ? "bg-error/15 text-error" : "bg-amber-500/15 text-amber-600"
              }`}
            >
              {op.dueSeverity === "overdue" ? "Trámite vencido" : "Vence pronto"}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {op.buyerLabel}
          {assignedName && <> · {assignedName}</>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-background">
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <span className="w-10 text-right text-xs font-semibold text-muted-foreground">
          {op.stepsDone}/{op.stepsTotal}
        </span>
      </div>
    </Link>
  );
}
