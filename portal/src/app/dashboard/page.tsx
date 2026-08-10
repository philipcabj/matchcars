// portal/src/app/dashboard/page.tsx
"use client";

import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencyMe } from "@/hooks/useAgencyMe";
import { parseJsonResponse } from "@/lib/api-client";
import { LEAD_STAGE_BAR_COLOR, LEAD_STATUS_LABELS, LEAD_STATUS_ORDER, LeadListItem, LeadStats, LeadStatus, SalesByMonth } from "@/lib/leads";
import { AgencyReports } from "@/lib/reports";
import { STATUS_BAR_COLOR } from "@/lib/vehicle";
import Link from "next/link";
import { useEffect, useState } from "react";

function UsageBar({ used, limit }: { used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border">
      <div
        className="h-full rounded-full bg-accent transition-all"
        style={{ width: limit ? `${pct}%` : "100%" }}
      />
    </div>
  );
}

function BarList({
  title,
  linkHref,
  linkLabel,
  emptyLabel,
  rows,
}: {
  title: string;
  linkHref: string;
  linkLabel: string;
  emptyLabel: string;
  rows: { key: string; label: string; count: number; colorClass: string }[];
}) {
  const maxCount = Math.max(...rows.map((r) => r.count), 1);
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <Link href={linkHref} className="text-xs font-semibold text-accent">
          {linkLabel} →
        </Link>
      </div>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{r.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
                <div
                  className={`h-full rounded-full ${r.colorClass}`}
                  style={{ width: `${Math.max(4, Math.round((r.count / maxCount) * 100))}%` }}
                />
              </div>
              <span className="w-6 shrink-0 text-right text-xs font-semibold">{r.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtMonthShort(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "short" });
}

function SalesByMonthChart({ data }: { data: SalesByMonth[] }) {
  const maxCount = Math.max(...data.map((m) => m.count), 1);
  const hasAny = data.some((m) => m.count > 0);
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="mb-4 text-sm font-semibold">Ventas por mes</p>
      {!hasAny ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay ventas registradas. Se cuentan al marcar un lead como vendido en la app.
        </p>
      ) : (
        <div className="flex items-end gap-3" style={{ height: 110 }}>
          {data.map((m) => {
            const tooltip =
              [m.ars > 0 ? `ARS ${m.ars.toLocaleString("es-AR")}` : null, m.usd > 0 ? `USD ${m.usd.toLocaleString("es-AR")}` : null]
                .filter(Boolean)
                .join(" · ") || "Sin ventas";
            return (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-semibold">{m.count > 0 ? m.count : ""}</span>
                <div
                  className="w-full rounded-t-md bg-accent transition-all"
                  style={{ height: `${Math.max(4, Math.round((m.count / maxCount) * 76))}px` }}
                  title={tooltip}
                />
                <span className="text-[10px] capitalize text-muted-foreground">{fmtMonthShort(m.month)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { data, error, loading } = useAgencyMe();
  const { getIdToken } = useAuth();
  const [reports, setReports] = useState<AgencyReports | null>(null);
  const [leads, setLeads] = useState<{ leads: LeadListItem[]; stats: LeadStats; salesByMonth: SalesByMonth[] } | null>(null);

  useEffect(() => {
    if (!data) return;
    (async () => {
      const token = await getIdToken();
      const headers = { Authorization: `Bearer ${token}` };
      if (data.myPermissions.viewStats) {
        fetch("/portal/api/agency/reports", { headers })
          .then((res) => parseJsonResponse<AgencyReports>(res))
          .then(setReports)
          .catch(() => {});
      }
      if (data.myPermissions.manageLeads) {
        fetch("/portal/api/agency/leads", { headers })
          .then((res) => parseJsonResponse<{ leads: LeadListItem[]; stats: LeadStats; salesByMonth: SalesByMonth[] }>(res))
          .then(setLeads)
          .catch(() => {});
      }
    })();
  }, [data, getIdToken]);

  if (loading) return <p className="text-sm text-muted-foreground">Cargando tu agencia…</p>;
  if (error) return <p className="text-sm text-error">No pudimos cargar tu agencia: {error}</p>;
  if (!data) return null;

  const stockRows =
    reports?.statusBreakdown.slice(0, 4).map((s) => ({
      key: s.status,
      label: s.label,
      count: s.count,
      colorClass: STATUS_BAR_COLOR[s.status] || "bg-muted-foreground",
    })) ?? [];

  const leadRows: { key: string; label: string; count: number; colorClass: string }[] = leads
    ? LEAD_STATUS_ORDER.map((s: LeadStatus) => ({
        key: s,
        label: LEAD_STATUS_LABELS[s],
        count:
          s === "new"
            ? leads.stats.newCount
            : s === "contacted"
              ? leads.stats.contactedCount
              : s === "negotiation"
                ? leads.stats.negotiationCount
                : s === "won"
                  ? leads.stats.wonCount
                  : leads.stats.lostCount,
        colorClass: LEAD_STAGE_BAR_COLOR[s],
      }))
    : [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <div className="flex items-center gap-3">
          <Avatar src={data.avatarUrl} name={data.agencyName} size={44} />
          <h1 className="text-xl font-bold">{data.agencyName}</h1>
          <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-bold text-accent">
            {data.planLabel}
          </span>
          {!data.isDealerPlan && (
            <span className="rounded-full bg-muted/20 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              No es plan de agencia
            </span>
          )}
          <Link href="/dashboard/profile" className="ml-auto text-xs font-semibold text-accent">
            Editar perfil →
          </Link>
        </div>
        {!data.agencyExists && (
          <p className="mt-1 text-xs text-muted-foreground">
            Todavía no tenés un perfil de agencia inicializado en el portal — se crea automáticamente
            la primera vez que lo necesites (ej. al invitar a tu equipo).
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-medium text-muted-foreground">Autos activos</p>
          <p className="mt-1 text-2xl font-bold">
            {data.usage.vehicles.used}
            <span className="text-base font-medium text-muted-foreground">
              {" "}
              / {data.usage.vehicles.limit ?? "∞"}
            </span>
          </p>
          <UsageBar used={data.usage.vehicles.used} limit={data.usage.vehicles.limit} />
          <div className="mt-3 flex gap-3">
            <Link href="/dashboard/stock" className="text-xs font-semibold text-accent">
              Ver stock →
            </Link>
            <Link href="/dashboard/reports" className="text-xs font-semibold text-accent">
              Reportes →
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-medium text-muted-foreground">Usuarios de equipo</p>
          <p className="mt-1 text-2xl font-bold">
            {data.usage.seats.used}
            <span className="text-base font-medium text-muted-foreground">
              {" "}
              / {data.usage.seats.limit}
            </span>
          </p>
          <UsageBar used={data.usage.seats.used} limit={data.usage.seats.limit} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="mb-3 text-sm font-semibold">Lo que incluye tu plan</p>
        <div className="flex flex-wrap gap-2">
          {data.features.map((f) => (
            <span key={f} className="rounded-full bg-background px-3 py-1 text-xs text-foreground">
              {f}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Equipo</p>
          <Link href="/dashboard/team" className="text-xs font-semibold text-accent">
            Gestionar →
          </Link>
        </div>
        <ul className="flex flex-col gap-2">
          {data.members.map((m) => (
            <li
              key={m.uid}
              className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm"
            >
              <span>{m.name || m.email || m.uid}</span>
              <span className="text-xs font-medium text-muted-foreground capitalize">
                {m.role}
                {m.isImplicitOwner ? " · sin invitar todavía" : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {data.myPermissions.viewStats && (
        <BarList
          title="Stock por estado"
          linkHref="/dashboard/reports"
          linkLabel="Ver reportes"
          emptyLabel="Todavía no publicaste ningún auto."
          rows={stockRows}
        />
      )}

      {data.myPermissions.manageLeads && (
        <>
          <BarList
            title="Leads por etapa"
            linkHref="/dashboard/leads"
            linkLabel="Ver leads"
            emptyLabel="Todavía no tenés leads."
            rows={leadRows}
          />
          {leads && <SalesByMonthChart data={leads.salesByMonth} />}
        </>
      )}
    </div>
  );
}
