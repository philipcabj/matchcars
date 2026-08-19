// marketplace/src/app/confirmar-entrega/[vehicleId]/ConfirmDeliveryForm.tsx
"use client";

import { useState } from "react";

export function ConfirmDeliveryForm({ vehicleId, token }: { vehicleId: string; token: string }) {
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!score) {
      setError("Elegí una puntuación para el vendedor antes de confirmar.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/confirm-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId, token, score, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No pudimos confirmar la entrega.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-success/40 bg-success/5 p-6 text-center">
        <p className="text-sm font-semibold text-success">✓ ¡Listo! Entrega confirmada.</p>
        <p className="mt-1 text-sm text-muted-foreground">Gracias por calificar — ¡disfrutá tu auto!</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="mb-2 text-sm font-semibold">Puntuá al vendedor</p>
      <div className="mb-3 flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setScore(n)}
            aria-label={`${n} estrellas`}
            className={`text-3xl leading-none transition ${n <= score ? "text-amber-400" : "text-border"}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Comentario (opcional)"
        className="mb-3 min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
      />
      {error && <p className="mb-3 text-sm text-error">{error}</p>}
      <button
        onClick={submit}
        disabled={submitting}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-60"
      >
        {submitting ? "Confirmando…" : "Confirmar entrega y calificación"}
      </button>
      <p className="mt-2 text-center text-xs text-muted-foreground">Hace falta puntuar para poder confirmar.</p>
    </div>
  );
}
