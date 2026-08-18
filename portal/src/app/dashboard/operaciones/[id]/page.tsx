// portal/src/app/dashboard/operaciones/[id]/page.tsx
// Detalle de una operación de venta — checklist de trámites, financiación
// rápida (sin conexión a ninguna financiera, solo cálculo) y parte de pago.
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useAgencyMe } from "@/hooks/useAgencyMe";
import { parseJsonResponse } from "@/lib/api-client";
import { analyzeMarketPrice } from "@/lib/pricing";
import { ChecklistItem, SaleOperation, TradeInAppraisal } from "@/lib/sale-operations";
import { uploadOperationDocument, uploadTradeInPhoto } from "@/lib/upload";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const inputClass = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function OperationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getIdToken, user } = useAuth();
  const { data: agency } = useAgencyMe();
  const [op, setOp] = useState<SaleOperation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/agency/sale-operations/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        setOp(await parseJsonResponse<SaleOperation>(res));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [id, getIdToken, reloadKey]);

  const memberName = useMemo(() => {
    const map = new Map((agency?.members ?? []).map((m) => [m.uid, m.name || m.email || m.uid]));
    return (uid: string | null) => (uid ? map.get(uid) || uid : null);
  }, [agency]);

  const patch = async (body: Record<string, unknown>) => {
    const token = await getIdToken();
    const res = await fetch(`/api/agency/sale-operations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    await parseJsonResponse(res);
  };

  const refresh = () => setReloadKey((k) => k + 1);

  if (error && !op) return <p className="text-sm text-error">No pudimos abrir esta operación: {error}</p>;
  if (!op) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const doneCount = op.checklist.filter((c) => c.status === "hecho").length;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link href="/dashboard/operaciones" className="text-xs font-semibold text-accent">
        ← Volver a Operaciones
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <p className="text-base font-bold">
            {op.vehicleSnapshot?.brand} {op.vehicleSnapshot?.model} {op.vehicleSnapshot?.year}
          </p>
          <p className="text-sm text-muted-foreground">{op.buyerLabel}</p>
          {op.assignedTo && <p className="text-xs text-muted-foreground">Vendedor: {memberName(op.assignedTo)}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">{doneCount}/{op.checklist.length} pasos</span>
          {op.status === "en_curso" ? (
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  await patch({ action: "set_status", status: "completada" });
                  refresh();
                }}
                className="rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-white"
              >
                Completar
              </button>
              <button
                onClick={async () => {
                  if (!confirm("¿Cancelar esta operación?")) return;
                  await patch({ action: "set_status", status: "cancelada" });
                  refresh();
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-error"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                op.status === "completada" ? "bg-success/15 text-success" : "bg-muted/20 text-muted-foreground"
              }`}
            >
              {op.status === "completada" ? "Completada" : "Cancelada"}
            </span>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <ChecklistSection op={op} agency={agency} onChanged={refresh} patch={patch} userId={user?.uid ?? ""} />
      <FinancingSection op={op} onChanged={refresh} patch={patch} />
      <TradeInSection op={op} onChanged={refresh} patch={patch} userId={user?.uid ?? ""} />
    </div>
  );
}

