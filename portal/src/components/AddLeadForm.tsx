// portal/src/components/AddLeadForm.tsx
// Carga de un lead a mano (llamada, local, WhatsApp fuera de la app). No
// existe en la app hoy — ahí los leads son 100% automáticos desde el chat.
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { MANUAL_CONTACT_SOURCE_LABELS, ManualContactSource } from "@/lib/leads";
import { VehicleListItem } from "@/lib/vehicle";
import { FormEvent, useEffect, useState } from "react";

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

export function AddLeadForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const { getIdToken } = useAuth();
  const [vehicles, setVehicles] = useState<VehicleListItem[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [contactSource, setContactSource] = useState<ManualContactSource>("whatsapp");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const token = await getIdToken();
      const res = await fetch("/api/agency/vehicles", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setVehicles((await parseJsonResponse<{ vehicles: VehicleListItem[] }>(res)).vehicles);
    })();
  }, [getIdToken]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Falta el nombre del contacto.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/agency/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, phone, email, vehicleId: vehicleId || undefined, notes, contactSource }),
      });
      await parseJsonResponse(res);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <p className="text-sm font-semibold">Agregar lead</p>
      <p className="text-xs text-muted-foreground">
        Para consultas que te llegaron por teléfono, WhatsApp o en el local — sin pasar por el chat de la app.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Nombre *</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Pérez" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Teléfono</span>
          <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+54 9 11..." />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Email</span>
          <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Auto de interés</span>
          <select className={inputClass} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">Consulta general</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.brand} {v.model} {v.year}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">¿Cómo te contactó?</span>
          <select
            className={inputClass}
            value={contactSource}
            onChange={(e) => setContactSource(e.target.value as ManualContactSource)}
          >
            {Object.entries(MANUAL_CONTACT_SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Notas</span>
        <textarea className={`${inputClass} min-h-16`} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60"
        >
          {submitting ? "Guardando…" : "Agregar lead"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">
          Cancelar
        </button>
      </div>
    </form>
  );
}
