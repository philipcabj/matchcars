// portal/src/app/dashboard/stock/[id]/page.tsx
// Detalle de solo lectura de un auto — antes esta ruta ERA el formulario de
// edición (no existía forma de solo "ver" un auto). Ahora edición vive en
// /stock/[id]/edit.
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { STATUS_LABELS, TOGGLE_FIELDS, VehicleDetail } from "@/lib/vehicle";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

function Lightbox({ photos, index, onClose, onNavigate }: { photos: string[]; index: number; onClose: () => void; onNavigate: (i: number) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onNavigate((index - 1 + photos.length) % photos.length);
      if (e.key === "ArrowRight") onNavigate((index + 1) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onClose, onNavigate]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg text-white"
      >
        ×
      </button>
      {photos.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate((index - 1 + photos.length) % photos.length);
          }}
          className="absolute left-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white sm:left-4"
        >
          ‹
        </button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photos[index]}
        alt=""
        className="max-h-[85vh] max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      {photos.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate((index + 1) % photos.length);
          }}
          className="absolute right-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white sm:right-4"
        >
          ›
        </button>
      )}
      {photos.length > 1 && (
        <p className="absolute bottom-4 text-xs font-semibold text-white/80">
          {index + 1} / {photos.length}
        </p>
      )}
    </div>
  );
}

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getIdToken } = useAuth();
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/agency/vehicles/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        setVehicle(await parseJsonResponse<VehicleDetail>(res));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [id, getIdToken]);

  if (error) return <p className="text-sm text-error">No pudimos abrir este auto: {error}</p>;
  if (!vehicle) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const statusInfo = STATUS_LABELS[vehicle.status] ?? { label: vehicle.status, className: "bg-muted/20 text-muted-foreground" };
  const activeToggles = TOGGLE_FIELDS.filter((t) => vehicle.toggles[t.key]);
  const isRejected = ["rejected", "rejected_limit", "blocked"].includes(vehicle.status);
  const photos = [vehicle.coverImage, ...vehicle.gallery].filter(Boolean) as string[];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/stock" className="text-xs font-semibold text-accent">
          ← Volver a Stock
        </Link>
        <Link
          href={`/dashboard/stock/${id}/edit`}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
        >
          Editar
        </Link>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">
            {vehicle.brand} {vehicle.model} {vehicle.year}
          </h1>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusInfo.className}`}>{statusInfo.label}</span>
        </div>
        {vehicle.version && <p className="text-sm text-muted-foreground">{vehicle.version}</p>}
      </div>

      {isRejected && vehicle.rejectionReason && (
        <div className="rounded-xl border border-error/30 bg-error/10 p-4">
          <p className="text-sm font-semibold text-error">Motivo del rechazo</p>
          <p className="mt-1 text-sm text-error">{vehicle.rejectionReason}</p>
        </div>
      )}

      {vehicle.coverImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={vehicle.coverImage}
          alt=""
          onClick={() => setLightboxIndex(0)}
          className="h-64 w-full cursor-zoom-in rounded-2xl object-cover"
        />
      )}
      {vehicle.gallery.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {vehicle.gallery.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt=""
              onClick={() => setLightboxIndex(i + 1)}
              className="h-20 w-28 shrink-0 cursor-zoom-in rounded-lg object-cover"
            />
          ))}
        </div>
      )}
      {lightboxIndex !== null && (
        <Lightbox photos={photos} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} />
      )}
      {vehicle.video && (
        <video src={vehicle.video} controls className="h-56 w-full rounded-2xl bg-black object-contain" />
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Precio</p>
          <p className="text-base font-bold">
            {vehicle.currency} {Number(vehicle.price).toLocaleString("es-AR")}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Kilómetros</p>
          <p className="text-base font-bold">{vehicle.km ? Number(vehicle.km).toLocaleString("es-AR") : "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Vistas</p>
          <p className="text-base font-bold">{vehicle.views}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Me gusta</p>
          <p className="text-base font-bold">{vehicle.likesCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Combustible</p>
          <p className="text-sm font-semibold">{vehicle.fuelType || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Caja</p>
          <p className="text-sm font-semibold">{vehicle.gearbox || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Ubicación</p>
          <p className="text-sm font-semibold">{[vehicle.city, vehicle.province].filter(Boolean).join(", ") || "—"}</p>
        </div>
      </div>

      {vehicle.description && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Descripción</p>
          <p className="text-sm">{vehicle.description}</p>
        </div>
      )}

      {activeToggles.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Características</p>
          <div className="flex flex-wrap gap-2">
            {activeToggles.map((t) => (
              <span key={t.key} className="rounded-full bg-background px-3 py-1 text-xs">
                ✓ {t.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {vehicle.priceHistory.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Historial de precio</p>
          <div className="flex flex-col gap-1">
            {vehicle.priceHistory.map((h, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{h.changedAt ? new Date(h.changedAt).toLocaleDateString("es-AR") : "—"}</span>
                <span className="font-semibold">
                  {h.currency} {Number(h.price).toLocaleString("es-AR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
