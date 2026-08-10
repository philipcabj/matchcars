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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const vehicleRes = await fetch(`/api/agency/vehicles/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<VehicleFormValues>(vehicleRes);
        setInitialValues({ ...EMPTY_VEHICLE_FORM, ...data });
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [id, getIdToken]);

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
      <h1 className="mb-6 text-xl font-bold">Editar auto</h1>
      {error && <p className="mb-4 text-sm text-error">{error}</p>}
      <VehicleForm
        plan={agency.plan}
        userId={user.uid}
        initialValues={initialValues}
        submitLabel="Guardar cambios"
        submitting={submitting}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
