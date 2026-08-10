// portal/src/components/VehicleForm.tsx
// Formulario de alta/edición de vehículo. Reemplaza (para el portal) a
// WebDealerAddCarForm.tsx de la app: mismo dominio de datos, pero usando
// <select> nativos de web en vez de modales RN, y hablando con el backend
// (/api/agency/vehicles) en vez de escribir directo a Firestore desde acá.
"use client";

import { ThousandsInput } from "@/components/ThousandsInput";
import { CAR_MODELS_AR } from "@/lib/carModelsAr";
import { loadCatalogMakes, loadCatalogModels } from "@/lib/catalog";
import { CITY_OPTIONS_BY_PROVINCE, PROVINCES } from "@/lib/locations";
import { canUploadVideo } from "@/lib/plans";
import { analyzeMarketPrice, MarketAnalysis } from "@/lib/pricing";
import { uploadVehiclePhoto, uploadVehicleVideo } from "@/lib/upload";
import {
  EMPTY_VEHICLE_FORM,
  FUEL_OPTIONS,
  GEARBOX_OPTIONS,
  TOGGLE_FIELDS,
  VehicleFormValues,
} from "@/lib/vehicle";
import { useEffect, useMemo, useRef, useState } from "react";

const STATIC_MAKES = Array.from(new Set(CAR_MODELS_AR.map((x) => x.make))).sort();
const STATIC_MODELS_BY_MAKE: Record<string, string[]> = CAR_MODELS_AR.reduce((acc, item) => {
  const list = acc[item.make] || [];
  if (!list.includes(item.model)) list.push(item.model);
  acc[item.make] = list;
  return acc;
}, {} as Record<string, string[]>);

const CURRENT_YEAR = new Date().getFullYear();

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

// Marca/Modelo/Versión: input libre con sugerencias (datalist), en vez de un
// <select> que solo permite elegir entre un catálogo estático — así no bloquea
// cargar un auto cuyo modelo todavía no está catalogado. Ver Field "Marca"/
// "Modelo"/"Versión" más abajo.
//
// Con <input list>, una vez que el campo ya tiene un valor el navegador no
// siempre reabre el desplegable de sugerencias al volver a clickear (a
// diferencia de un <select>) — da la sensación de que "no deja cambiar".
// Por eso hay una × explícita: limpia el campo y lo enfoca, dejando escribir
// de cero o abrir las sugerencias de nuevo.
function DatalistField({
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
    <Field label={label}>
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
    </Field>
  );
}

