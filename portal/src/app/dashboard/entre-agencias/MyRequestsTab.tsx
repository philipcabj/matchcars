// portal/src/app/dashboard/entre-agencias/MyRequestsTab.tsx
// Mis pedidos publicados — formulario para crear uno nuevo, cerrar/reabrir
// los propios, y ver de entrada si ya hay autos de otras agencias que
// podrían servir (matches, calculado server-side).
"use client";

import { ThousandsInput } from "@/components/ThousandsInput";
import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { useState } from "react";
import type { AgencyRequestItem } from "./types";

const inputClass = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

function fmtRange(item: AgencyRequestItem): string {
  const parts: string[] = [];
  if (item.yearMin || item.yearMax) parts.push(`${item.yearMin ?? "…"}–${item.yearMax ?? "…"}`);
  if (item.priceMax) parts.push(`hasta ${item.currency} ${item.priceMax.toLocaleString("es-AR")}`);
  return parts.join(" · ");
}

export function MyRequestsTab({ requests, onChanged }: { requests: AgencyRequestItem[]; onChanged: () => void }) {
  const { getIdToken } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [yearMin, setYearMin] = useState("");
  const [yearMax, setYearMax] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [currency, setCurrency] = useState<"ARS" | "USD">("ARS");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const publish = async () => {
    if (!brand.trim() || !model.trim()) {
      setError("Marca y modelo son obligatorios.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/agency/agency-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          brand: brand.trim(),
          model: model.trim(),
          yearMin: yearMin || null,
          yearMax: yearMax || null,
          priceMax: priceMax || null,
          currency,
          notes: notes.trim(),
        }),
      });
      await parseJsonResponse(res);
      setBrand("");
      setModel("");
      setYearMin("");
      setYearMax("");
      setPriceMax("");
      setNotes("");
      setShowForm(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id: string, status: "open" | "closed") => {
    setBusyId(id);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/agency-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      await parseJsonResponse(res);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {!showForm ? (
        <button onClick={() => setShowForm(true)} className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">
          + Publicar pedido
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Marca *" value={brand} onChange={(e) => setBrand(e.target.value)} className={inputClass} />
            <input placeholder="Modelo *" value={model} onChange={(e) => setModel(e.target.value)} className={inputClass} />
            <input placeholder="Año desde" value={yearMin} onChange={(e) => setYearMin(e.target.value.replace(/\D/g, ""))} className={inputClass} />
            <input placeholder="Año hasta" value={yearMax} onChange={(e) => setYearMax(e.target.value.replace(/\D/g, ""))} className={inputClass} />
            <div className="flex gap-1">
              <select value={currency} onChange={(e) => setCurrency(e.target.value === "USD" ? "USD" : "ARS")} className={inputClass}>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
              <ThousandsInput placeholder="Precio máx." value={priceMax} onChange={setPriceMax} className={`${inputClass} flex-1`} />
            </div>
          </div>
          <textarea
            placeholder="Notas para las demás agencias (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${inputClass} min-h-16`}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground">
              Cancelar
            </button>
            <button onClick={publish} disabled={saving} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-60">
              {saving ? "Publicando…" : "Publicar"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-error">{error}</p>}

      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no publicaste ningún pedido.</p>
      ) : (
        requests.map((item) => (
          <div key={item.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {item.brand} {item.model}{" "}
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.status === "open" ? "bg-success/15 text-success" : "bg-muted/20 text-muted-foreground"}`}>
                    {item.status === "open" ? "Abierto" : "Cerrado"}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">{fmtRange(item)}</p>
                {item.notes && <p className="mt-1 text-sm">{item.notes}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.responseCount} respuesta{item.responseCount === 1 ? "" : "s"} — mirá &quot;Mis conversaciones&quot; para verlas.
                </p>
              </div>
              <button
                onClick={() => setStatus(item.id, item.status === "open" ? "closed" : "open")}
                disabled={busyId === item.id}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              >
                {item.status === "open" ? "Cerrar" : "Reabrir"}
              </button>
            </div>
            {item.matches.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                💡 Ya hay {item.matches.length} auto{item.matches.length > 1 ? "s" : ""} de otras agencias que podría{item.matches.length > 1 ? "n" : ""} servir.
              </p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
