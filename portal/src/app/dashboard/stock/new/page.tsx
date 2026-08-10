// portal/src/app/dashboard/stock/new/page.tsx
"use client";

import { VehicleForm } from "@/components/VehicleForm";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencyMe } from "@/hooks/useAgencyMe";
import { parseJsonResponse } from "@/lib/api-client";
import { VehicleFormValues } from "@/lib/vehicle";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewVehiclePage() {
  const { user, getIdToken } = useAuth();
  const { data: agency } = useAgencyMe();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: VehicleFormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch("/portal/api/agency/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(values),
      });
      await parseJsonResponse(res);
      router.push("/dashboard/stock");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user || !agency) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-bold">Publicar auto</h1>
      <p className="mb-6 text-sm text-muted-foreground">Se publica en revisión — un moderador lo aprueba antes de mostrarse.</p>
      {error && <p className="mb-4 text-sm text-error">{error}</p>}
      <VehicleForm plan={agency.plan} userId={user.uid} submitLabel="Publicar auto" submitting={submitting} onSubmit={handleSubmit} />
    </div>
  );
}
