// portal/src/app/dashboard/comisiones/page.tsx
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useAgencyMe } from "@/hooks/useAgencyMe";
import { parseJsonResponse } from "@/lib/api-client";
import { COMMISSION_TYPE_LABELS, CommissionRule, CommissionRuleType } from "@/lib/commissions";
import { useEffect, useMemo, useState } from "react";

interface CommissionEntryRow {
  saleId: string;
  vehicleId: string;
  sellerUid: string;
  vehicleSnapshot: { brand?: string; model?: string; year?: number } | null;
  dealPrice: number;
  dealCurrency: string;
  margin: number | null;
  amount: number;
  soldAt: string | null;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const inputClass = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

export default function ComisionesPage() {
  const { getIdToken } = useAuth();
  const { data: agency } = useAgencyMe();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [entries, setEntries] = useState<CommissionEntryRow[] | null>(null);
  const [bySeller, setBySeller] = useState<{ sellerUid: string; arsTotal: number; usdTotal: number; count: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [rule, setRule] = useState<CommissionRule | null>(null);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [savingRule, setSavingRule] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [commRes, ruleRes] = await Promise.all([
          fetch(`/api/agency/commissions?month=${month}`, { headers }),
          fetch("/api/agency/commission-rules", { headers }),
        ]);
        const commData = await parseJsonResponse<{ entries: CommissionEntryRow[]; bySeller: typeof bySeller }>(commRes);
        setEntries(commData.entries);
        setBySeller(commData.bySeller);
        const ruleData = await parseJsonResponse<{ rule: CommissionRule }>(ruleRes);
        setRule(ruleData.rule);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [getIdToken, month]);

  const memberName = useMemo(() => {
    const map = new Map((agency?.members ?? []).map((m) => [m.uid, m.name || m.email || m.uid]));
    return (uid: string) => map.get(uid) || uid;
  }, [agency]);

  const saveRule = async () => {
    if (!editingRule) return;
    setSavingRule(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/agency/commission-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(editingRule),
      });
      const data = await parseJsonResponse<{ rule: CommissionRule }>(res);
      setRule(data.rule);
      setEditingRule(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSavingRule(false);
    }
  };

