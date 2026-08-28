// portal/src/app/dashboard/costos/page.tsx
// Costos y Rentabilidad — antes esto vivía escondido en la ficha de cada
// auto (CostsCard en stock/[id]); ahora es su propia sección del menú, con
// el stock activo (costo/gastos/margen), las ventas ya cerradas (desglose
// final) y un resumen de rentabilidad, mismo patrón de tabs que
// dashboard/admin/page.tsx.
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { useEffect, useState } from "react";
import { PorAutoTab } from "./PorAutoTab";
import { ResumenTab } from "./ResumenTab";
import type { CostoEntry } from "./types";
import { VentasCerradasTab } from "./VentasCerradasTab";

type Tab = "por-auto" | "cerradas" | "resumen";

export default function CostosPage() {
  const { getIdToken } = useAuth();
  const [tab, setTab] = useState<Tab>("por-auto");
  const [entries, setEntries] = useState<CostoEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/agency/costos", { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<{ entries: CostoEntry[] }>(res);
        setEntries(data.entries);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [getIdToken]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Costos y Rentabilidad</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Costo de compra, gastos y margen de tu stock — y el resultado final de cada venta cerrada.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => setTab("por-auto")}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold ${tab === "por-auto" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
        >
          Por auto
        </button>
        <button
          type="button"
          onClick={() => setTab("cerradas")}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold ${tab === "cerradas" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
        >
          Ventas cerradas
        </button>
        <button
          type="button"
          onClick={() => setTab("resumen")}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold ${tab === "resumen" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
        >
          Resumen
        </button>
      </div>

      {tab === "por-auto" && <PorAutoTab />}
      {tab === "cerradas" && (error ? <p className="text-sm text-error">{error}</p> : !entries ? <p className="text-sm text-muted-foreground">Cargando…</p> : <VentasCerradasTab entries={entries} />)}
      {tab === "resumen" && (error ? <p className="text-sm text-error">{error}</p> : !entries ? <p className="text-sm text-muted-foreground">Cargando…</p> : <ResumenTab entries={entries} />)}
    </div>
  );
}
