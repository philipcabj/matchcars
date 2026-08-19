// portal/src/app/dashboard/stock/[id]/edit/page.tsx
"use client";

import { VehicleForm } from "@/components/VehicleForm";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencyMe } from "@/hooks/useAgencyMe";
import { parseJsonResponse } from "@/lib/api-client";
import { EMPTY_VEHICLE_FORM, VehicleFormValues } from "@/lib/vehicle";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function EditVehiclePage() {
  const { id } = useParams<{ id: string }>();
  const { user, getIdToken } = useAuth();
  const { data: agency } = useAgencyMe();
  const router = useRouter();
  const [initialValues, setInitialValues] = useState<VehicleFormValues | null>(null);
  // Solo importa para decidir el botón/flujo de publicar — no es parte del
  // formulario en sí (VehicleForm no conoce ni toca status/published).
  const [status, setStatus] = useState<string>("available");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const vehicleRes = await fetch(`/api/agency/vehicles/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<VehicleFormValues & { status?: string }>(vehicleRes);
        setInitialValues({ ...EMPTY_VEHICLE_FORM, ...data });
        setStatus(data.status ?? "available");
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [id, getIdToken]);

  const isPreparing = status === "a_preparar";

  const handleSubmit = async (values: VehicleFormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/vehicles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(values),
      });
      await parseJsonResponse(res);

      // "A preparar" (auto recibido como parte de pago) no tiene ningún otro
      // camino para salir de ese estado — antes de esto, guardar cambios acá
      // no lo movía a ningún lado y quedaba invisible para siempre, sin
      // pasar por moderación ni publicarse. Guardar y publicar hacen los dos
      // pasos juntos para no dejar un estado intermedio a medio completar.
      if (isPreparing) {
        const pubRes = await fetch(`/api/agency/vehicles/${id}/publish`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        await parseJsonResponse(pubRes);
      }

      router.push(`/dashboard/stock/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) return <p className="text-sm text-error">No pudimos abrir este auto: {loadError}</p>;
  if (!user || !agency || !initialValues) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/stock/${id}`} className="mb-2 inline-block text-xs font-semibold text-accent">
        ← Volver al detalle
      </Link>
      <h1 className="mb-1 text-xl font-bold">Editar auto</h1>
      {isPreparing && (
        <p className="mb-4 text-sm text-muted-foreground">
          Este auto entró como parte de pago y todavía no está publicado. Completá lo que falte y guardá — se manda
          solo a revisión, igual que cualquier auto nuevo.
        </p>
      )}
      {error && <p className="mb-4 text-sm text-error">{error}</p>}
      <VehicleForm
        plan={agency.plan}
        userId={user.uid}
        initialValues={initialValues}
        submitLabel={isPreparing ? "Guardar y enviar a revisión" : "Guardar cambios"}
        submitting={submitting}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