  if (agency && !agency.isDealerPlan) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
        <p className="font-semibold">Función exclusiva de planes Dealer</p>
        <p className="mt-2 text-sm text-muted-foreground">Las comisiones de equipo están disponibles desde el plan Dealer.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Comisiones</h1>
        <p className="mt-1 text-sm text-muted-foreground">Comisiones calculadas por vendedor al cerrar cada venta.</p>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {agency?.myPermissions.manageBilling && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Regla de comisión</p>
            {!editingRule && rule && (
              <button onClick={() => setEditingRule(rule)} className="text-xs font-semibold text-accent">
                Editar
              </button>
            )}
          </div>

          {!editingRule && rule && (
            <p className="text-sm text-muted-foreground">
              {COMMISSION_TYPE_LABELS[rule.tipo]}
              {rule.tipo !== "escalonado" && <> — <span className="font-semibold text-foreground">{rule.valor}{rule.tipo === "fijo" ? "" : "%"}</span></>}
              {rule.tipo === "escalonado" && (
                <span className="mt-1 block">
                  {rule.escalones.map((t, i) => (
                    <span key={i} className="mr-3 inline-block">
                      {t.desde.toLocaleString("es-AR")}–{t.hasta ? t.hasta.toLocaleString("es-AR") : "∞"}: <b>{t.porcentaje}%</b>
                    </span>
                  ))}
                </span>
              )}
            </p>
          )}

          {editingRule && (
            <div className="flex flex-col gap-3">
              <select
                className={inputClass}
                value={editingRule.tipo}
                onChange={(e) =>
                  setEditingRule({
                    ...editingRule,
                    tipo: e.target.value as CommissionRuleType,
                    escalones: e.target.value === "escalonado" && editingRule.escalones.length === 0 ? [{ desde: 0, hasta: null, porcentaje: 3 }] : editingRule.escalones,
                  })
                }
              >
                {Object.entries(COMMISSION_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>

              {editingRule.tipo !== "escalonado" && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">{editingRule.tipo === "fijo" ? "Monto fijo" : "Porcentaje"}</span>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    className={inputClass}
                    value={editingRule.valor}
                    onChange={(e) => setEditingRule({ ...editingRule, valor: Number(e.target.value) })}
                  />
                </label>
              )}

              {editingRule.tipo === "escalonado" && (
                <div className="flex flex-col gap-2">
                  {editingRule.escalones.map((tier, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="number"
                        placeholder="Desde"
                        className={`${inputClass} w-28`}
                        value={tier.desde}
                        onChange={(e) => {
                          const next = [...editingRule.escalones];
                          next[i] = { ...tier, desde: Number(e.target.value) };
                          setEditingRule({ ...editingRule, escalones: next });
                        }}
                      />
                      <input
                        type="number"
                        placeholder="Hasta (vacío = sin techo)"
                        className={`${inputClass} w-40`}
                        value={tier.hasta ?? ""}
                        onChange={(e) => {
                          const next = [...editingRule.escalones];
                          next[i] = { ...tier, hasta: e.target.value === "" ? null : Number(e.target.value) };
                          setEditingRule({ ...editingRule, escalones: next });
                        }}
                      />
                      <input
                        type="number"
                        placeholder="%"
                        className={`${inputClass} w-20`}
                        value={tier.porcentaje}
                        onChange={(e) => {
                          const next = [...editingRule.escalones];
                          next[i] = { ...tier, porcentaje: Number(e.target.value) };
                          setEditingRule({ ...editingRule, escalones: next });
                        }}
                      />
                      <button
                        onClick={() => setEditingRule({ ...editingRule, escalones: editingRule.escalones.filter((_, j) => j !== i) })}
                        className="text-xs text-error"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      setEditingRule({ ...editingRule, escalones: [...editingRule.escalones, { desde: 0, hasta: null, porcentaje: 3 }] })
                    }
                    className="self-start text-xs font-semibold text-accent"
                  >
                    + Agregar escalón
                  </button>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button onClick={() => setEditingRule(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                  Cancelar
                </button>
                <button
                  disabled={savingRule}
                  onClick={saveRule}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
                >
                  {savingRule ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button onClick={() => setMonth((m) => shiftMonth(m, -1))} className="rounded-lg border border-border px-3 py-1.5 text-sm">
          ← Mes anterior
        </button>
        <p className="text-sm font-semibold capitalize">{monthLabel(month)}</p>
        <button onClick={() => setMonth((m) => shiftMonth(m, 1))} className="rounded-lg border border-border px-3 py-1.5 text-sm">
          Mes siguiente →
        </button>
      </div>

      {bySeller.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {bySeller.map((s) => (
            <div key={s.sellerUid} className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">{memberName(s.sellerUid)}</p>
              <p className="text-xs text-muted-foreground">{s.count} venta{s.count === 1 ? "" : "s"}</p>
              {s.arsTotal > 0 && <p className="mt-1 text-lg font-extrabold">ARS {s.arsTotal.toLocaleString("es-AR")}</p>}
              {s.usdTotal > 0 && <p className="text-lg font-extrabold">USD {s.usdTotal.toLocaleString("es-AR")}</p>}
            </div>
          ))}
        </div>
      )}

      {!entries ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Sin ventas con vendedor asignado en este mes. La comisión solo se calcula si el lead tenía un vendedor asignado al cerrar la venta.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((e) => (
            <div key={e.saleId} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {e.vehicleSnapshot?.brand} {e.vehicleSnapshot?.model} {e.vehicleSnapshot?.year}
                </p>
                <p className="text-xs text-muted-foreground">
                  {memberName(e.sellerUid)} · {e.dealCurrency} {e.dealPrice.toLocaleString("es-AR")}
                  {e.margin !== null && <> · margen {e.dealCurrency} {e.margin.toLocaleString("es-AR")}</>}
                </p>
              </div>
              <p className="shrink-0 text-sm font-extrabold text-accent">
                {e.dealCurrency} {e.amount.toLocaleString("es-AR")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
