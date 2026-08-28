"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { useEffect, useState } from "react";
import { ThousandsInput } from "./ThousandsInput";

const EXPENSE_TYPE_LABELS: Record<string, string> = {
  compra: "Compra",
  reparacion: "Reparación",
  detailing: "Detailing",
  tramite: "Trámite",
  publicidad: "Publicidad",
  flete: "Flete/traslado",
  patente_impuesto: "Patente/impuesto",
  guarderia: "Guardería/depósito",
  financiacion: "Financiación",
  comision_intermediario: "Comisión a intermediario",
  otro: "Otro",
};

interface Expense {
  id: string;
  tipo: string;
  monto: number;
  descripcion: string;
  createdAt: string | null;
}

const inputClass = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

// Gastos por unidad + margen real (Módulo C) — misma moneda que el auto a
// propósito (sin selector de moneda por gasto), para que la resta que da el
// margen no mezcle monedas.
export function CostsCard({
  vehicleId,
  price,
  currency,
  purchasePrice: initialPurchasePrice,
  expensesTotal: initialExpensesTotal,
  autoOpenAdd,
}: {
  vehicleId: string;
  price: number;
  currency: string;
  purchasePrice: number | null;
  expensesTotal: number;
  // Salta directo al formulario de "agregar gasto" al abrirse — usado
  // desde el botón "+ Gasto" de Costos > Por auto, para no sumar un click
  // extra al camino más común (llegar acá para cargar un gasto puntual).
  autoOpenAdd?: boolean;
}) {
  const { getIdToken } = useAuth();
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [expensesTotal, setExpensesTotal] = useState(initialExpensesTotal);
  const [purchasePrice, setPurchasePrice] = useState<number | null>(initialPurchasePrice);
  const [priceInput, setPriceInput] = useState(initialPurchasePrice?.toString() ?? "");
  const [savingPrice, setSavingPrice] = useState(false);
  const [showAdd, setShowAdd] = useState(!!autoOpenAdd);
  const [newExpense, setNewExpense] = useState({ tipo: "otro", monto: "", descripcion: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/agency/vehicles/${vehicleId}/expenses`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<{ expenses: Expense[] }>(res);
        setExpenses(data.expenses);
      } catch {
        setExpenses([]);
      }
    })();
  }, [vehicleId, getIdToken]);

  const savePurchasePrice = async () => {
    setSavingPrice(true);
    setError(null);
    try {
      const token = await getIdToken();
      const value = priceInput.trim() === "" ? null : Number(priceInput);
      const res = await fetch(`/api/agency/vehicles/${vehicleId}/purchase-price`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ purchasePrice: value }),
      });
      await parseJsonResponse(res);
      setPurchasePrice(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSavingPrice(false);
    }
  };

  const addExpense = async () => {
    const monto = Number(newExpense.monto);
    if (!monto || monto <= 0) {
      setError("Ingresá un monto válido.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/vehicles/${vehicleId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(newExpense),
      });
      const data = await parseJsonResponse<{ id: string }>(res);
      setExpenses((prev) => [{ id: data.id, tipo: newExpense.tipo, monto, descripcion: newExpense.descripcion, createdAt: new Date().toISOString() }, ...(prev ?? [])]);
      setExpensesTotal((prev) => prev + monto);
      setNewExpense({ tipo: "otro", monto: "", descripcion: "" });
      setShowAdd(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  const removeExpense = async (expenseId: string, monto: number) => {
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/vehicles/${vehicleId}/expenses/${expenseId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await parseJsonResponse(res);
      setExpenses((prev) => (prev ?? []).filter((e) => e.id !== expenseId));
      setExpensesTotal((prev) => prev - monto);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
  };

  const margin = purchasePrice !== null ? price - purchasePrice - expensesTotal : null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-3 text-xs font-semibold text-muted-foreground">Costos y margen</p>

      <div className="mb-3 flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Costo de compra ({currency})</span>
          <ThousandsInput
            className={inputClass}
            value={priceInput}
            onChange={setPriceInput}
            placeholder="Sin cargar"
          />
        </label>
        <button
          onClick={savePurchasePrice}
          disabled={savingPrice}
          className="rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          {savingPrice ? "…" : "Guardar"}
        </button>
      </div>

      {expenses === null ? (
        <p className="text-sm text-muted-foreground">Cargando gastos…</p>
      ) : (
        <div className="mb-3 flex flex-col gap-1.5">
          {expenses.map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium">{EXPENSE_TYPE_LABELS[e.tipo] ?? e.tipo}</span>
                {e.descripcion && <span className="ml-1.5 text-xs text-muted-foreground">{e.descripcion}</span>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-semibold">{currency} {e.monto.toLocaleString("es-AR")}</span>
                <button onClick={() => removeExpense(e.id, e.monto)} className="text-xs text-error">
                  Quitar
                </button>
              </div>
            </div>
          ))}
          {expenses.length === 0 && <p className="text-xs text-muted-foreground">Sin gastos cargados.</p>}
        </div>
      )}

      {showAdd ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
          <select className={inputClass} value={newExpense.tipo} onChange={(e) => setNewExpense({ ...newExpense, tipo: e.target.value })}>
            {Object.entries(EXPENSE_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <ThousandsInput
            placeholder={`Monto (${currency})`}
            className={inputClass}
            value={newExpense.monto}
            onChange={(v) => setNewExpense({ ...newExpense, monto: v })}
          />
          <input
            placeholder="Descripción (opcional)"
            className={inputClass}
            value={newExpense.descripcion}
            onChange={(e) => setNewExpense({ ...newExpense, descripcion: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground">
              Cancelar
            </button>
            <button
              onClick={addExpense}
              disabled={saving}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Agregar"}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="text-xs font-semibold text-accent">
          + Agregar gasto
        </button>
      )}

      {error && <p className="mt-2 text-xs text-error">{error}</p>}

      {margin !== null && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">Margen estimado</p>
          <p className={`text-lg font-extrabold ${margin >= 0 ? "text-success" : "text-error"}`}>
            {currency} {margin.toLocaleString("es-AR")}
          </p>
        </div>
      )}
    </div>
  );
}
