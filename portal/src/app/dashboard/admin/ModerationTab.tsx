"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import Link from "next/link";
import { useEffect, useState } from "react";

interface PendingVehicle {
  id: string;
  brand: string;
  model: string;
  version: string;
  year: number | null;
  price: number;
  currency: string;
  coverImage: string;
  userId: string;
  userName: string;
  riskScore: number;
  riskFlags: string[];
  publicationCode: number | null;
}

export const FLAG_LABELS: Record<string, string> = {
  price_outlier: "Precio muy por debajo del mercado",
  price_high_outlier: "Precio muy por encima del mercado",
  new_user_mass: "Usuario nuevo con muchas publicaciones recientes",
  external_contact: "Teléfono o link externo en la descripción",
  duplicate_image: "Fotos repetidas en otras publicaciones",
  year_price_mismatch: "Año y precio no parecen consistentes",
};

function riskBadge(score: number): { label: string; className: string } {
  if (score >= 5) return { label: "Riesgo alto", className: "bg-error/15 text-error" };
  if (score >= 3) return { label: "Riesgo medio", className: "bg-accent/15 text-accent" };
  if (score > 0) return { label: "Riesgo bajo", className: "bg-success/15 text-success" };
  return { label: "OK para publicar", className: "bg-success/15 text-success" };
}

export function ModerationTab() {
  const { getIdToken } = useAuth();
  const [vehicles, setVehicles] = useState<PendingVehicle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionError, setRejectionError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/admin/vehicles", { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<{ vehicles: PendingVehicle[] }>(res);
        setVehicles(data.vehicles);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApprove = async (id: string) => {
    setBusyId(id);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/admin/vehicles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "approve" }),
      });
      await parseJsonResponse(res);
      setVehicles((prev) => prev?.filter((v) => v.id !== id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusyId(null);
    }
  };

  const confirmReject = async () => {
    if (!rejectingId) return;
    if (!rejectionReason.trim()) {
      setRejectionError("Ingresá un motivo de rechazo.");
      return;
    }
    setBusyId(rejectingId);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/admin/vehicles/${rejectingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "reject", reason: rejectionReason.trim() }),
      });
      await parseJsonResponse(res);
      setVehicles((prev) => prev?.filter((v) => v.id !== rejectingId) ?? null);
      setRejectingId(null);
      setRejectionReason("");
    } catch (e) {
      setRejectionError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <p className="text-sm text-error">{error}</p>;
  if (!vehicles) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (vehicles.length === 0) return <p className="text-sm text-muted-foreground">No hay publicaciones pendientes.</p>;

  return (
    <div className="flex flex-col gap-4">
      {vehicles.map((v) => {
        const badge = riskBadge(v.riskScore);
        return (
          <div key={v.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row">
            <div className="flex shrink-0 items-center justify-center font-mono text-lg font-extrabold text-muted-foreground sm:w-14">
              {v.publicationCode ? `#${v.publicationCode}` : "—"}
            </div>
            <div className="h-28 w-full shrink-0 overflow-hidden rounded-lg bg-background sm:w-40">
              {v.coverImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.coverImage} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <div>
                <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${badge.className}`}>
                  {badge.label}
                  {v.riskScore > 0 ? ` · Score ${v.riskScore}` : ""}
                </span>
              </div>
              <p className="text-sm font-bold">
                {v.brand} {v.model} {v.version} {v.year ?? ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {v.currency} {v.price.toLocaleString("es-AR")} · Publicado por {v.userName || v.userId}
              </p>
              <Link href={`/dashboard/admin/vehicles/${v.id}`} className="text-xs font-semibold text-accent">
                Ver detalle completo →
              </Link>
              {v.riskFlags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {v.riskFlags.map((flag) => (
                    <span key={flag} className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                      {FLAG_LABELS[flag] ?? flag}
                    </span>
                  ))}
                </div>
              )}

              {rejectingId === v.id ? (
                <div className="mt-1 flex flex-col gap-2 rounded-lg border border-error/40 bg-error/5 p-3">
                  <p className="text-xs font-semibold">Motivo del rechazo</p>
                  {rejectionError && <p className="text-xs text-error">{rejectionError}</p>}
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => {
                      setRejectionReason(e.target.value);
                      if (rejectionError) setRejectionError("");
                    }}
                    placeholder="Ej: Las fotos están borrosas…"
                    className="min-h-16 rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-accent"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingId(null);
                        setRejectionReason("");
                        setRejectionError("");
                      }}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={confirmReject}
                      disabled={busyId === v.id}
                      className="rounded-lg bg-error px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {busyId === v.id ? "Procesando…" : "Confirmar rechazo"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingId(v.id);
                      setRejectionReason("");
                      setRejectionError("");
                    }}
                    disabled={busyId === v.id}
                    className="flex-1 rounded-lg bg-error px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    Rechazar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprove(v.id)}
                    disabled={busyId === v.id}
                    className="flex-1 rounded-lg bg-success px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {busyId === v.id ? "Procesando…" : "Aprobar"}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