export function VehicleForm({
  initialValues = EMPTY_VEHICLE_FORM,
  plan,
  userId,
  submitLabel,
  submitting,
  onSubmit,
}: {
  initialValues?: VehicleFormValues;
  plan: string;
  userId: string;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (values: VehicleFormValues) => void | Promise<void>;
}) {
  const [values, setValues] = useState<VehicleFormValues>(initialValues);
  const [coverUploading, setCoverUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceSuggestion, setPriceSuggestion] = useState<MarketAnalysis | null>(null);
  const [priceSuggestionLoading, setPriceSuggestionLoading] = useState(false);
  const [catalogMakes, setCatalogMakes] = useState<string[]>([]);
  const [catalogModels, setCatalogModels] = useState<{ name: string; versions: string[] }[]>([]);

  // Catálogo dinámico (Firestore catalog/default/makes/**, el mismo que usa la
  // app) — arranca con el estático como fallback instantáneo mientras carga, y
  // se combina con lo que venga de Firestore. Igual que en add-car.tsx, el
  // catálogo se sigue enriqueciendo solo (ver POST/PATCH de vehículos, que
  // agregan la marca/modelo/versión nueva si no existían).
  useEffect(() => {
    loadCatalogMakes().then(setCatalogMakes);
  }, []);

  useEffect(() => {
    if (!values.brand) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset síncrono cuando falta la marca, no dispara un fetch
      setCatalogModels([]);
      return;
    }
    let cancelled = false;
    loadCatalogModels(values.brand).then((models) => {
      if (!cancelled) setCatalogModels(models);
    });
    return () => {
      cancelled = true;
    };
  }, [values.brand]);

  // Sugerencia de precio de mercado, igual que en la app: se recalcula (con debounce)
  // cuando cambian marca/modelo/año/moneda.
  useEffect(() => {
    if (!values.brand || !values.model || !values.year) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset síncrono cuando faltan datos, no dispara un fetch
      setPriceSuggestion(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPriceSuggestionLoading(true);
      try {
        const result = await analyzeMarketPrice(values.brand, values.model, Number(values.year), values.currency);
        if (!cancelled) setPriceSuggestion(result);
      } finally {
        if (!cancelled) setPriceSuggestionLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [values.brand, values.model, values.year, values.currency]);

  const makeOptions = useMemo(() => Array.from(new Set([...STATIC_MAKES, ...catalogMakes])).sort(), [catalogMakes]);
  const modelOptions = useMemo(() => {
    const fromStatic = STATIC_MODELS_BY_MAKE[values.brand] || [];
    const fromCatalog = catalogModels.map((m) => m.name);
    return Array.from(new Set([...fromStatic, ...fromCatalog])).sort();
  }, [values.brand, catalogModels]);
  const versionOptions = useMemo(() => {
    const fromStatic = CAR_MODELS_AR.find((x) => x.make === values.brand && x.model === values.model)?.versions || [];
    const fromCatalog = catalogModels.find((m) => m.name === values.model)?.versions || [];
    return Array.from(new Set([...fromStatic, ...fromCatalog])).sort();
  }, [values.brand, values.model, catalogModels]);
  const cityOptions = useMemo(() => CITY_OPTIONS_BY_PROVINCE[values.province] || [], [values.province]);

  const set = <K extends keyof VehicleFormValues>(key: K, val: VehicleFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: val }));

  const setToggle = (key: string, val: boolean) =>
    setValues((prev) => ({ ...prev, toggles: { ...prev.toggles, [key]: val } }));

  const handleCoverChange = async (file: File | undefined) => {
    if (!file) return;
    setCoverUploading(true);
    try {
      set("coverImage", await uploadVehiclePhoto(userId, file));
    } catch {
      setError("No se pudo subir la foto de portada.");
    } finally {
      setCoverUploading(false);
    }
  };

  const handleGalleryChange = async (files: FileList | null) => {
    if (!files?.length) return;
    setGalleryUploading(true);
    try {
      const urls = await Promise.all(Array.from(files).map((f) => uploadVehiclePhoto(userId, f)));
      setValues((prev) => ({ ...prev, gallery: [...prev.gallery, ...urls] }));
    } catch {
      setError("No se pudieron subir algunas fotos.");
    } finally {
      setGalleryUploading(false);
    }
  };

  // La portada anterior no se pierde: pasa a ser la primera foto de la galería.
  const makeGalleryPhotoCover = (url: string) =>
    setValues((prev) => ({
      ...prev,
      coverImage: url,
      gallery: prev.coverImage ? [prev.coverImage, ...prev.gallery.filter((g) => g !== url)] : prev.gallery.filter((g) => g !== url),
    }));

  const moveGalleryPhoto = (index: number, direction: -1 | 1) =>
    setValues((prev) => {
      const next = [...prev.gallery];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, gallery: next };
    });

  const handleVideoChange = async (file: File | undefined) => {
    if (!file) return;
    setVideoUploading(true);
    try {
      set("video", await uploadVehicleVideo(userId, file));
    } catch {
      setError("No se pudo subir el video.");
    } finally {
      setVideoUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!values.brand.trim() || !values.model.trim() || !values.year || !values.price) {
      setError("Marca, modelo, año y precio son obligatorios.");
      return;
    }
    if (!values.coverImage) {
      setError("Falta la foto de portada.");
      return;
    }
    await onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DatalistField
          label="Marca *"
          value={values.brand}
          options={makeOptions}
          onChange={(v) => {
            set("brand", v);
            set("model", "");
            set("version", "");
          }}
        />

        <DatalistField
          label="Modelo *"
          value={values.model}
          options={modelOptions}
          disabled={!values.brand}
          placeholder="Elegí una marca primero"
          onChange={(v) => {
            set("model", v);
            set("version", "");
          }}
        />

        <DatalistField
          label="Versión"
          value={values.version}
          options={versionOptions}
          disabled={!values.model}
          placeholder="Elegí un modelo primero"
          onChange={(v) => set("version", v)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Field label="Año *">
          <input
            type="number"
            className={inputClass}
            min={1970}
            max={CURRENT_YEAR + 1}
            value={values.year}
            onChange={(e) => set("year", e.target.value)}
          />
        </Field>
        <Field label="Kilómetros">
          <ThousandsInput value={values.km} onChange={(v) => set("km", v)} className={inputClass} />
        </Field>
        <Field label="Precio *">
          <ThousandsInput value={values.price} onChange={(v) => set("price", v)} className={inputClass} />
        </Field>
        <Field label="Moneda">
          <select className={inputClass} value={values.currency} onChange={(e) => set("currency", e.target.value as "ARS" | "USD")}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </Field>
      </div>

      {priceSuggestionLoading && (
        <p className="-mt-2 text-xs italic text-muted-foreground">Calculando precio de mercado…</p>
      )}
      {!priceSuggestionLoading && priceSuggestion && priceSuggestion.count > 0 && (
        <button
          type="button"
          onClick={() => set("price", String(Math.round(priceSuggestion.avg)))}
          className="-mt-2 flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-left"
        >
          <div>
            <p className="text-xs font-bold">
              Promedio de mercado: {values.currency} {Math.round(priceSuggestion.avg).toLocaleString("es-AR")}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {priceSuggestion.count} publicaci{priceSuggestion.count === 1 ? "ón" : "ones"} similares · Min{" "}
              {Math.round(priceSuggestion.min).toLocaleString("es-AR")} – Max{" "}
              {Math.round(priceSuggestion.max).toLocaleString("es-AR")}
            </p>
          </div>
          <span className="whitespace-nowrap text-[11px] text-muted-foreground">Tocar para aplicar</span>
        </button>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Combustible">
          <select className={inputClass} value={values.fuelType} onChange={(e) => set("fuelType", e.target.value)}>
            <option value="">Seleccionar</option>
            {FUEL_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Caja">
          <select className={inputClass} value={values.gearbox} onChange={(e) => set("gearbox", e.target.value)}>
            <option value="">Seleccionar</option>
            {GEARBOX_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Provincia">
          <select
            className={inputClass}
            value={values.province}
            onChange={(e) => {
              set("province", e.target.value);
              set("city", "");
            }}
          >
            <option value="">Seleccionar</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ciudad">
          <select className={inputClass} value={values.city} disabled={!values.province} onChange={(e) => set("city", e.target.value)}>
            <option value="">{cityOptions.length ? "Seleccionar" : "Sin ciudades cargadas"}</option>
            {cityOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Descripción">
        <textarea
          className={`${inputClass} min-h-24`}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Detalles del vehículo, estado, equipamiento..."
        />
      </Field>

      <div>
        <p className="mb-2 text-sm font-semibold">Características</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TOGGLE_FIELDS.map((t) => (
            <label key={t.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!values.toggles[t.key]}
                onChange={(e) => setToggle(t.key, e.target.checked)}
              />
              {t.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Fotos</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card text-sm text-muted-foreground">
              {coverUploading ? (
                "Subiendo…"
              ) : values.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={values.coverImage} alt="Portada" className="h-full w-full rounded-xl object-cover" />
              ) : (
                "Foto de portada *"
              )}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleCoverChange(e.target.files?.[0])} />
            </label>
          </div>
          <div className="flex-1">
            <label className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card text-sm text-muted-foreground">
              {galleryUploading ? "Subiendo…" : `Agregar más fotos (${values.gallery.length})`}
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleGalleryChange(e.target.files)} />
            </label>
          </div>
        </div>
        {values.gallery.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {values.gallery.map((url, i) => (
              <div key={url} className="group relative h-16 w-16">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => setValues((prev) => ({ ...prev, gallery: prev.gallery.filter((g) => g !== url) }))}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-error text-xs text-white"
                  title="Quitar foto"
                >
                  ×
                </button>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-0.5 rounded-b-lg bg-black/60 px-0.5 py-0.5 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => moveGalleryPhoto(i, -1)}
                    className="flex-1 rounded text-[10px] leading-none text-white disabled:opacity-30"
                    title="Mover antes"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => makeGalleryPhotoCover(url)}
                    className="flex-1 rounded text-[9px] font-semibold leading-none text-white"
                    title="Usar como portada"
                  >
                    ★
                  </button>
                  <button
                    type="button"
                    disabled={i === values.gallery.length - 1}
                    onClick={() => moveGalleryPhoto(i, 1)}
                    className="flex-1 rounded text-[10px] leading-none text-white disabled:opacity-30"
                    title="Mover después"
                  >
                    ›
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {canUploadVideo(plan) && (
        <div>
          <p className="mb-2 text-sm font-semibold">Video Walkaround (opcional, máx. 60s)</p>
          {values.video ? (
            <video src={values.video} controls className="h-40 w-full rounded-xl bg-black object-contain" />
          ) : (
            <label className="flex h-24 cursor-pointer items-center justify-center rounded-xl border border-dashed border-border bg-card text-sm text-muted-foreground">
              {videoUploading ? "Subiendo…" : "Subir video"}
              <input type="file" accept="video/*" className="hidden" onChange={(e) => handleVideoChange(e.target.files?.[0])} />
            </label>
          )}
        </div>
      )}

      {error && <p className="text-sm text-error">{error}</p>}

      <button
        type="submit"
        disabled={submitting || coverUploading || galleryUploading || videoUploading}
        className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition disabled:opacity-60"
      >
        {submitting ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
