"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { AgencyMember } from "@/lib/agency";
import { useState } from "react";

// Selector chico de "quién sigue este lead" — reusado en la lista y en el
// detalle. Solo tiene sentido mostrarlo si la agencia tiene más de un
// miembro; con un solo usuario (el dueño) no aporta nada, así que las
// pantallas que lo usan deciden si renderizarlo o no.
export function AssigneeSelect({
  leadId,
  assignedTo,
  members,
  onAssigned,
  className,
  locked,
}: {
  leadId: string;
  assignedTo: string | null | undefined;
  members: AgencyMember[];
  onAssigned: (uid: string | null) => void;
  className?: string;
  // Lead ganado o perdido: el vendedor queda fijo (ver leads/[id]/route.ts
  // "assign") para no mover a quién se le atribuye la comisión/performance
  // de un cierre ya hecho.
  locked?: boolean;
}) {
  const { getIdToken } = useAuth();
  const [busy, setBusy] = useState(false);

  const handleChange = async (value: string) => {
    setBusy(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "assign", assignedTo: value || null }),
      });
      await parseJsonResponse(res);
      onAssigned(value || null);
    } catch {
      // Silencioso a propósito: es un control chico inline, no vale la pena
      // un bloque de error dedicado — el valor simplemente no cambia.
    } finally {
      setBusy(false);
    }
  };

  if (locked) {
    const name = members.find((m) => m.uid === assignedTo)?.name || members.find((m) => m.uid === assignedTo)?.email;
    return (
      <span
        title="Lead cerrado — el vendedor asignado ya no se puede cambiar"
        className={
          className ??
          "rounded-full border border-border bg-background px-2 py-1 text-xs font-semibold text-muted-foreground"
        }
      >
        🔒 {name || "Sin asignar"}
      </span>
    );
  }

  return (
    <select
      value={assignedTo ?? ""}
      disabled={busy}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        handleChange(e.target.value);
      }}
      className={
        className ??
        "rounded-full border border-border bg-background px-2 py-1 text-xs font-semibold text-muted-foreground outline-none focus:border-accent"
      }
    >
      <option value="">Sin asignar</option>
      {members.map((m) => (
        <option key={m.uid} value={m.uid}>
          {m.name || m.email || m.uid}
        </option>
      ))}
    </select>
  );
}
