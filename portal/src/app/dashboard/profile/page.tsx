// portal/src/app/dashboard/profile/page.tsx
// Configuración de agencia: logo, banner, marca de agua y datos públicos
// (nombre, contacto, ubicación, horario, link personalizado, especialidades).
// Antes esto solo se podía editar desde edit-profile.tsx de la app —
// paridad completa con esos campos para que un dealer pueda manejar todo
// desde acá sin necesitar la app.
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { PROVINCES, CITY_OPTIONS_BY_PROVINCE } from "@/lib/locations";
import { AgencyProfileFields, EMPTY_AGENCY_PROFILE } from "@/lib/agency-profile";
import { parseJsonResponse } from "@/lib/api-client";
import { uploadAgencyBanner, uploadAgencyLogo } from "@/lib/upload";
import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useState } from "react";

// Google Maps JS API toca `window`/`document` al cargar su script — no puede renderizarse en el server.
const LocationPicker = dynamic(() => import("@/components/LocationPicker").then((m) => m.LocationPicker), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-lg border border-border bg-card" />,
});

// Misma lista que usa edit-profile.tsx de la app — para que las especialidades
// elegidas acá coincidan con las que la app también puede mostrar/editar.
const BRANDS = [
  "Toyota", "Volkswagen", "Chevrolet", "Ford", "Renault", "Fiat", "Peugeot",
  "Citroën", "Honda", "Nissan", "Hyundai", "Kia", "Suzuki", "Jeep", "RAM",
  "BMW", "Mercedes-Benz", "Audi", "Volvo", "Land Rover", "Lexus", "Mazda",
  "Mitsubishi", "Subaru", "Chery", "BYD", "MG", "Dodge",
];

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export default function AgencyProfilePage() {
  const { user, getIdToken } = useAuth();
  const [values, setValues] = useState<AgencyProfileFields | null>(null);
  const [canWatermark, setCanWatermark] = useState(false);
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [logoUploading, setLogoUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/agency/profile", { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<{ profile: AgencyProfileFields; canUseWatermark: boolean; weeklyDigestEmail: boolean }>(res);
        setValues({ ...EMPTY_AGENCY_PROFILE, ...data.profile });
        setCanWatermark(data.canUseWatermark);
        setWeeklyDigest(data.weeklyDigestEmail ?? true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [getIdToken]);

  const cityOptions = useMemo(() => (values ? CITY_OPTIONS_BY_PROVINCE[values.province] || [] : []), [values]);

  const set = <K extends keyof AgencyProfileFields>(key: K, val: AgencyProfileFields[K]) =>
    setValues((prev) => (prev ? { ...prev, [key]: val } : prev));

  const handleLogoChange = async (file: File | undefined) => {
    if (!file || !user) return;
    setLogoUploading(true);
    try {
      const url = await uploadAgencyLogo(user.uid, file);
      set("logoUrl", url);
    } catch {
      setError("No se pudo subir el logo.");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleBannerChange = async (file: File | undefined) => {
    if (!file || !user) return;
    setBannerUploading(true);
    try {
      const url = await uploadAgencyBanner(user.uid, file);
      set("bannerUrl", url);
    } catch {
      setError("No se pudo subir el banner.");
    } finally {
      setBannerUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!values) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/agency/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...values, weeklyDigestEmail: weeklyDigest }),
      });
      await parseJsonResponse(res);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  if (!values) return <p className="text-sm text-muted-foreground">{error ? `Error: ${error}` : "Cargando…"}</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-bold">Configurar agencia</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Estos datos se usan en tu perfil público (matchcars.app/agencia/…) y, el logo, para estampar tus fotos automáticamente.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <p className="mb-2 text-sm font-semibold">Banner de portada</p>
          <label className="flex h-28 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-card text-xs text-muted-foreground">
            {bannerUploading ? (
              "Subiendo…"
            ) : values.bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={values.bannerUrl} alt="Banner" className="h-full w-full object-cover" />
            ) : (
              "Subir banner (recomendado 1200×400)"
            )}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleBannerChange(e.target.files?.[0])} />
          </label>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">Logo / Marca de agua</p>
          <div className="flex items-center gap-4">
            <label className="flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-dashed border-border bg-card text-xs text-muted-foreground">
              {logoUploading ? (
                "Subiendo…"
              ) : values.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={values.logoUrl} alt="Logo" className="h-full w-full rounded-xl object-contain p-1" />
              ) : (
                "Subir logo"
              )}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoChange(e.target.files?.[0])} />
            </label>
            <div className="flex-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={!canWatermark || !values.logoUrl}
                  checked={values.watermarkEnabled}
                  onChange={(e) => set("watermarkEnabled", e.target.checked)}
                />
                Estampar mi logo automáticamente en las fotos de mis autos
              </label>
              {!canWatermark && <p className="mt-1 text-xs text-muted-foreground">Disponible en planes pagos.</p>}
              {canWatermark && !values.logoUrl && (
                <p className="mt-1 text-xs text-muted-foreground">Subí un logo primero para poder activarla.</p>
              )}
            </div>
          </div>
        </div>

        <Field label="Nombre de la agencia">
          <input className={inputClass} value={values.agencyName} onChange={(e) => set("agencyName", e.target.value)} />
        </Field>

        <Field label="Tu link personalizado (Vidriera Digital)">
          <div className="flex items-center overflow-hidden rounded-lg border border-border bg-background">
            <span className="shrink-0 pl-3 text-sm text-muted-foreground">matchcars.app/agencia/</span>
            <input
              className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none"
              value={values.slug}
              onChange={(e) => set("slug", slugify(e.target.value))}
              placeholder="mi-agencia"
            />
          </div>
        </Field>

        <Field label="Descripción">
          <textarea className={`${inputClass} min-h-20`} value={values.description} onChange={(e) => set("description", e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Teléfono">
            <input className={inputClass} value={values.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="WhatsApp">
            <input className={inputClass} value={values.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="+54 9 11..." />
          </Field>
          <Field label="Sitio web">
            <input className={inputClass} value={values.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
          </Field>
          <Field label="Instagram">
            <input className={inputClass} value={values.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@usuario" />
          </Field>
        </div>

        <Field label="Dirección">
          <input className={inputClass} value={values.businessAddress} onChange={(e) => set("businessAddress", e.target.value)} />
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium">Ubicación en el mapa</p>
          <LocationPicker
            value={values.businessCoordinates}
            onChange={(c) => set("businessCoordinates", c)}
            onAddressChange={(addr) => set("businessAddress", addr)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Provincia">
            <select className={inputClass} value={values.province} onChange={(e) => { set("province", e.target.value); set("city", ""); }}>
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Horario de atención">
            <input className={inputClass} value={values.businessHours} onChange={(e) => set("businessHours", e.target.value)} placeholder="Lun a vie 9 a 18hs" />
          </Field>
          <Field label="Año de fundación">
            <input
              className={inputClass}
              value={values.foundedYear}
              onChange={(e) => set("foundedYear", e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="2005"
              inputMode="numeric"
            />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Marcas en las que te especializás</p>
          <div className="flex flex-wrap gap-1.5">
            {BRANDS.map((brand) => {
              const selected = values.brandSpecialties.includes(brand);
              return (
                <button
                  key={brand}
                  type="button"
                  onClick={() =>
                    set(
                      "brandSpecialties",
                      selected ? values.brandSpecialties.filter((b) => b !== brand) : [...values.brandSpecialties, brand]
                    )
                  }
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    selected ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  {brand}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-2 text-sm font-semibold">Notificaciones por email</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={weeklyDigest}
              onChange={(e) => setWeeklyDigest(e.target.checked)}
            />
            Recibir el resumen semanal (leads, ofertas, ventas y stock de la semana)
          </label>
        </div>

        {error && <p className="text-sm text-error">{error}</p>}
        {success && <p className="text-sm text-success">Guardado.</p>}

        <button
          type="submit"
          disabled={saving || logoUploading || bannerUploading}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </form>
    </div>
  );
}
