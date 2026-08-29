// portal/src/components/DatalistField.tsx
// Input libre con sugerencias (datalist) para marca/modelo — mismo catálogo
// en todos lados (VehicleForm.tsx, y "Entre agencias") en vez de que cada
// formulario tenga su propia lista o texto libre sin validar. A diferencia
// de un <select>, no bloquea cargar algo que todavía no está catalogado —
// ver comentario original en VehicleForm.tsx sobre por qué se eligió así.
"use client";

import { useRef } from "react";

const inputClass = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

export function DatalistField({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const listId = `dl-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <div className="relative">
        <input
          ref={inputRef}
          list={listId}
          className={`${inputClass} w-full ${value ? "pr-8" : ""}`}
          value={value}
          disabled={disabled}
          placeholder={disabled ? placeholder : "Escribir o elegir…"}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            title="Cambiar"
            className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
          >
            ×
          </button>
        )}
      </div>
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </label>
  );
}
