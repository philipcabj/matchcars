"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { useEffect, useState } from "react";

interface ReportItem {
  id: string;
  targetId: string;
  targetType: string;
  reason: string;
  details: string;
  reportedBy: string | null;
  createdAt: string | null;
  reporterName: string | null;
  vehicle: { id: string; brand: string; model: string; year: number | null } | null;
}

interface ReportedUser {
  user: { id: string; firstName: string; lastName: string; email: string; isBlocked: boolean };
  reports: ReportItem[];
}

export function ReportsTab() {
  const { getIdToken } = useAuth();
  const [reportedUsers, setReportedUsers] = useState<ReportedUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/admin/reports", { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<{ reportedUsers: ReportedUser[] }>(res);
        setReportedUsers(data.reportedUsers);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const viewing = reportedUsers?.find((r) => r.user.id === viewingUserId) ?? null;

  const removeReport = (reportId: string) => {
    setReportedUsers((prev) =>
      (prev ?? [])
        .map((r) => ({ ...r, reports: r.reports.filter((rep) => rep.id !== reportId) }))
        .filter((r) => r.reports.length > 0)
    );
  };

  const handleDismiss = async (reportId: string) => {
    setBusyReportId(reportId);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/admin/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "dismiss" }),
      });
      await parseJsonResponse(res);
      removeReport(reportId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusyReportId(null);
    }
  };

  const handleBlock = async (userId: string, reportId: string) => {
    setBusyReportId(reportId);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/admin/reports/block", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, reportId }),
      });
      await parseJsonResponse(res);
      setReportedUsers((prev) => (prev ?? []).filter((r) => r.user.id !== userId));
      setViewingUserId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusyReportId(null);
    }
  };

  const handleDeletePost = async (vehicleId: string, reportId: string) => {
    setBusyReportId(reportId);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/admin/reports/delete-post", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ vehicleId, reportId }),
      });
      await parseJsonResponse(res);
      removeReport(reportId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusyReportId(null);
    }
  };

  if (error) return <p className="text-sm text-error">{error}</p>;
  if (!reportedUsers) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  if (viewing) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold">
              {viewing.user.firstName} {viewing.user.lastName}
            </p>
            <p className="text-sm text-muted-foreground">{viewing.user.email}</p>
          </div>
          <button type="button" onClick={() => setViewingUserId(null)} className="text-sm font-semibold text-muted-foreground">
            ← Volver
          </button>
        </div>

        <div className="flex gap-2">
          <a
            href={`mailto:${viewing.user.email}?subject=${encodeURIComponent("Aviso sobre tu cuenta en MatchCars")}&body=${encodeURIComponent("Hola, hemos recibido reportes sobre tu actividad...")}`}
            className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-center text-sm font-semibold"
          >
            Contactar
          </a>
          <button
            type="button"
            onClick={() => viewing.reports[0] && handleBlock(viewing.user.id, viewing.reports[0].id)}
            disabled={viewing.user.isBlocked || busyReportId !== null}
            className="flex-1 rounded-lg bg-error px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {viewing.user.isBlocked ? "Ya bloqueado" : "Banear usuario"}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {viewing.reports.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-2">
                <span className="text-lg">⚠️</span>
                <div className="flex-1">
                  <p className="text-sm font-bold">{r.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString("es-AR") : "Fecha desconocida"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Denunciante: {r.reporterName || r.reportedBy || "Anónimo"}</p>
                </div>
              </div>

              {r.details && <p className="mt-2 text-sm">{r.details}</p>}

              {r.vehicle && (
                <div className="mt-2 rounded-lg bg-background p-2">
                  <p className="text-xs text-muted-foreground">Vehículo reportado:</p>
                  <p className="text-sm font-semibold">
                    {r.vehicle.brand} {r.vehicle.model} {r.vehicle.year ?? ""}
                  </p>
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleDismiss(r.id)}
                  disabled={busyReportId === r.id}
                  className="flex-1 rounded-lg bg-background px-3 py-2 text-xs font-semibold disabled:opacity-60"
                >
                  Descartar
                </button>
                {r.vehicle && (
                  <button
                    type="button"
                    onClick={() => handleDeletePost(r.vehicle!.id, r.id)}
                    disabled={busyReportId === r.id}
                    className="flex-1 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-accent-foreground disabled:opacity-60"
                  >
                    Eliminar pub.
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleBlock(viewing.user.id, r.id)}
                  disabled={busyReportId === r.id || viewing.user.isBlocked}
                  className="flex-1 rounded-lg bg-error px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                >
                  {viewing.user.isBlocked ? "Bloqueado" : "Bloquear"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (reportedUsers.length === 0) return <p className="text-sm text-muted-foreground">No hay usuarios reportados.</p>;

  return (
    <div className="flex flex-col gap-3">
      {reportedUsers.map((r) => (
        <div key={r.user.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
          <div>
            <p className="text-sm font-bold">
              {r.user.firstName || "Usuario"} {r.user.lastName || ""}
            </p>
            <p className="text-xs text-muted-foreground">{r.user.email}</p>
            <p className="mt-1 text-xs font-bold text-error">
              {r.reports.length} reporte{r.reports.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setViewingUserId(r.user.id)}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-accent-foreground"
          >
            Ver reportes
          </button>
        </div>
      ))}
    </div>
  );
}
