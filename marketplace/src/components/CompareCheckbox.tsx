"use client";

import { useCompare } from "@/contexts/CompareContext";

// Se usa tanto dentro de un <Link> (VehicleCard) como suelto (ficha de auto)
// — por eso siempre frena la propagación/navegación del click.
export function CompareCheckbox({ vehicleId, className }: { vehicleId: string; className?: string }) {
  const { isSelected, toggle } = useCompare();
  const selected = isSelected(vehicleId);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(vehicleId);
      }}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
        selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"
      } ${className ?? ""}`}
    >
      <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${selected ? "border-white bg-white/20" : "border-current"}`}>
        {selected && "✓"}
      </span>
      Comparar
    </button>
  );
}
