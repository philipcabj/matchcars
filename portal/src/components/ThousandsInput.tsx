"use client";

// Input de número con separador de miles (es-AR) mientras se escribe — mismo
// criterio en todos los inputs de plata del portal (Stock, Leads). El valor
// que se guarda/emite sigue siendo el string de dígitos puro; solo cambia el
// display.
export function formatThousands(digits: string): string {
  const clean = digits.replace(/\D/g, "");
  return clean ? Number(clean).toLocaleString("es-AR") : "";
}

export function ThousandsInput({
  value,
  onChange,
  className,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoFocus={autoFocus}
      className={className ?? "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"}
      value={formatThousands(value)}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
    />
  );
}
