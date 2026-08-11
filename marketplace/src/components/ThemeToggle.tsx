"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  // Arranca en `false` (claro) para que el HTML del servidor y el primer
  // render del cliente coincidan (evita un warning de hidratación) — el
  // script inline en layout.tsx ya dejó la clase `dark` puesta en <html>
  // antes de este render, así que el hook solo necesita leerla, no decidirla.
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee una vez el estado que dejó el script anti-flash (layout.tsx), no hay otra forma de sincronizarlo antes del mount
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("mc-theme", next ? "dark" : "light");
    } catch {
      // localStorage puede fallar (modo privado) — el toggle sigue
      // funcionando para esta visita, solo no persiste.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-foreground transition hover:border-accent"
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="3.5" />
          <path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.5 3.5l-1 1M4.5 11.5l-1 1M12.5 12.5l-1-1M4.5 4.5l-1-1" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7Z" />
        </svg>
      )}
    </button>
  );
}
