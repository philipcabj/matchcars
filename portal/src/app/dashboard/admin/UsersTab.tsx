"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { PLAN_LABELS, SubscriptionPlan, getPlanFeatures } from "@/lib/plans";
import { useMemo, useState, useEffect } from "react";

type UserRole = "user" | "moderator" | "admin";

interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  photoURL: string | null;
  avatarColor: string | null;
  initials: string | null;
  role: UserRole;
  plan: SubscriptionPlan;
  isBlocked: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
  cancelAtPeriodEnd: boolean;
  nextBillingDate: string | null;
}

const ROLE_LABELS: Record<UserRole, string> = { user: "Usuario", moderator: "Moderador", admin: "Admin" };
const ROLE_COLORS: Record<UserRole, string> = { user: "#6B7280", moderator: "#F59E0B", admin: "#EF4444" };

const PLAN_COLORS: Record<string, string> = {
  free: "#6B7280",
  pro_monthly: "#3B82F6",
  pro_annual: "#2563EB",
  pro_plus_monthly: "#6366F1",
  pro_plus_annual: "#4F46E5",
  pro_dealer_monthly: "#10B981",
  pro_dealer_annual: "#059669",
  dealer_pro_plus_monthly: "#0D9488",
  dealer_pro_plus_annual: "#0F766E",
  pro_dealer: "#9CA3AF",
};

export function UsersTab() {
  const { getIdToken } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [planFilter, setPlanFilter] = useState<SubscriptionPlan | "all">("all");
  const [editing, setEditing] = useState<AdminUser | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<{ users: AdminUser[] }>(res);
        setUsers(data.users);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users ?? []).filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (planFilter !== "all" && u.plan !== planFilter) return false;
      if (!q) return true;
      return u.firstName.toLowerCase().includes(q) || u.lastName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [users, search, roleFilter, planFilter]);

  const handleSaved = (updated: AdminUser) => {
    setUsers((prev) => (prev ?? []).map((u) => (u.id === updated.id ? updated : u)));
    setEditing(null);
  };

  if (error) return <p className="text-sm text-error">{error}</p>;
  if (!users) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="flex flex-col gap-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nombre o email…"
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
      />

      <div className="flex flex-wrap gap-1.5">
        {(["all", "user", "moderator", "admin"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRoleFilter(r)}
            className="rounded-full border px-2.5 py-1 text-xs font-semibold"
            style={
              roleFilter === r
                ? { backgroundColor: r === "all" ? "var(--accent)" : ROLE_COLORS[r], borderColor: r === "all" ? "var(--accent)" : ROLE_COLORS[r], color: "#fff" }
                : { borderColor: "var(--border)" }
            }
          >
            {r === "all" ? "Todos los roles" : ROLE_LABELS[r]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["all", ...(Object.keys(PLAN_LABELS) as SubscriptionPlan[])] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlanFilter(p)}
            className="rounded-full border px-2.5 py-1 text-xs font-semibold"
            style={
              planFilter === p
                ? { backgroundColor: p === "all" ? "var(--accent)" : PLAN_COLORS[p], borderColor: p === "all" ? "var(--accent)" : PLAN_COLORS[p], color: "#fff" }
                : { borderColor: "var(--border)" }
            }
          >
            {p === "all" ? "Todos los planes" : PLAN_LABELS[p]}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} usuario(s)</p>

      <div className="flex flex-col gap-2">
        {filtered.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => setEditing(u)}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition hover:border-accent"
          >
            {u.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.photoURL} alt="" className="h-10 w-10 shrink-0 rounded-full bg-background object-cover" />
            ) : (
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: u.avatarColor || "#6B7280" }}
              >
                {u.initials || `${u.firstName[0] ?? ""}${u.lastName[0] ?? ""}`.toUpperCase() || "?"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {u.firstName} {u.lastName}
              </p>
              <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: `${ROLE_COLORS[u.role]}22`, color: ROLE_COLORS[u.role] }}>
                  {ROLE_LABELS[u.role]}
                </span>
                <span className="rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: `${PLAN_COLORS[u.plan] ?? "#6B7280"}22`, color: PLAN_COLORS[u.plan] ?? "#6B7280" }}>
                  {PLAN_LABELS[u.plan] ?? u.plan}
                </span>
                {u.isBlocked && <span className="rounded-md bg-error/15 px-2 py-0.5 text-[11px] font-bold text-error">Bloqueado</span>}
              </div>
            </div>
            <div className="shrink-0 text-right text-[11px] text-muted-foreground">
              {u.createdAt && <p>Reg: {new Date(u.createdAt).toLocaleDateString("es-AR")}</p>}
              {u.lastLoginAt && <p>Login: {new Date(u.lastLoginAt).toLocaleDateString("es-AR")}</p>}
            </div>
          </button>
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">Sin resultados para esa búsqueda/filtro.</p>}
      </div>

      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />}
    </div>
  );
}

