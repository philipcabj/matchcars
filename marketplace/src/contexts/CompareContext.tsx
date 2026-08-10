"use client";

// Estado de "autos para comparar" — sin cuenta, sin backend: vive en
// localStorage del navegador (misma idea que CompareContext de la app, pero
// sin auth). Hasta 4 autos a la vez.
import { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "mc_compare_ids";
const MAX_ITEMS = 4;

interface CompareContextValue {
  ids: string[];
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  clear: () => void;
}

const CompareContext = createContext<CompareContextValue | undefined>(undefined);

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación única desde localStorage, no hay otra forma de leerlo antes del mount
      if (raw) setIds(JSON.parse(raw));
    } catch {
      // localStorage puede fallar (modo privado, cuota) — se sigue sin persistencia.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // ignorar — ver nota arriba
    }
  }, [ids, hydrated]);

  const toggle = useCallback((id: string) => {
    setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_ITEMS ? prev : [...prev, id]));
  }, []);

  const clear = useCallback(() => setIds([]), []);
  const isSelected = useCallback((id: string) => ids.includes(id), [ids]);

  return <CompareContext.Provider value={{ ids, isSelected, toggle, clear }}>{children}</CompareContext.Provider>;
}

export function useCompare(): CompareContextValue {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error("useCompare debe usarse dentro de <CompareProvider>");
  return ctx;
}

export const COMPARE_MAX_ITEMS = MAX_ITEMS;
