// portal/src/app/dashboard/admin/vehicles/[id]/page.tsx
// Detalle completo de una publicación para el panel de admin — antes no
// existía ninguna forma de ver esto desde el portal (solo la tarjeta resumida
// de ModerationTab/AllVehiclesTab), a diferencia de la app donde cualquier
// admin puede tocar la card y ver el detalle completo (CarCard -> /car/[id]).
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useAdminRole } from "@/hooks/useAdminRole";
import { parseJsonResponse } from "@/lib/api-client";
import { getPlanLabel } from "@/lib/plans";
import { STATUS_LABELS, TOGGLE_FIELDS } from "@/lib/vehicle";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FLAG_LABELS } from "../../ModerationTab";

interface VehicleDetail {
  id: string;
  brand: string;
  model: string;
  version: string;
  year: number | null;
  price: number;
  currency: string;
  km: number;
  fuelType: string;
  gearbox: string;
  licensePlate: string;
  description: string;
  province: string;
  city: string;
  coverImage: string;
  gallery: string[];
  video: string;
  toggles: Record<string, boolean>;
  status: string;
  rejectionReason: string | null;
  riskScore: number;
  riskFlags: string[];
  views: number;
  likesCount: number;
  createdAt: string | null;
  publicationCode: number | null;
  userId: string;
  userName: string;
  userEmail: string | null;
  userPlan: string | null;
}

export default function AdminVehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getIdToken } = useAuth();
  const { isAdmin, isModerator, loading: roleLoading } = useAdminRole();

  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reasonMode, setReasonMode] = useState<"reject" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");

  useEffect(() => {
    if (!roleLoading && !isModerator) router.replace("/dashboard");
  }, [roleLoading, isModerator, router]);

  useEffect(() => {
    if (!isModerator) return;
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/admin/vehicles/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<VehicleDetail>(res);
        setVehicle(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isModerator]);

  const runAction = async (body: Record<string, unknown>) => {
    setBusy(true);
    setReasonError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/admin/vehicles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      await parseJsonResponse(res);
      if (body.action === "delete") {
        router.replace("/dashboard/admin");
      } else {
        setVehicle((prev) => (prev ? { ...prev, status: body.action === "approve" ? "available" : "rejected" } : prev));
        setReasonMode(null);
        setReason("");
      }
    } catch (e) {
      setReasonError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  };

  const confirmReason = () => {
    if (!reason.trim()) {
      setReasonError(reasonMode === "delete" ? "Ingresá un motivo de eliminación." : "Ingresá un motivo de rechazo.");
      return;
    }
    runAction({ action: reasonMode, reason: reason.trim() });
  };

  if (roleLoading || !isModerator) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (error) return <p className="text-sm text-error">{error}</p>;
  if (!vehicle) return <p className="text-sm text-muted-foreground">Cargando publicación…</p>;

  const statusInfo = STATUS_LABELS[vehicle.status] ?? { label: vehicle.status, className: "bg-muted/20 text-muted-foreground" };
  const isPending = vehicle.status === "pending" || vehicle.status === "pending_review";
  const photos = [vehicle.coverImage, ...vehicle.gallery].filter(Boolean);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/admin" className="text-sm font-semibold text-muted-foreground">
          ← Volver a Administración
        </Link>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.className}`}>{statusInfo.label}</span>
      </div>

      <div>
        <h1 className="text-xl font-bold">
          {vehicle.brand} {vehicle.model} {vehicle.version} {vehicle.year ?? ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {vehicle.publicationCode ? `#${vehicle.publicationCode} · ` : ""}
          {vehicle.currency} {vehicle.price.toLocaleString("es-AR")}
        </p>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="aspect-square overflow-hidden rounded-lg bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover transition hover:opacity-80" />
            </a>
          ))}
        </div>
      )}

      {vehicle.rejectionReason && (
        <div className="rounded-lg border border-error/40 bg-error/5 p-3 text-sm text-error">
          <strong>Motivo:</strong> {vehicle.rejectionReason}
        </div>
      )}

      {vehicle.riskFlags.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-semibold text-muted-foreground">
            Señales de riesgo {vehicle.riskScore > 0 && `· Score ${vehicle.riskScore}`}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {vehicle.riskFlags.map((flag) => (
              <span key={flag} className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                {FLAG_LABELS[flag] ?? flag}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-xs font-semibold text-muted-foreground">Vendedor</p>
        <p className="mt-1 text-sm font-bold">{vehicle.userName || vehicle.userId}</p>
        <p className="text-xs text-muted-foreground">
          {vehicle.userEmail ?? "sin email"} · {getPlanLabel(vehicle.userPlan ?? "free")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-4 text-sm sm:grid-cols-3">
        <Field label="Km" value={vehicle.km ? vehicle.km.toLocaleString("es-AR") : "—"} />
        <Field label="Combustible" value={vehicle.fuelType || "—"} />
        <Field label="Caja" value={vehicle.gearbox || "—"} />
        <Field label="Patente" value={vehicle.licensePlate || "—"} />
        <Field label="Ubicación" value={[vehicle.city, vehicle.province].filter(Boolean).join(", ") || "—"} />
        <Field label="Vistas / Likes" value={`${vehicle.views} / ${vehicle.likesCount}`} />
      </div>

      {vehicle.description && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground">Descripción</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{vehicle.description}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-4">
        {TOGGLE_FIELDS.map((t) => (
          <span
            key={t.key}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              vehicle.toggles[t.key] ? "bg-success/15 text-success" : "bg-muted/10 text-muted-foreground/50 line-through"
            }`}
          >
            {t.label}
          </span>
        ))}
      </div>

      {reasonMode && (
        <div className="flex flex-col gap-2 rounded-lg border border-error/40 bg-error/5 p-3">
          <p className="text-xs font-semibold">{reasonMode === "delete" ? "Motivo de la eliminación" : "Motivo del rechazo"}</p>
          {reasonError && <p className="text-xs text-error">{reasonError}</p>}
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (reasonError) setReasonError("");
            }}
            className="min-h-16 rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-accent"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setReasonMode(null);
                setReason("");
                setReasonError("");
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmReason}
              disabled={busy}
              className="rounded-lg bg-error px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
            >
              {busy ? "Procesando…" : "Confirmar"}
            </button>
          </div>
        </div>
      )}

      {!reasonMode && (
        <div className="flex gap-2">
          {isPending && (
            <>
              <button
                type="button"
                onClick={() => setReasonMode("reject")}
                disabled={busy}
                className="flex-1 rounded-lg bg-error px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                Rechazar
              </button>
              <button
                type="button"
                onClick={() => runAction({ action: "approve" })}
                disabled={busy}
                className="flex-1 rounded-lg bg-success px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy ? "Procesando…" : "Aprobar"}
              </button>
            </>
          )}
          {isAdmin && vehicle.status !== "deleted" && (
            <button
              type="button"
              onClick={() => setReasonMode("delete")}
              disabled={busy}
              className="flex-1 rounded-lg border border-error px-4 py-2.5 text-sm font-bold text-error disabled:opacity-60"
            >
              Eliminar publicación
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