function ChecklistSection({
  op,
  agency,
  onChanged,
  patch,
  userId,
}: {
  op: SaleOperation;
  agency: ReturnType<typeof useAgencyMe>["data"];
  onChanged: () => void;
  patch: (body: Record<string, unknown>) => Promise<void>;
  userId: string;
}) {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [senaPrompt, setSenaPrompt] = useState(false);
  const [senaMonto, setSenaMonto] = useState("");
  const { getIdToken } = useAuth();

  const generateDocument = async (tipo: "boleto_compraventa" | "recibo_sena", key: string, monto?: number) => {
    setGeneratingKey(key);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/sale-operations/${op.id}/document`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipo, monto }),
      });
      const data = await parseJsonResponse<{ url: string }>(res);
      onChanged();
      window.open(data.url, "_blank");
    } finally {
      setGeneratingKey(null);
      setSenaPrompt(false);
      setSenaMonto("");
    }
  };

  const toggleDone = async (item: ChecklistItem) => {
    await patch({ action: "update_checklist_item", key: item.key, status: item.status === "hecho" ? "pendiente" : "hecho" });
    onChanged();
  };

  const setResponsable = async (item: ChecklistItem, responsable: string) => {
    await patch({ action: "update_checklist_item", key: item.key, responsable });
    onChanged();
  };

  const setDueAt = async (item: ChecklistItem, dueAt: string) => {
    await patch({ action: "update_checklist_item", key: item.key, dueAt: dueAt || null });
    onChanged();
  };

  const uploadFile = async (item: ChecklistItem, file: File) => {
    setUploadingKey(item.key);
    try {
      const url = await uploadOperationDocument(userId, op.id, file);
      await patch({ action: "add_attachment", key: item.key, url, nombre: file.name });
      onChanged();
    } finally {
      setUploadingKey(null);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-3 text-sm font-semibold">Checklist de trámites</p>
      <div className="flex flex-col gap-2">
        {op.checklist.map((item) => {
          const remaining = daysUntil(item.dueAt);
          const overdue = remaining !== null && remaining < 0 && item.status !== "hecho";
          const soon = remaining !== null && remaining >= 0 && remaining <= 3 && item.status !== "hecho";
          return (
            <div key={item.key} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggleDone(item)}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs ${
                    item.status === "hecho" ? "border-success bg-success text-white" : "border-border"
                  }`}
                >
                  {item.status === "hecho" ? "✓" : ""}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`text-sm font-semibold ${item.status === "hecho" ? "text-muted-foreground line-through" : ""}`}>{item.label}</p>
                    {overdue && <span className="rounded-full bg-error/15 px-2 py-0.5 text-[10px] font-bold text-error">Vencido</span>}
                    {soon && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-amber-600">Vence pronto</span>}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={item.responsable ?? ""}
                      onChange={(e) => setResponsable(item, e.target.value)}
                      className="rounded-md border border-border bg-card px-2 py-1 text-xs"
                    >
                      <option value="">Sin responsable</option>
                      {(agency?.members ?? []).map((m) => (
                        <option key={m.uid} value={m.uid}>
                          {m.name || m.email || m.uid}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={item.dueAt ? item.dueAt.slice(0, 10) : ""}
                      onChange={(e) => setDueAt(item, e.target.value)}
                      className="rounded-md border border-border bg-card px-2 py-1 text-xs"
                      title="Fecha límite (opcional — la caducidad real varía, cargala vos)"
                    />
                    <label className="cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-xs font-semibold text-accent">
                      {uploadingKey === item.key ? "Subiendo…" : "+ Adjuntar"}
                      <input
                        type="file"
                        className="hidden"
                        disabled={uploadingKey === item.key}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadFile(item, file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {item.key === "boleto_compraventa" && (
                      <button
                        onClick={() => generateDocument("boleto_compraventa", item.key)}
                        disabled={generatingKey === item.key}
                        className="rounded-md border border-accent/40 bg-accent/5 px-2 py-1 text-xs font-semibold text-accent disabled:opacity-50"
                      >
                        {generatingKey === item.key ? "Generando…" : "📄 Generar PDF"}
                      </button>
                    )}
                    {item.key === "sena" && (
                      <button
                        onClick={() => setSenaPrompt(true)}
                        disabled={generatingKey === item.key}
                        className="rounded-md border border-accent/40 bg-accent/5 px-2 py-1 text-xs font-semibold text-accent disabled:opacity-50"
                      >
                        {generatingKey === item.key ? "Generando…" : "📄 Generar recibo"}
                      </button>
                    )}
                  </div>

                  {item.key === "sena" && senaPrompt && (
                    <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-background p-2">
                      <input
                        type="number"
                        autoFocus
                        placeholder="Monto de la seña"
                        value={senaMonto}
                        onChange={(e) => setSenaMonto(e.target.value)}
                        className="w-32 rounded-md border border-border bg-card px-2 py-1 text-xs"
                      />
                      <button
                        onClick={() => generateDocument("recibo_sena", item.key, Number(senaMonto))}
                        disabled={!senaMonto || Number(senaMonto) <= 0}
                        className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-accent-foreground disabled:opacity-50"
                      >
                        Generar
                      </button>
                      <button onClick={() => setSenaPrompt(false)} className="text-xs text-muted-foreground">
                        Cancelar
                      </button>
                    </div>
                  )}

                  {item.adjuntos.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                      {item.adjuntos.map((a, i) => (
                        <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">
                          📎 {a.nombre}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FinancingSection({
  op,
  onChanged,
  patch,
}: {
  op: SaleOperation;
  onChanged: () => void;
  patch: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [anticipo, setAnticipo] = useState(String(op.financiacion?.anticipo ?? ""));
  const [cuotas, setCuotas] = useState(String(op.financiacion?.cuotas ?? "12"));
  const [tasaAnual, setTasaAnual] = useState(String(op.financiacion?.tasaAnual ?? ""));
  const [precioTotal, setPrecioTotal] = useState("");
  const [saving, setSaving] = useState(false);

  const calc = async () => {
    setSaving(true);
    try {
      await patch({
        action: "update_financing",
        anticipo: Number(anticipo) || 0,
        cuotas: Number(cuotas) || 0,
        tasaAnual: Number(tasaAnual) || 0,
        precioTotal: Number(precioTotal) || 0,
      });
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-1 text-sm font-semibold">Financiación rápida</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Calculadora propia, sin conexión a ninguna financiera — vos cargás la tasa que apliques.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Precio total</span>
          <input type="number" className={inputClass} value={precioTotal} onChange={(e) => setPrecioTotal(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Anticipo</span>
          <input type="number" className={inputClass} value={anticipo} onChange={(e) => setAnticipo(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Cuotas</span>
          <input type="number" className={inputClass} value={cuotas} onChange={(e) => setCuotas(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Tasa anual %</span>
          <input type="number" className={inputClass} value={tasaAnual} onChange={(e) => setTasaAnual(e.target.value)} />
        </label>
      </div>
      <button onClick={calc} disabled={saving} className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
        {saving ? "Calculando…" : "Calcular y guardar"}
      </button>

      {op.financiacion && (
        <div className="mt-3 rounded-lg bg-background p-3">
          <p className="text-xs text-muted-foreground">Cuota mensual estimada</p>
          <p className="text-xl font-extrabold text-accent">
            {op.financiacion.cuotaMensual.toLocaleString("es-AR", { maximumFractionDigits: 0 })} × {op.financiacion.cuotas}
          </p>
          <p className="text-xs text-muted-foreground">
            Financiado: {op.financiacion.montoFinanciado.toLocaleString("es-AR")} · Referencia, no vinculante.
          </p>
        </div>
      )}
    </div>
  );
}

function TradeInSection({
  op,
  onChanged,
  patch,
  userId,
}: {
  op: SaleOperation;
  onChanged: () => void;
  patch: (body: Record<string, unknown>) => Promise<void>;
  userId: string;
}) {
  const tradeIn = op.parteDePago;
  const [marca, setMarca] = useState(tradeIn.marca);
  const [modelo, setModelo] = useState(tradeIn.modelo);
  const [anio, setAnio] = useState(tradeIn.anio ? String(tradeIn.anio) : "");
  const [km, setKm] = useState(tradeIn.km ? String(tradeIn.km) : "");
  const [estado, setEstado] = useState(tradeIn.estado);
  const [appraising, setAppraising] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [addingToStock, setAddingToStock] = useState(false);

  if (!tradeIn.incluye) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="mb-1 text-sm font-semibold">Parte de pago</p>
        <p className="mb-3 text-xs text-muted-foreground">¿El comprador entrega un auto como parte del pago?</p>
        <button
          onClick={async () => {
            await patch({ action: "update_trade_in", incluye: true });
            onChanged();
          }}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-accent"
        >
          + Incluye auto como parte de pago
        </button>
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      await patch({ action: "update_trade_in", incluye: true, marca, modelo, anio: Number(anio) || null, km: Number(km) || null, estado });
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const appraise = async () => {
    if (!marca || !modelo || !anio) return;
    setAppraising(true);
    try {
      const result = await analyzeMarketPrice(marca, modelo, Number(anio), "ARS");
      const tasacion: TradeInAppraisal =
        result.count > 0
          ? { min: result.min, avg: result.avg, max: result.max, fuente: "matchcars" }
          : { min: 0, avg: 0, max: 0, fuente: "manual" };
      await patch({ action: "set_trade_in_appraisal", tasacion });
      onChanged();
    } finally {
      setAppraising(false);
    }
  };

  const addPhoto = async (file: File) => {
    setUploadingPhoto(true);
    try {
      const url = await uploadTradeInPhoto(userId, op.id, file);
      await patch({ action: "add_trade_in_photo", url });
      onChanged();
    } finally {
      setUploadingPhoto(false);
    }
  };

  const addToStock = async () => {
    setAddingToStock(true);
    try {
      await patch({ action: "add_trade_in_to_stock" });
      onChanged();
    } finally {
      setAddingToStock(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Parte de pago</p>
        <button
          onClick={async () => {
            await patch({ action: "update_trade_in", incluye: false });
            onChanged();
          }}
          className="text-xs text-error"
        >
          Quitar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input placeholder="Marca" className={inputClass} value={marca} onChange={(e) => setMarca(e.target.value)} />
        <input placeholder="Modelo" className={inputClass} value={modelo} onChange={(e) => setModelo(e.target.value)} />
        <input placeholder="Año" type="number" className={inputClass} value={anio} onChange={(e) => setAnio(e.target.value)} />
        <input placeholder="Km" type="number" className={inputClass} value={km} onChange={(e) => setKm(e.target.value)} />
      </div>
      <input placeholder="Estado (opcional)" className={`${inputClass} mt-2 w-full`} value={estado} onChange={(e) => setEstado(e.target.value)} />

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={save} disabled={saving} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
          {saving ? "Guardando…" : "Guardar datos"}
        </button>
        <button
          onClick={appraise}
          disabled={appraising || !marca || !modelo || !anio}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-50"
        >
          {appraising ? "Tasando…" : "Tasar con datos de MatchCars"}
        </button>
        <label className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">
          {uploadingPhoto ? "Subiendo…" : "+ Foto"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploadingPhoto}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) addPhoto(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {tradeIn.fotos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {tradeIn.fotos.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={url} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
          ))}
        </div>
      )}

      {tradeIn.tasacion && (
        <div className="mt-3 rounded-lg bg-background p-3">
          {tradeIn.tasacion.avg > 0 ? (
            <>
              <p className="text-xs text-muted-foreground">Tasación estimada (datos MatchCars)</p>
              <p className="text-lg font-extrabold text-accent">ARS {Math.round(tradeIn.tasacion.avg).toLocaleString("es-AR")}</p>
              <p className="text-xs text-muted-foreground">
                Min {Math.round(tradeIn.tasacion.min).toLocaleString("es-AR")} – Max {Math.round(tradeIn.tasacion.max).toLocaleString("es-AR")}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No hay suficientes publicaciones similares para tasar automáticamente — cargalo a mano si hace falta.</p>
          )}
        </div>
      )}

      <div className="mt-3 border-t border-border pt-3">
        {tradeIn.agregadoAlStock ? (
          <Link href={`/dashboard/stock/${tradeIn.vehiculoStockId}`} className="text-xs font-semibold text-accent">
            Ver en Stock (a preparar) →
          </Link>
        ) : (
          <button
            onClick={addToStock}
            disabled={addingToStock || !marca || !modelo}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
          >
            {addingToStock ? "Agregando…" : "Agregar al stock (a preparar)"}
          </button>
        )}
      </div>
    </div>
  );
}
