// portal/src/app/dashboard/leads/page.tsx
"use client";

import { AddLeadForm } from "@/components/AddLeadForm";
import { AssigneeSelect } from "@/components/AssigneeSelect";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencyMe } from "@/hooks/useAgencyMe";
import { parseJsonResponse } from "@/lib/api-client";
import { LEAD_STATUS_LABELS, LeadListItem, LeadStats, LeadStatus } from "@/lib/leads";
import Link from "next/link";
import { useEffect, useState } from "react";

// Un lead "contactado"/"en negociación" sin ningún mensaje nuevo hace más de
// esto se resalta — evita que se enfríe una consulta por olvido.
const STALE_FOLLOWUP_DAYS = 3;

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: "bg-blue-500/15 text-blue-600",
  contacted: "bg-amber-500/15 text-amber-600",
  negotiation: "bg-cyan-500/15 text-cyan-600",
  won: "bg-success/15 text-success",
  lost: "bg-error/15 text-error",
};

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  const diff = current - previous;
  const pct = previous > 0 ? Math.round((diff / previous) * 100) : null;
  const color = diff > 0 ? "text-success" : diff < 0 ? "text-error" : "text-muted-foreground";
  const arrow = diff > 0 ? "↑" : diff < 0 ? "↓" : "→";
  const label = pct !== null ? `${arrow} ${Math.abs(pct)}%` : diff > 0 ? "nuevo" : "→";
  return (
    <span className={`text-xs font-semibold ${color}`}>
      {label} <span className="font-normal text-muted-foreground">vs. mes pasado ({previous})</span>
    </span>
  );
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  return `Hace ${days} días`;
}

