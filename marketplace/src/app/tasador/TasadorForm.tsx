"use client";

import { MarketAnalysis } from "@/lib/pricing-admin";
import Link from "next/link";
import { useEffect, useState } from "react";

const CURRENT_YEAR = new Date().getFullYear();
const FALLBACK_YEARS = Array.from({ length: 40 }, (_, i) => CURRENT_YEAR - i);
// La app transaccional (Expo web, publicar auto) vive bajo /app.
const APP_BASE_URL = "https://matchcars.app/app";

async function apiGet<T>(action: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ action, ...params });
  const res = await fetch(`/api/tasador?${qs.toString()}`);
  if (!res.ok) throw new Error("Error de red");
  return res.json();
}

export function TasadorForm() {
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>(FALLBACK_YEARS);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [currency, setCurrency] = useState<"ARS" | "USD">("ARS");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState<MarketAnalysis | null>(null);

  useEffect(() => {
    apiGet<{ makes: string[] }>("makes", {})
      .then((d) => setMakes(d.makes))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!brand) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset síncrono cuando falta la marca, no dispara un fetch
      setModels([]);
      return;
    }
    apiGet<{ models: string[] }>("models", { make: brand })
      .then((d) => setModels(d.models))
      .catch(() => {});
  }, [brand]);

  const handleSelectModel = async (mo: string) => {
    setModel(mo);
    setYear("");
    setResult(null);
    setSearched(false);
    try {
      const { years: y } = await apiGet<{ years: number[] }>("years", { brand, model: mo });
      setYears(y.length > 0 ? y : FALLBACK_YEARS);
    } catch {
      setYears(FALLBACK_YEARS);
    }
  };

  const canCalculate = !!brand && !!model && !!year && !loading;

  const handleCalculate = async () => {
    if (!canCalculate) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await apiGet<MarketAnalysis>("analyze", { brand, model, year, currency });
      setResult(data);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number) => `${currency} ${Math.round(n).toLocaleString("es-AR")}`;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-6 py-10">
      <div>
        <h1 className="text-2xl font-extrabold">¿Cuánto vale tu auto?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Elegí marca, modelo y año para ver un rango de precio estimado, basado en una guía de precios de mercado y en publicaciones de Matchcars.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Marca
            <select
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value);
                setModel("");
                setYear("");
                setResult(null);
                setSearched(false);
              }}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="">Seleccionar</option>
              {makes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Modelo
            <select
              value={model}
              disabled={!brand}
              onChange={(e) => handleSelectModel(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-60"
            >
              <option value="">{brand ? "Seleccionar" : "Elegí primero una marca"}</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Año
          <select
            value={year}
            disabled={!model}
            onChange={(e) => {
              setYear(e.target.value);
              setResult(null);
              setSearched(false);
            }}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-60"
          >
            <option value="">{model ? "Seleccionar" : "Elegí primero un modelo"}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2">
          {(["ARS", "USD"] as const).map((cur) => (
            <button
              key={cur}
              type="button"
              onClick={() => {
                setCurrency(cur);
                setResult(null);
                setSearched(false);
              }}
              className={`flex-1 rounded-full border px-3 py-2 text-sm font-semibold ${
                currency === cur ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground"
              }`}
            >
              {cur}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={!canCalculate}
          onClick={handleCalculate}
          className="mt-1 rounded-lg bg-accent px-4 py-3 text-sm font-bold text-accent-foreground disabled:opacity-50"
        >
          {loading ? "Calculando…" : "Calcular estimación"}
        </button>
      </div>

      {searched && !loading && result && (
        result.count > 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold">
              {brand} {model} {year}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <p className="text-xs text-muted-foreground">Mínimo</p>
                <p className="mt-1 text-sm font-bold">{fmt(result.min)}</p>
              </div>
              <div className="rounded-xl border border-accent bg-accent/10 p-3 text-center">
                <p className="text-xs font-semibold text-accent">Promedio</p>
                <p className="mt-1 text-base font-extrabold">{fmt(result.avg)}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <p className="text-xs text-muted-foreground">Máximo</p>
                <p className="mt-1 text-sm font-bold">{fmt(result.max)}</p>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {result.source === "reference"
                ? `Basado en guía de precios de mercado (${result.count} versi${result.count === 1 ? "ón" : "ones"}).`
                : `Basado en ${result.count} publicaci${result.count === 1 ? "ón" : "ones"} actual${result.count === 1 ? "" : "es"} en Matchcars.`}
            </p>
            <p className="text-center text-[11px] text-muted-foreground">Es una estimación, no una tasación oficial.</p>
            {result.exchangeRate && (
              <p className="text-center text-[11px] text-muted-foreground">
                Cotización usada: USD 1 = ARS {Math.round(result.exchangeRate).toLocaleString("es-AR")} ({result.exchangeRateSource})
              </p>
            )}
            <a
              href={APP_BASE_URL}
              className="mt-2 rounded-lg border border-accent px-4 py-2.5 text-center text-sm font-semibold text-accent"
            >
              Publicá tu auto gratis
            </a>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <p className="text-sm font-semibold">
              Todavía no tenemos suficientes publicaciones de {brand} {model} {year} para estimar un precio.
            </p>
            <a href={APP_BASE_URL} className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground">
              Publicá el primero
            </a>
          </div>
        )
      )}

      <Link href="/" className="text-center text-xs font-semibold text-muted-foreground underline">
        Volver a la búsqueda
      </Link>
    </div>
  );
}
