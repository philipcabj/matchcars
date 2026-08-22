// portal/src/app/dashboard/team/page.tsx
"use client";

import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencyMe } from "@/hooks/useAgencyMe";
import { parseJsonResponse } from "@/lib/api-client";
import { trackPortalEvent } from "@/lib/ga";
import { AGENCY_ROLE_LABELS, AgencyRole } from "@/lib/plans";
import Link from "next/link";
import { FormEvent, useState } from "react";

const ROLE_OPTIONS: AgencyRole[] = ["manager", "sales"];

export default function TeamPage() {
  const { getIdToken } = useAuth();
  const { data, error, loading, refetch } = useAgencyMe();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AgencyRole>("sales");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setBusy(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/agency/team", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, role }),
      });
      const data = await parseJsonResponse<{ invited: boolean }>(res);
      setFormSuccess(data.invited ? `Le mandamos una invitación a ${email}.` : `${email} ya es parte del equipo.`);
      trackPortalEvent("portal_team_member_added", { role, invited: data.invited });
      setEmail("");
      refetch();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  };

  const cancelInvite = async (inviteId: string) => {
    setActionError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/team/invite/${inviteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await parseJsonResponse(res);
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Error desconocido");
    }
  };

  const changeRole = async (uid: string, newRole: AgencyRole) => {
    setActionError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/team/${uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: newRole }),
      });
      await parseJsonResponse(res);
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Error desconocido");
    }
  };

  const removeMember = async (uid: string) => {
    setActionError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/team/${uid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await parseJsonResponse(res);
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Error desconocido");
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (error) return <p className="text-sm text-error">No pudimos cargar el equipo: {error}</p>;
  if (!data) return null;

  const canManage = data.myPermissions.manageTeam;
  const seatsLeft = data.usage.seats.limit - data.usage.seats.used;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Equipo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.usage.seats.used} de {data.usage.seats.limit} usuarios incluidos en tu plan.
          </p>
        </div>
        {canManage && (
          <Link href="/dashboard/team/activity" className="shrink-0 text-xs font-semibold text-accent">
            Ver actividad →
          </Link>
        )}
      </div>

      {actionError && <p className="text-sm text-error">{actionError}</p>}

      <div className="flex flex-col gap-2">
        {data.members.map((m) => {
          const isOwner = m.role === "owner";
          const isMe = m.uid === data.myUid;
          return (
            <div key={m.uid} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <Avatar name={m.name || m.email || m.uid} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {m.name || m.email} {isMe && <span className="text-xs font-normal text-muted-foreground">(vos)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              {canManage && !isOwner ? (
                <select
                  value={m.role}
                  onChange={(e) => changeRole(m.uid, e.target.value as AgencyRole)}
                  className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {AGENCY_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
                  {AGENCY_ROLE_LABELS[m.role as AgencyRole] ?? m.role}
                </span>
              )}
              {canManage && !isOwner && (
                <button onClick={() => removeMember(m.uid)} className="text-xs font-semibold text-error">
                  Quitar
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canManage && data.pendingInvites.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invitaciones pendientes</p>
          {data.pendingInvites.map((inv) => (
            <div key={inv.id} className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{inv.email}</p>
                <p className="text-xs text-muted-foreground">
                  Invitado como {AGENCY_ROLE_LABELS[inv.role as AgencyRole] ?? inv.role}
                  {inv.createdAt ? ` · ${new Date(inv.createdAt).toLocaleDateString("es-AR")}` : ""}
                </p>
              </div>
              <span className="rounded-full bg-muted/20 px-2.5 py-1 text-xs font-semibold text-muted-foreground">Pendiente</span>
              <button onClick={() => cancelInvite(inv.id)} className="text-xs font-semibold text-error">
                Cancelar
              </button>
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="mb-1 text-sm font-semibold">Agregar usuario al equipo</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Si ya tiene cuenta en Matchcars lo sumamos directo. Si no, le mandamos una invitación por email para que se cree la cuenta.
          </p>
          {seatsLeft <= 0 ? (
            <p className="text-sm text-muted-foreground">
              Ya usaste todos los usuarios incluidos en tu plan. Actualizá tu plan para sumar más.
            </p>
          ) : (
            <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span className="font-medium">Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                  placeholder="empleado@agencia.com"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Rol</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as AgencyRole)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {AGENCY_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-60"
              >
                {busy ? "Agregando…" : "Agregar"}
              </button>
            </form>
          )}
          {formError && <p className="mt-2 text-sm text-error">{formError}</p>}
          {formSuccess && <p className="mt-2 text-sm text-success">{formSuccess}</p>}
        </div>
      )}
    </div>
  );
}
