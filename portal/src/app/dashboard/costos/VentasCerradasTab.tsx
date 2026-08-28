// portal/src/app/dashboard/costos/VentasCerradasTab.tsx
// Desglose final de cada venta cerrada: costo, precio, comisión pagada y
// margen neto. Datos vienen de GET /api/agency/costos, levantados por el
// padre (page.tsx) y compartidos con ResumenTab para no pedirlos dos veces.
"use client";

import type { CostoEntry } from "./types";

function fmtMoney(currency: string, value: number | null): string {
  if (value == null) return "—";
  return `${currency} ${value.toLocaleString("es-AR")}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function VentasCerradasTab({ entries }: { entries: CostoEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay ventas cerradas.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="px-4 py-3 font-medium">Auto</th>
            <th className="px-4 py-3 font-medium">Comprador</th>
            <th className="px-4 py-3 font-medium">Fecha</th>
            <th className="px-4 py-3 font-medium">Precio venta</th>
            <th className="px-4 py-3 font-medium">Costo</th>
            <th className="px-4 py-3 font-medium">Comisión</th>
            <th className="px-4 py-3 font-medium">Margen neto</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.saleId} className="border-b border-border last:border-0">
              <td className="px-4 py-3 font-medium">
                {e.vehicleSnapshot ? `${e.vehicleSnapshot.brand ?? ""} ${e.vehicleSnapshot.model ?? ""} ${e.vehicleSnapshot.year ?? ""}` : "—"}
              </td>
              <td className="px-4 py-3">{e.buyerName || "—"}</td>
              <td className="px-4 py-3">{fmtDate(e.soldAt)}</td>
              <td className="px-4 py-3">{fmtMoney(e.dealCurrency, e.dealPrice)}</td>
              <td className="px-4 py-3">{e.cost != null ? fmtMoney(e.dealCurrency, e.cost) : <span className="text-muted-foreground">Sin cargar</span>}</td>
              <td className="px-4 py-3">{e.commissionAmount > 0 ? fmtMoney(e.dealCurrency, e.commissionAmount) : "—"}</td>
              <td className="px-4 py-3">
                {e.margin != null ? (
                  <span className={`font-semibold ${e.margin >= 0 ? "text-success" : "text-error"}`}>{fmtMoney(e.dealCurrency, e.margin)}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
