// portal/src/app/dashboard/costos/PorAutoTab.tsx
// Stock activo con costo/gastos/margen — reusa GET /api/agency/vehicles
// (mismo endpoint que Stock, ya trae purchasePrice/expensesTotal/margin
// calculado). Clickear una fila abre el editor de costos (CostsCard) en un
// drawer, sin navegar a la ficha del auto.
"use client";

import { CostsCard } from "@/components/CostsCard";
import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { STATUS_LABELS, VehicleListItem } from "@/lib/vehicle";
import { useEffect, useMemo, useState } from "react";

// "reserved"/"sold" ya se cuentan como venta cerrada (ver /api/agency/costos)
// — acá solo el stock que todavía está en juego.
const CLOSED_STATUSES = ["sold", "reserved", "deleted"];

function fmtMoney(currency: string | null | undefined, value: number | null | undefined): string {
  if (value == null) return "—";
  return `${currency ?? "ARS"} ${value.toLocaleString("es-AR")}`;
}

export function PorAutoTab() {
  const { getIdToken } = useAuth();
  const [vehicles, setVehicles] = useState<VehicleListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<VehicleListItem | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/agency/vehicles", { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<{ vehicles: VehicleListItem[] }>(res);
        setVehicles(data.vehicles);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [getIdToken]);

  // CostsCard guarda directo contra la API (no vía este estado) — sin
  // sincronizar acá, cerrar y reabrir el drawer mostraba el valor viejo
  // (la lista nunca se había vuelto a pedir), como si no hubiese guardado.
  const applyPatch = (vehicleId: string, patch: { purchasePrice?: number | null; expensesTotal?: number }) => {
    setVehicles((prev) =>
      (prev ?? []).map((v) => {
        if (v.id !== vehicleId) return v;
        const next = { ...v, ...patch };
        const nextPurchasePrice = patch.purchasePrice !== undefined ? patch.purchasePrice : v.purchasePrice ?? null;
        const nextExpensesTotal = patch.expensesTotal !== undefined ? patch.expensesTotal : v.expensesTotal ?? 0;
        next.margin = nextPurchasePrice != null ? (v.price ?? 0) - nextPurchasePrice - nextExpensesTotal : null;
        return next;
      })
    );
    setSelected((prev) => (prev && prev.id === vehicleId ? { ...prev, ...patch } : prev));
  };

  const activeVehicles = useMemo(
    () => (vehicles ?? []).filter((v) => !CLOSED_STATUSES.includes(v.status ?? "available")),
    [vehicles]
  );

  if (error) return <p className="text-sm text-error">{error}</p>;
  if (!vehicles) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="flex flex-col gap-3">
      {activeVehicles.length > 0 && (
        <p className="text-xs text-muted-foreground">Tocá un auto o &quot;+ Gasto&quot; para cargar el costo de compra y los gastos que le vayan surgiendo.</p>
      )}
      {activeVehicles.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay stock activo todavía.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Auto</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Costo compra</th>
                <th className="px-4 py-3 font-medium">Gastos</th>
                <th className="px-4 py-3 font-medium">Costo total</th>
                <th className="px-4 py-3 font-medium">Precio publicado</th>
                <th className="px-4 py-3 font-medium">Margen estimado</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {activeVehicles.map((v) => {
                const statusInfo = STATUS_LABELS[v.status ?? "available"] ?? { label: v.status, className: "bg-muted/20 text-muted-foreground" };
                const costTotal = v.purchasePrice != null ? v.purchasePrice + (v.expensesTotal ?? 0) : null;
                return (
                  <tr
                    key={v.id}
                    onClick={() => setSelected(v)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-background"
                  >
                    <td className="px-4 py-3 font-medium">
                      {v.brand} {v.model} {v.year}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusInfo.className}`}>{statusInfo.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      {v.purchasePrice != null ? fmtMoney(v.currency, v.purchasePrice) : <span className="text-muted-foreground">Sin cargar</span>}
                    </td>
                    <td className="px-4 py-3">{fmtMoney(v.currency, v.expensesTotal ?? 0)}</td>
                    <td className="px-4 py-3 font-semibold">{fmtMoney(v.currency, costTotal)}</td>
                    <td className="px-4 py-3">{fmtMoney(v.currency, v.price ?? null)}</td>
                    <td className="px-4 py-3">
                      {v.margin != null ? (
                        <span className={`font-semibold ${v.margin >= 0 ? "text-success" : "text-error"}`}>{fmtMoney(v.currency, v.margin)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(v);
                        }}
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground"
                      >
                        + Gasto
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setSelected(null)}>
          <div className="flex h-full w-full max-w-md flex-col gap-3 overflow-y-auto bg-background p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-semibold">
                {selected.brand} {selected.model} {selected.year}
              </p>
              <button onClick={() => setSelected(null)} className="text-sm text-muted-foreground">
                Cerrar ✕
              </button>
            </div>
            <CostsCard
              vehicleId={selected.id}
              price={Number(selected.price ?? 0)}
              currency={selected.currency ?? "ARS"}
              purchasePrice={selected.purchasePrice ?? null}
              purchasePriceOriginal={selected.purchasePriceOriginal ?? null}
              purchasePriceOriginalCurrency={selected.purchasePriceOriginalCurrency ?? null}
              expensesTotal={selected.expensesTotal ?? 0}
              autoOpenAdd
              onSaved={(patch) => applyPatch(selected.id, patch)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
