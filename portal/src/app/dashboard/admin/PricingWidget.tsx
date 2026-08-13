"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { useEffect, useState } from "react";

export function PricingWidget() {
  const { getIdToken } = useAuth();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/admin/pricing", { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<{ usdToArsRate: number | null }>(res);
        if (data.usdToArsRate) setValue(String(data.usdToArsRate));
      } catch {
        // silencioso — el input queda vacío, se puede cargar igual
      } finally {
        setLoading(false);
      }
    })();
  }, [getIdToken]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/admin/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ usdToArsRate: Number(value.replace(/\./g, "").replace(",", ".")) }),
      });
      await parseJsonResponse(res);
      setMessage({ text: "Cotización actualizada." });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Error desconocido", error: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-1 text-sm font-bold">Cotización USD → ARS</p>
      <p className="mb-3 text-xs text-muted-foreground">Se usa para convertir los precios de referencia en dólares a pesos argentinos.</p>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">1 USD =</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={loading ? "Cargando…" : "Ej: 1200"}
          disabled={loading || saving}
          inputMode="decimal"
          className="w-32 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-60"
        />
        <span className="text-sm text-muted-foreground">ARS</span>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || saving}
          className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
      {message && <p className={`mt-2 text-xs ${message.error ? "text-error" : "text-success"}`}>{message.text}</p>}
    </div>
  );
}
