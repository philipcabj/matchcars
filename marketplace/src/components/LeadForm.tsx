"use client";

import { trackWebEvent } from "@/lib/ga";
import { useState } from "react";

// Formulario "Consultar" — crea un lead vía POST /api/lead. Se muestra en la
// ficha del auto (vehicleId) y en la de agencia (agencyId, consulta general).
// El contacto por WhatsApp/email directo sigue estando aparte
// (SellerContactButtons); esto es para quien prefiere dejar sus datos y que lo
// contacten.
export function LeadForm({
  vehicleId,
  agencyId,
  sellerName,
  carLabel,
}: {
  vehicleId?: string;
  agencyId?: string;
  sellerName?: string;
  carLabel?: string;
}) {
  // Lazy init (puro): sella el momento en que el form apareció, para descartar
  // envíos instantáneos de bots en el route.
  const [renderedAt] = useState(() => Date.now());
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    message: carLabel ? `Hola, me interesa el ${carLabel}. ¿Sigue disponible?` : "Hola, quería hacer una consulta.",
    empresa: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, vehicleId, agencyId, renderedAt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se pudo enviar. Probá de nuevo.");
        setState("error");
        return;
      }
      trackWebEvent("web_lead_submit", { context: vehicleId ? "car_detail" : "agency_page" });
      setState("sent");
    } catch {
      setError("No se pudo enviar. Revisá tu conexión.");
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-center">
        <p className="text-2xl">✅</p>
        <p className="mt-2 text-sm font-semibold">¡Consulta enviada!</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {sellerName ? `${sellerName} va a` : "El vendedor va a"} recibir tus datos y te contacta.
        </p>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground";

  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-5">
      <p className="text-sm font-semibold">Dejá tu consulta</p>
      <p className="-mt-1.5 text-xs text-muted-foreground">Te contactan sin que tengas que instalar la app.</p>

      {/* honeypot */}
      <input
        type="text"
        name="empresa"
        tabIndex={-1}
        autoComplete="off"
        value={form.empresa}
        onChange={set("empresa")}
        className="hidden"
        aria-hidden="true"
      />

      <input className={inputCls} placeholder="Nombre" value={form.name} onChange={set("name")} required maxLength={80} />
      <div className="flex gap-2">
        <input
          className={inputCls}
          placeholder="Teléfono / WhatsApp"
          value={form.phone}
          onChange={set("phone")}
          inputMode="tel"
          maxLength={40}
        />
        <input
          className={inputCls}
          placeholder="Email"
          value={form.email}
          onChange={set("email")}
          type="email"
          maxLength={120}
        />
      </div>
      <textarea
        className={`${inputCls} min-h-20 resize-y`}
        placeholder="Tu mensaje"
        value={form.message}
        onChange={set("message")}
        required
        maxLength={1000}
      />

      {state === "error" && <p className="text-xs font-medium text-error">{error}</p>}

      <button
        type="submit"
        disabled={state === "sending"}
        className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-60"
      >
        {state === "sending" ? "Enviando…" : "Enviar consulta"}
      </button>
      <p className="text-[11px] text-muted-foreground">
        Dejá teléfono o email (al menos uno). No compartimos tus datos con nadie más.
      </p>
    </form>
  );
}
