// portal/src/app/ficha/[id]/page.tsx
// Ficha imprimible de un auto (foto + specs + QR) para pegar en el vidrio del
// auto — puerto de handleGeneratePDF en app/car/[id].tsx (raíz). Ruta fuera
// de /dashboard a propósito: sin Sidebar ni chrome del portal, así
// window.print() solo imprime la ficha en sí, sin tener que ocultar el resto
// del layout con CSS de impresión. Requiere plan Pro Plus o superior
// (canExportPDF), mismo gate que en la app.
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { useAgencyMe } from "@/hooks/useAgencyMe";
import { canExportPDF } from "@/lib/plans";
import type { VehicleDetail } from "@/lib/vehicle";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function FichaPage() {
  const { id } = useParams<{ id: string }>();
  const { user, initializing, getIdToken } = useAuth();
  const { data: agency, loading: loadingAgency } = useAgencyMe();
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Esta página se abre en pestaña nueva (target="_blank" desde Stock) —
    // a diferencia de /dashboard/**, acá no hay un layout que espere a que
    // Firebase Auth termine de restaurar la sesión antes de montar la
    // página. Sin este chequeo, el primer render dispara el fetch con
    // auth.currentUser todavía null → getIdToken() devuelve null → el
    // server rechaza con "Token inválido o expirado".
    if (initializing) return;
    (async () => {
      if (!user) {
        setError("No hay sesión iniciada.");
        return;
      }
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/agency/vehicles/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        setVehicle(await parseJsonResponse<VehicleDetail>(res));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [id, initializing, user, getIdToken]);

  if (initializing || loadingAgency || (!vehicle && !error)) return <p className="p-6 text-sm text-muted-foreground">Cargando…</p>;
  if (error) return <p className="p-6 text-sm text-error">No pudimos abrir este auto: {error}</p>;
  if (!agency) return <p className="p-6 text-sm text-error">No pudimos cargar tu plan.</p>;

  if (!canExportPDF(agency.plan)) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
        <p className="text-lg font-bold">Función Premium</p>
        <p className="text-sm text-muted-foreground">Generar la ficha PDF con QR es exclusivo para planes Pro Plus o superiores.</p>
        <Link href="/dashboard/plans" className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground">
          Ver planes
        </Link>
      </div>
    );
  }

  const v = vehicle!;
  const qrData = `https://matchcars.app/car/${id}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`;

  return (
    <div className="min-h-screen bg-background">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff !important; } }`}</style>

      <div className="no-print flex items-center justify-between border-b border-border p-4">
        <Link href={`/dashboard/stock/${id}`} className="text-sm font-semibold text-accent">
          ← Volver
        </Link>
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-foreground">
          Imprimir / Guardar PDF
        </button>
      </div>

      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 p-8 text-center">
        <p className="text-xl font-black text-accent">MatchCars</p>

        <div>
          <p className="text-2xl font-bold text-foreground">
            {v.brand} {v.model} {v.year}
          </p>
          {v.publicationCode && <p className="font-mono text-sm text-muted-foreground">Publicación #{v.publicationCode}</p>}
          <p className="text-4xl font-black text-accent">
            {v.currency} {Number(v.price).toLocaleString("es-AR")}
          </p>
        </div>

        {v.coverImage && (
          <div className="h-72 w-full max-w-md overflow-hidden rounded-2xl shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.coverImage} alt="" className="h-full w-full object-cover" />
          </div>
        )}

        <div className="flex w-full max-w-lg justify-around rounded-xl bg-card p-4">
          <div>
            <p className="text-lg font-bold">{v.km ? Number(v.km).toLocaleString("es-AR") : "0"}</p>
            <p className="text-xs uppercase text-muted-foreground">Kilómetros</p>
          </div>
          <div>
            <p className="text-lg font-bold">{v.year}</p>
            <p className="text-xs uppercase text-muted-foreground">Año</p>
          </div>
          <div>
            <p className="text-lg font-bold">{v.fuelType || "—"}</p>
            <p className="text-xs uppercase text-muted-foreground">Combustible</p>
          </div>
        </div>

        <div className="mt-4 flex w-full max-w-md flex-col items-center gap-2 border-t-2 border-dashed border-border pt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="Código QR" className="h-40 w-40" />
          <p className="text-base font-bold">¡Escaneá para ver más fotos y detalles!</p>
          <p className="text-xs text-muted-foreground">Publicado en MatchCars</p>
        </div>
      </div>
    </div>
  );
}