function EditUserModal({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: (u: AdminUser) => void }) {
  const { getIdToken } = useAuth();
  const [role, setRole] = useState<UserRole>(user.role);
  const [plan, setPlan] = useState<SubscriptionPlan>(user.plan);
  const [expiresAt, setExpiresAt] = useState(user.cancelAtPeriodEnd && user.nextBillingDate ? user.nextBillingDate.slice(0, 10) : "");
  const initialExpiresAt = useMemo(() => expiresAt, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const token = await getIdToken();
      const body: Record<string, unknown> = { role, plan };
      if (expiresAt !== initialExpiresAt) body.planExpiresAt = expiresAt;
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      await parseJsonResponse(res);
      onSaved({
        ...user,
        role,
        plan,
        cancelAtPeriodEnd: expiresAt !== initialExpiresAt ? !!expiresAt : user.cancelAtPeriodEnd,
        nextBillingDate: expiresAt !== initialExpiresAt ? (expiresAt ? `${expiresAt}T00:00:00.000Z` : null) : user.nextBillingDate,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  const handleUnblock = async () => {
    setSaving(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isBlocked: false }),
      });
      await parseJsonResponse(res);
      onSaved({ ...user, isBlocked: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-base font-bold">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-background" aria-label="Cerrar">
            ✕
          </button>
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Rol</p>
          <div className="flex gap-2">
            {(["user", "moderator", "admin"] as UserRole[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className="flex-1 rounded-lg border px-2 py-2 text-xs font-bold"
                style={
                  role === r
                    ? { backgroundColor: ROLE_COLORS[r], borderColor: ROLE_COLORS[r], color: "#fff" }
                    : { borderColor: "var(--border)" }
                }
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Plan</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PLAN_LABELS) as SubscriptionPlan[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlan(p)}
                className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
                style={
                  plan === p
                    ? { backgroundColor: PLAN_COLORS[p] ?? "#6B7280", borderColor: PLAN_COLORS[p] ?? "#6B7280", color: "#fff" }
                    : { borderColor: "var(--border)" }
                }
              >
                {PLAN_LABELS[p]}
              </button>
            ))}
          </div>
          <div className="mt-2 rounded-lg bg-background p-2.5">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Qué incluye {PLAN_LABELS[plan]}</p>
            {getPlanFeatures(plan).map((f) => (
              <p key={f} className="text-xs">
                {f}
              </p>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Vencimiento (opcional)</p>
          <input
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            placeholder="AAAA-MM-DD — vacío = no vence"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {expiresAt.trim()
              ? `El plan vuelve a "Gratis" automáticamente después del ${expiresAt}.`
              : "Sin fecha, el plan que asignes queda fijo hasta que lo cambies vos a mano."}
          </p>
        </div>

        {user.isBlocked && (
          <button
            type="button"
            onClick={handleUnblock}
            disabled={saving}
            className="rounded-lg border border-error px-4 py-2.5 text-sm font-bold text-error disabled:opacity-60"
          >
            Desbloquear usuario
          </button>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-3 text-sm font-bold text-accent-foreground disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