export default function LeadsPage() {
  const { getIdToken } = useAuth();
  const { data: agency } = useAgencyMe();
  const [leads, setLeads] = useState<LeadListItem[] | null>(null);
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/agency/leads", { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<{ leads: LeadListItem[]; stats: LeadStats }>(res);
        setLeads(data.leads);
        setStats(data.stats);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [getIdToken, reloadKey]);

  const runAction = async (id: string, action: "advance" | "lost") => {
    setBusyId(id);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      await parseJsonResponse(res);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusyId(null);
    }
  };

  if (error && !leads) return <p className="text-sm text-error">No pudimos cargar los leads: {error}</p>;
  if (!leads || !stats) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const filtered = statusFilter === "all" ? leads : leads.filter((l) => l.status === statusFilter);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">Consultas de compradores por tus publicaciones.</p>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            + Agregar lead
          </button>
        )}
      </div>

      {showAddForm && (
        <AddLeadForm
          onCancel={() => setShowAddForm(false)}
          onCreated={() => {
            setShowAddForm(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      {stats.total > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xl font-extrabold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
            <div className="mt-1">
              <TrendBadge current={stats.leadsThisMonth} previous={stats.leadsLastMonth} />
            </div>
          </div>
          <div className="rounded-xl bg-blue-500/10 p-3">
            <p className="text-xl font-extrabold text-blue-600">{stats.newCount}</p>
            <p className="text-xs text-blue-600">Nuevos</p>
          </div>
          <div className="rounded-xl bg-cyan-500/10 p-3">
            <p className="text-xl font-extrabold text-cyan-600">{stats.negotiationCount}</p>
            <p className="text-xs text-cyan-600">Negociando</p>
          </div>
          <div className="rounded-xl bg-success/10 p-3">
            <p className="text-xl font-extrabold text-success">{stats.wonCount}</p>
            <p className="text-xs text-success">Vendidos</p>
          </div>
        </div>
      )}

      {stats.total > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
          <div>
            {stats.arsTotal > 0 && <p className="text-sm font-bold">ARS {stats.arsTotal.toLocaleString("es-AR")}</p>}
            {stats.usdTotal > 0 && <p className="text-sm font-bold">USD {stats.usdTotal.toLocaleString("es-AR")}</p>}
            {stats.arsTotal === 0 && stats.usdTotal === 0 && (
              <p className="text-xs text-muted-foreground">Ingresos: se registran al marcar un lead como vendido en la app.</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-lg font-extrabold">{stats.conversionRate}%</p>
            <p className="text-xs text-muted-foreground">conversión</p>
            <div className="mt-1">
              <TrendBadge current={stats.salesThisMonth} previous={stats.salesLastMonth} />
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {(["all", ...Object.keys(LEAD_STATUS_LABELS)] as (LeadStatus | "all")[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              statusFilter === s ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground"
            }`}
          >
            {s === "all" ? "Todos" : LEAD_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {leads.length === 0
            ? "Todavía no tenés leads. Van a aparecer solos cuando compradores te escriban por tus publicaciones en la app, o los podés cargar a mano con \"+ Agregar lead\"."
            : "Sin leads para este filtro."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((lead) => {
            const veh = lead.vehicleSnapshot;
            const buyer = lead.buyerSnapshot;
            const manual = lead.manualContact;
            const title = veh?.brand || veh?.model ? `${veh?.brand ?? ""} ${veh?.model ?? ""} ${veh?.year ?? ""}`.trim() : "Consulta general";
            const buyerName = manual?.name || (buyer?.firstName || buyer?.lastName ? `${buyer?.firstName ?? ""} ${buyer?.lastName ?? ""}`.trim() : "Comprador");
            const contactLine = manual ? [manual.phone, manual.email].filter(Boolean).join(" · ") : "";
            const canAct = lead.status !== "won" && lead.status !== "lost";
            const days = daysSince(lead.lastMessageAt);
            const isStale = (lead.status === "contacted" || lead.status === "negotiation") && days !== null && days >= STALE_FOLLOWUP_DAYS;
            return (
              <Link
                key={lead.id}
                href={`/dashboard/leads/${lead.id}`}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 transition hover:border-accent sm:flex-row sm:items-center"
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: buyer?.avatarColor || "#F97316" }}
                >
                  {buyer?.initials || buyerName.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{title}</p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {isStale && (
                        <span
                          className="rounded-full bg-error/15 px-1.5 py-0.5 text-[10px] font-bold text-error"
                          title={`Sin seguimiento hace ${days} días`}
                        >
                          ⏰ {days}d sin seguir
                        </span>
                      )}
                      {lead.lastMessageAt && <span className="text-xs text-muted-foreground">{fmtDate(lead.lastMessageAt)}</span>}
                    </div>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {buyerName}
                    {manual && <span className="ml-1.5 rounded-full bg-muted/20 px-1.5 py-0.5 text-[10px] font-semibold">manual</span>}
                    {contactLine && <span> · {contactLine}</span>}
                  </p>
                  {manual?.notes && <p className="truncate text-xs italic text-muted-foreground">{manual.notes}</p>}
                  {lead.status === "won" && lead.dealPrice ? (
                    <p className="text-xs font-semibold text-accent">
                      Cierre: {lead.dealCurrency} {Number(lead.dealPrice).toLocaleString("es-AR")}
                    </p>
                  ) : (
                    veh?.price && (
                      <p className="text-xs font-semibold text-accent">
                        {veh.currency} {Number(veh.price).toLocaleString("es-AR")}
                      </p>
                    )
                  )}
                  {lead.lastMessage && <p className="truncate text-xs text-muted-foreground">{lead.lastMessage}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {agency && agency.members.length > 1 && (
                    <AssigneeSelect
                      leadId={lead.id}
                      assignedTo={lead.assignedTo}
                      members={agency.members}
                      onAssigned={(uid) =>
                        setLeads((prev) => prev && prev.map((l) => (l.id === lead.id ? { ...l, assignedTo: uid } : l)))
                      }
                    />
                  )}
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[lead.status]}`}>
                    {LEAD_STATUS_LABELS[lead.status]}
                  </span>
                  {canAct && lead.status !== "negotiation" && (
                    <button
                      disabled={busyId === lead.id}
                      onClick={(e) => {
                        e.preventDefault();
                        runAction(lead.id, "advance");
                      }}
                      className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                    >
                      Avanzar
                    </button>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
