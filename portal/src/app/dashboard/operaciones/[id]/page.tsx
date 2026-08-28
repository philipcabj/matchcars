// portal/src/app/dashboard/operaciones/[id]/page.tsx
// Detalle de una operación de venta — checklist de trámites agrupado por
// fases (Acuerdo → Trámites → Entrega, solo la fase activa expandida por
// defecto) + financiación rápida y parte de pago como módulos opcionales
// aparte, no scroll obligatorio. Reordenado a partir de feedback real: la
// versión anterior mostraba las 7 tareas + financiación + parte de pago
// todas juntas en un solo scroll, sin indicar qué hacer primero ni qué era
// opcional.
"use client";

import { SaleJourney } from "@/components/SaleJourney";
import { ThousandsInput } from "@/components/ThousandsInput";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencyMe } from "@/hooks/useAgencyMe";
import { parseJsonResponse } from "@/lib/api-client";
import { CAR_MODELS_AR } from "@/lib/carModelsAr";
import { loadCatalogMakes, loadCatalogModels } from "@/lib/catalog";
import { analyzeMarketPrice } from "@/lib/pricing";
import {
  ChecklistItem,
  MetodoPagoResto,
  SaleOperation,
  suggestTradeInPrice,
  TRADE_IN_CONDITION_LABELS,
  TradeInAppraisal,
  TradeInCondition,
} from "@/lib/sale-operations";
import { uploadOperationDocument, uploadTradeInPhoto } from "@/lib/upload";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const STATIC_MAKES = Array.from(new Set(CAR_MODELS_AR.map((x) => x.make))).sort();
const STATIC_MODELS_BY_MAKE: Record<string, string[]> = CAR_MODELS_AR.reduce((acc, item) => {
  const list = acc[item.make] || [];
  if (!list.includes(item.model)) list.push(item.model);
  acc[item.make] = list;
  return acc;
}, {} as Record<string, string[]>);

// Agrupa las 7 tareas fijas de DEFAULT_CHECKLIST_STEPS (sale-operations.ts)
// en 3 fases con sentido de negocio — el orden interno de cada fase respeta
// el de DEFAULT_CHECKLIST_STEPS, esto solo las junta visualmente.
const PHASES: { name: string; keys: string[] }[] = [
  { name: "Acuerdo", keys: ["sena", "boleto_compraventa"] },
  { name: "Trámites", keys: ["verificacion_policial", "formulario_08", "informe_dominio"] },
  { name: "Entrega", keys: ["transferencia", "entrega"] },
];

const inputClass = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

// Mismo patrón que components/VehicleForm.tsx — input libre con sugerencias
// (datalist) en vez de un <select> estricto, para no bloquear cargar una
// marca/modelo que todavía no está catalogado.
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
  const listId = `dl-op-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="relative">
        <input
          ref={inputRef}
          list={listId}
          className={`${inputClass} w-full ${value ? "pr-7" : ""}`}
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
            className="absolute right-1.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground"
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

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// Precio de toma "efectivo" del usado — el que confirmó la agencia si ya lo
// cargó, si no la sugerencia calculada (valor de venta − margen por estado).
function tradeInTakePrice(tradeIn: SaleOperation["parteDePago"]): number {
  if (tradeIn.precioTomaFinal) return tradeIn.precioTomaFinal;
  if (tradeIn.tasacion?.avg) return suggestTradeInPrice(tradeIn.tasacion.avg, tradeIn.estado as TradeInCondition);
  return 0;
}

export default function OperationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getIdToken, user } = useAuth();
  const { data: agency } = useAgencyMe();
  const [op, setOp] = useState<SaleOperation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [downloadingRecord, setDownloadingRecord] = useState(false);

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

  // Antes, un error del servidor acá (ej. "Completá marca y modelo") se
  // tragaba en silencio: cada sección llamaba a patch() dentro de un
  // try/finally SIN catch, así que la excepción quedaba sin manejar y en
  // pantalla no pasaba nada (reportado con el botón "Agregar al stock").
  // Centralizado acá, un solo arreglo cubre todas las secciones.
  const patch = async (body: Record<string, unknown>) => {
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/sale-operations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      await parseJsonResponse(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      throw e;
    }
  };

  const refresh = () => setReloadKey((k) => k + 1);

  // Tildar un paso sentía demora porque esperaba una vuelta completa al
  // servidor (PATCH + refetch) antes de mostrar el cambio. Esto lo aplica
  // en pantalla al toque; si el PATCH de fondo falla, refresh() (llamado
  // desde el catch de quien use esto) trae el estado real del servidor.
  const updateChecklistLocally = (key: string, patch: Partial<ChecklistItem>) => {
    setOp((prev) => (prev ? { ...prev, checklist: prev.checklist.map((c) => (c.key === key ? { ...c, ...patch } : c)) } : prev));
  };

  // Mismo criterio que arriba, para lo que alimenta los chips de SaleJourney
  // (forma de pago, parte de pago) — sin esto, confirmar algo ahí abajo no se
  // veía reflejado arriba hasta el próximo refresh completo, y parecía que
  // "solo el checklist" reaccionaba a lo que se tildaba.
  const updateOpLocally = (patch: Partial<SaleOperation>) => {
    setOp((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  // Snapshot con todo el detalle de la operación (forma de pago,
  // financiación, parte de pago, checklist, entrega) — a diferencia del
  // boleto/recibo, no queda atado a ningún paso del checklist, se puede
  // pedir en cualquier momento con los datos que haya hasta ese punto.
  const downloadRecord = async () => {
    setDownloadingRecord(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/sale-operations/${id}/document`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipo: "registro" }),
      });
      const data = await parseJsonResponse<{ url: string }>(res);
      setError(null);
      window.open(data.url, "_blank");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setDownloadingRecord(false);
    }
  };

  if (error && !op) return <p className="text-sm text-error">No pudimos abrir esta operación: {error}</p>;
  if (!op) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const doneCount = op.checklist.filter((c) => c.status === "hecho").length;
  // Próximo paso = primer ítem pendiente en el orden fijo del checklist —
  // antes no había ningún indicador de "qué sigue", solo una lista plana
  // que había que leer entera para saber qué faltaba.
  const nextItem = op.checklist.find((c) => c.status === "pendiente") ?? null;
  // Precio del auto menos el precio de TOMA del usado entregado (no el valor
  // de venta estimado — eso es lo que se espera cobrar después de revenderlo,
  // no lo que se paga/acredita ahora) = lo que falta cubrir. Alimenta tanto
  // el resumen de "Forma de pago" como el precio total pre-cargado de la
  // calculadora de Financiación, para no tener que volver a escribirlo a mano.
  const vehiclePrice = op.vehicleSnapshot?.price ?? 0;
  const tradeInValue = op.parteDePago.incluye ? tradeInTakePrice(op.parteDePago) : 0;
  const restanteACubrir = Math.max(0, vehiclePrice - tradeInValue);

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
          {typeof op.vehicleSnapshot?.price === "number" && op.vehicleSnapshot.price > 0 && (
            <p className="text-sm font-bold text-accent">
              {op.vehicleSnapshot.currency ?? "ARS"} {op.vehicleSnapshot.price.toLocaleString("es-AR")}
              <span className="ml-1 text-xs font-normal text-muted-foreground">publicado hoy</span>
            </p>
          )}
          <p className="text-sm text-muted-foreground">{op.buyerLabel}</p>
          {op.assignedTo && <p className="text-xs text-muted-foreground">Vendedor: {memberName(op.assignedTo)}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Documentación: {doneCount}/{op.checklist.length}</span>
          <button
            onClick={downloadRecord}
            disabled={downloadingRecord}
            title="Descargar un PDF con todo el detalle de esta operación"
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {downloadingRecord ? "Generando…" : "📄 Registro"}
          </button>
          {op.status === "en_curso" ? (
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  // El checklist en 7/7 marca los trámites hechos, pero no
                  // que el comprador ya confirmó la entrega por la app (ver
                  // paso "Comprador confirma" en SaleJourney) — sin este aviso
                  // se podía marcar "Completada" en verde mientras esa
                  // confirmación seguía pendiente, algo que se veía
                  // inconsistente en pantalla.
                  const pendingBuyerConfirm = !!op.buyerId && op.vehicleStatus === "reserved";
                  if (
                    pendingBuyerConfirm &&
                    !confirm("El comprador todavía no confirmó la entrega desde la app. ¿Marcar la operación como completada igual?")
                  ) {
                    return;
                  }
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

      <SaleJourney op={op} />

      <PaymentStructureSection op={op} onChanged={refresh} patch={patch} onOptimisticUpdate={updateOpLocally} />

      {op.status === "en_curso" && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${
            nextItem ? "border-accent/40 bg-accent/5 text-accent" : "border-success/40 bg-success/5 text-success"
          }`}
        >
          {nextItem ? (
            <>
              <span>→</span>
              <span>Próximo paso: {nextItem.label}</span>
            </>
          ) : (
            <>
              <span>✓</span>
              <span>Checklist completo — falta marcar la operación como completada.</span>
            </>
          )}
        </div>
      )}

      {error && <p className="text-sm text-error">{error}</p>}

      <div id="checklist" className="scroll-mt-4">
        <div className="mb-2">
          <p className="text-sm font-semibold">Documentación y trámites</p>
          <p className="text-xs text-muted-foreground">
            Los pasos puntuales de esta venta — forma de pago y parte de pago se gestionan aparte, más abajo.
          </p>
        </div>
        <ChecklistSection
          op={op}
          agency={agency}
          onChanged={refresh}
          patch={patch}
          userId={user?.uid ?? ""}
          onError={setError}
          nextKey={nextItem?.key ?? null}
          onOptimisticUpdate={updateChecklistLocally}
        />
      </div>

      <BuyerPortalSection op={op} onChanged={refresh} patch={patch} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FinancingSection
          op={op}
          onChanged={refresh}
          patch={patch}
          forceOpen={op.metodoPago === "financiado_propio"}
          initialPrecioTotal={restanteACubrir}
        />
        <div id="parte-de-pago" className="scroll-mt-4">
          <TradeInSection op={op} agency={agency} onChanged={refresh} patch={patch} userId={user?.uid ?? ""} onOptimisticUpdate={updateOpLocally} />
        </div>
      </div>
    </div>
  );
}

// Portal público del comprador (/mi-operacion/[token]) — mismo link sirve
// para seguir el checklist, firmar Seña/Boleto y subir documentación
// pedida. Acá la agencia lo copia/reenvía y pide documentos nuevos.
function BuyerPortalSection({
  op,
  onChanged,
  patch,
}: {
  op: SaleOperation;
  onChanged: () => void;
  patch: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = `https://portal.matchcars.app/mi-operacion/${op.buyerAccessToken}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard puede fallar por permisos del navegador — no es bloqueante,
      // el link sigue visible en pantalla para copiar a mano.
    }
  };

  const addRequest = async () => {
    const label = newLabel.trim();
    if (!label) return;
    setAdding(true);
    try {
      await patch({ action: "add_document_request", label });
      setNewLabel("");
      onChanged();
    } finally {
      setAdding(false);
    }
  };

  const removeRequest = async (requestId: string) => {
    await patch({ action: "remove_document_request", requestId });
    onChanged();
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-1 text-sm font-semibold">Portal del comprador</p>
      <p className="mb-3 text-xs text-muted-foreground">
        {op.buyerContactEmail
          ? "El comprador sigue el estado de la operación, firma Seña/Boleto y sube lo que le pidas desde este link."
          : "No hay un email de contacto cargado — el comprador no va a poder firmar ni recibir avisos hasta que cargues uno."}
      </p>

      <div className="flex items-center gap-2">
        <input readOnly value={link} className={`${inputClass} flex-1 text-xs`} onFocus={(e) => e.target.select()} />
        <button onClick={copyLink} className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold">
          {copied ? "¡Copiado!" : "Copiar"}
        </button>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <p className="mb-2 text-xs font-semibold">Documentos pedidos</p>
        {op.documentRequests.length === 0 ? (
          <p className="text-xs text-muted-foreground">Todavía no pediste ningún documento.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {op.documentRequests.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{d.label}</p>
                  {d.uploadedUrl ? (
                    <a href={d.uploadedUrl} target="_blank" rel="noreferrer" className="text-success underline">
                      Ver archivo subido
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Pendiente</span>
                  )}
                </div>
                {!d.uploadedUrl && (
                  <button onClick={() => removeRequest(d.id)} className="shrink-0 text-error">
                    Quitar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder='Ej. "DNI (frente y dorso)"'
            className={`${inputClass} flex-1 text-xs`}
          />
          <button
            onClick={addRequest}
            disabled={adding || !newLabel.trim()}
            className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground disabled:opacity-50"
          >
            {adding ? "Agregando…" : "Pedir documento"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChecklistSection({
  op,
  agency,
  onChanged,
  patch,
  userId,
  onError,
  nextKey,
  onOptimisticUpdate,
}: {
  op: SaleOperation;
  agency: ReturnType<typeof useAgencyMe>["data"];
  onChanged: () => void;
  patch: (body: Record<string, unknown>) => Promise<void>;
  userId: string;
  onError: (msg: string | null) => void;
  nextKey: string | null;
  onOptimisticUpdate: (key: string, patch: Partial<ChecklistItem>) => void;
}) {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [senaPrompt, setSenaPrompt] = useState(false);
  const [senaMonto, setSenaMonto] = useState("");
  const [senaCurrency, setSenaCurrency] = useState<"ARS" | "USD">((op.vehicleSnapshot?.currency as "ARS" | "USD") || "ARS");
  // Flujo secuencial a propósito: primero se genera el recibo, y recién ahí
  // aparece la opción de enviarlo a firmar — no dos botones en paralelo sin
  // orden claro. Se resetea si cambia el monto (ya no sería el mismo
  // documento que se generó).
  const [senaReadyToSend, setSenaReadyToSend] = useState(false);
  const { getIdToken } = useAuth();

  // Fase activa = la primera que tiene algún ítem pendiente — se expande
  // sola. Las demás arrancan colapsadas, pero se pueden abrir a mano (ej.
  // para adjuntar un documento de una fase futura sin esperar a llegar ahí).
  const activePhaseIndex = PHASES.findIndex((phase) => phase.keys.includes(nextKey ?? ""));
  const [manualExpand, setManualExpand] = useState<Record<number, boolean>>({});

  const generateDocument = async (tipo: "boleto_compraventa" | "recibo_sena", key: string, monto?: number, montoCurrency?: string) => {
    setGeneratingKey(key);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/sale-operations/${op.id}/document`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipo, monto, montoCurrency }),
      });
      const data = await parseJsonResponse<{ url: string }>(res);
      onError(null);
      onChanged();
      window.open(data.url, "_blank");
      if (tipo === "recibo_sena") setSenaReadyToSend(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setGeneratingKey(null);
      // A propósito NO se cierra el prompt de seña ni se borra el monto acá
      // — recién generado es cuando tiene sentido "Enviar a firmar" (ver
      // senaReadyToSend), no antes.
    }
  };

  // Firma electrónica in-house (Ley 25.506, firma electrónica simple) — solo
  // Seña y Boleto son firmables, ver SignableChecklistKey en
  // lib/sale-operations.ts para por qué. El vendedor "firma" al enviar (ya
  // está autenticado); el comprador firma con checkbox + código por email
  // desde /mi-operacion/[token].
  const sendForSignature = async (key: "sena" | "boleto_compraventa", monto?: number, montoCurrency?: string) => {
    setSendingKey(key);
    try {
      await patch({ action: "send_for_signature", key, monto, montoCurrency });
      onChanged();
      // Solo se cierra el prompt si realmente se mandó — si falla, se deja
      // el monto cargado para reintentar sin escribirlo de nuevo.
      setSenaPrompt(false);
      setSenaMonto("");
    } catch {
      // patch() ya dejó el error visible arriba del checklist
    } finally {
      setSendingKey(null);
    }
  };

  const toggleDone = async (item: ChecklistItem) => {
    const nextStatus = item.status === "hecho" ? "pendiente" : "hecho";
    // Optimista: se ve el tilde al toque, sin esperar la vuelta del PATCH +
    // el refetch completo de la operación. Si el guardado de fondo falla,
    // onChanged() (llamado desde el catch) trae el estado real y corrige.
    onOptimisticUpdate(item.key, { status: nextStatus, completedAt: nextStatus === "hecho" ? new Date().toISOString() : null });
    try {
      await patch({ action: "update_checklist_item", key: item.key, status: nextStatus });
    } catch {
      onChanged();
    }
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

  // El backend ya soportaba esto (action "remove_attachment") pero no había
  // ningún botón para usarlo — un PDF generado con un monto equivocado se
  // quedaba pegado ahí para siempre, sin forma de sacarlo antes de generar
  // uno nuevo.
  const removeAttachment = async (item: ChecklistItem, url: string) => {
    if (!confirm("¿Sacar este archivo del paso? No se puede deshacer.")) return;
    await patch({ action: "remove_attachment", key: item.key, url });
    onChanged();
  };

  const renderItem = (item: ChecklistItem) => {
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
                <>
                  <button
                    onClick={() => generateDocument("boleto_compraventa", item.key)}
                    disabled={generatingKey === item.key}
                    title="Descarga el PDF para imprimir/firmar en persona — no le manda nada al comprador"
                    className="rounded-md border border-accent/40 bg-accent/5 px-2 py-1 text-xs font-semibold text-accent disabled:opacity-50"
                  >
                    {generatingKey === item.key ? "Generando…" : "📄 Generar PDF"}
                  </button>
                  <button
                    onClick={() => sendForSignature("boleto_compraventa")}
                    disabled={sendingKey === item.key || !op.buyerContactEmail}
                    title={!op.buyerContactEmail ? "Cargá un email de contacto del comprador para poder enviarlo a firmar" : "Le manda el documento al comprador para que lo firme desde su portal"}
                    className="rounded-md border border-success/40 bg-success/5 px-2 py-1 text-xs font-semibold text-success disabled:opacity-50"
                  >
                    {sendingKey === item.key ? "Enviando…" : "✍️ Enviar a firmar"}
                  </button>
                </>
              )}
              {item.key === "sena" && (
                <button
                  onClick={() => {
                    setSenaPrompt(true);
                    setSenaReadyToSend(false);
                  }}
                  disabled={generatingKey === item.key}
                  className="rounded-md border border-accent/40 bg-accent/5 px-2 py-1 text-xs font-semibold text-accent disabled:opacity-50"
                >
                  {generatingKey === item.key ? "Generando…" : "📄 Generar recibo"}
                </button>
              )}
            </div>

            {item.key === "sena" && senaPrompt && (
              <div className="mt-2 flex flex-col gap-2 rounded-md border border-border bg-background p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    autoFocus
                    placeholder="Monto de la seña"
                    value={senaMonto}
                    onChange={(e) => {
                      setSenaMonto(e.target.value);
                      setSenaReadyToSend(false);
                    }}
                    className="w-28 rounded-md border border-border bg-card px-2 py-1 text-xs"
                  />
                  <select
                    value={senaCurrency}
                    onChange={(e) => {
                      setSenaCurrency(e.target.value as "ARS" | "USD");
                      setSenaReadyToSend(false);
                    }}
                    className="rounded-md border border-border bg-card px-2 py-1 text-xs"
                  >
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                  </select>
                  <button
                    onClick={() => generateDocument("recibo_sena", item.key, Number(senaMonto), senaCurrency)}
                    disabled={!senaMonto || Number(senaMonto) <= 0}
                    title="Descarga el PDF para imprimir/firmar en persona — no le manda nada al comprador"
                    className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-accent-foreground disabled:opacity-50"
                  >
                    {generatingKey === item.key ? "Generando…" : "1. Generar recibo"}
                  </button>
                  <button onClick={() => setSenaPrompt(false)} className="text-xs text-muted-foreground">
                    Cancelar
                  </button>
                </div>
                {senaReadyToSend ? (
                  <button
                    onClick={() => sendForSignature("sena", Number(senaMonto), senaCurrency)}
                    disabled={sendingKey === item.key || !op.buyerContactEmail}
                    title={!op.buyerContactEmail ? "Cargá un email de contacto del comprador para poder enviarlo a firmar" : "Le manda el documento al comprador para que lo firme desde su portal"}
                    className="self-start rounded-md border border-success/40 bg-success/5 px-2 py-1 text-xs font-semibold text-success disabled:opacity-50"
                  >
                    {sendingKey === item.key ? "Enviando…" : "2. ✍️ Enviar a firmar"}
                  </button>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Generá el recibo primero — recién ahí se puede enviar a firmar.</p>
                )}
              </div>
            )}

            {(item.key === "sena" || item.key === "boleto_compraventa") && op.signatures[item.key] && (
              <p className="mt-2 text-xs">
                {op.signatures[item.key]!.status === "signed" ? (
                  <span className="font-semibold text-success">✍️ Firmado el {new Date(op.signatures[item.key]!.buyer.signedAt!).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                ) : (
                  <span className="font-semibold text-accent">Enviado a firmar — esperando al comprador</span>
                )}
              </p>
            )}

            {item.adjuntos.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {item.adjuntos.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">
                      📎 {a.nombre}
                    </a>
                    <button onClick={() => removeAttachment(item, a.url)} className="text-xs text-error hover:underline">
                      Sacar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {PHASES.map((phase, i) => {
        const items = phase.keys.map((k) => op.checklist.find((c) => c.key === k)).filter((c): c is ChecklistItem => !!c);
        const phaseDone = items.filter((c) => c.status === "hecho").length;
        const allDone = phaseDone === items.length;
        const expanded = manualExpand[i] !== undefined ? manualExpand[i] : i === activePhaseIndex || (activePhaseIndex === -1 && i === PHASES.length - 1);
        return (
          <div key={phase.name} className="rounded-2xl border border-border bg-card p-4">
            <button
              onClick={() => setManualExpand((prev) => ({ ...prev, [i]: !expanded }))}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                    allDone ? "bg-success text-white" : "bg-muted/20 text-muted-foreground"
                  }`}
                >
                  {allDone ? "✓" : i + 1}
                </span>
                <p className="text-sm font-semibold">{phase.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{phaseDone}/{items.length}</span>
                <span className="text-xs text-muted-foreground">{expanded ? "▲" : "▼"}</span>
              </div>
            </button>
            {expanded && <div className="mt-3 flex flex-col gap-2">{items.map(renderItem)}</div>}
          </div>
        );
      })}
    </div>
  );
}

const METODO_PAGO_LABELS: Record<MetodoPagoResto, string> = {
  efectivo: "Efectivo / contado",
  financiado_propio: "Financiado por la agencia",
  financiado_externo: "Financiado (financiera externa)",
};

// Junta en un solo lugar las tres preguntas que hoy quedaban repartidas
// entre Parte de pago, Financiación y la seña: ¿hay un usado de por medio?,
// ¿cómo se cubre el resto (o el total)? — y arma la cuenta Precio − Usado =
// Resto, que antes había que calcular a mano combinando secciones sueltas.
function PaymentStructureSection({
  op,
  onChanged,
  patch,
  onOptimisticUpdate,
}: {
  op: SaleOperation;
  onChanged: () => void;
  patch: (body: Record<string, unknown>) => Promise<void>;
  onOptimisticUpdate: (patch: Partial<SaleOperation>) => void;
}) {
  const [financieraNombre, setFinancieraNombre] = useState(op.financieraNombre ?? "");
  const [confirming, setConfirming] = useState(false);
  const currency = op.vehicleSnapshot?.currency ?? "ARS";
  const vehiclePrice = op.vehicleSnapshot?.price ?? 0;
  const tradeInValue = op.parteDePago.incluye ? tradeInTakePrice(op.parteDePago) : 0;
  const resto = Math.max(0, vehiclePrice - tradeInValue);

  const setIncluyeUsado = async (incluye: boolean) => {
    onOptimisticUpdate({ parteDePago: { ...op.parteDePago, incluye } });
    try {
      await patch({ action: "update_trade_in", incluye });
    } catch {
      onChanged();
    }
  };

  const setMetodoPago = async (metodoPago: string) => {
    const metodoPagoChanged = metodoPago !== (op.metodoPago ?? null);
    onOptimisticUpdate({ metodoPago: metodoPago as SaleOperation["metodoPago"], financieraNombre, metodoPagoConfirmado: metodoPagoChanged ? false : op.metodoPagoConfirmado });
    try {
      await patch({ action: "update_metodo_pago", metodoPago, financieraNombre });
    } catch {
      onChanged();
    }
  };

  const confirmMetodoPago = async () => {
    if (op.parteDePago.incluye && !op.parteDePago.precioTomaConfirmado) {
      alert('Confirmá primero la parte de pago del auto usado (más abajo) antes de cerrar la forma de pago.');
      return;
    }
    if (!confirm("¿Confirmar la forma de pago? Queda cerrada hasta que toques \"Editar\".")) return;
    setConfirming(true);
    onOptimisticUpdate({ metodoPagoConfirmado: true });
    try {
      await patch({ action: "confirm_metodo_pago" });
    } catch {
      onChanged();
    } finally {
      setConfirming(false);
    }
  };

  const editMetodoPago = async () => {
    onOptimisticUpdate({ metodoPagoConfirmado: false });
    try {
      await patch({ action: "update_metodo_pago", metodoPago: op.metodoPago, financieraNombre: op.financieraNombre, metodoPagoConfirmado: false });
    } catch {
      onChanged();
    }
  };

  if (op.metodoPagoConfirmado) {
    return (
      <div id="forma-de-pago" className="scroll-mt-4 rounded-2xl border border-success/40 bg-success/5 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-success">✓ Forma de pago confirmada</p>
          <button onClick={editMetodoPago} className="shrink-0 text-xs font-semibold text-muted-foreground hover:text-foreground">
            Editar
          </button>
        </div>
        <p className="mt-2 text-sm">
          {op.parteDePago.incluye ? "Con auto como parte de pago" : "Sin parte de pago"} ·{" "}
          {op.metodoPago ? METODO_PAGO_LABELS[op.metodoPago] : "—"}
          {op.metodoPago === "financiado_externo" && op.financieraNombre ? ` (${op.financieraNombre})` : ""}
        </p>
        {vehiclePrice > 0 && (
          <div className="mt-3 flex flex-col gap-1 rounded-lg bg-background p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Precio del auto</span>
              <span className="font-semibold">{currency} {vehiclePrice.toLocaleString("es-AR")}</span>
            </div>
            {op.parteDePago.incluye && (
              <div className="flex justify-between text-muted-foreground">
                <span>− Parte de pago (precio de toma)</span>
                <span>− {currency} {Math.round(tradeInValue).toLocaleString("es-AR")}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-1 font-bold text-success">
              <span>{op.parteDePago.incluye ? "Resto a cubrir" : "Total a cubrir"}</span>
              <span>{currency} {Math.round(resto).toLocaleString("es-AR")}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div id="forma-de-pago" className="scroll-mt-4 rounded-2xl border border-accent/30 bg-accent/5 p-4">
      <p className="mb-3 text-sm font-semibold">Forma de pago</p>

      <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">¿Entrega un auto como parte de pago?</p>
          <div className="flex gap-2">
            <button
              onClick={() => setIncluyeUsado(false)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                !op.parteDePago.incluye ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground"
              }`}
            >
              No
            </button>
            <button
              onClick={() => setIncluyeUsado(true)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                op.parteDePago.incluye ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground"
              }`}
            >
              Sí
            </button>
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            ¿Cómo se cubre {op.parteDePago.incluye ? "el resto" : "el precio"}?
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(METODO_PAGO_LABELS) as (keyof typeof METODO_PAGO_LABELS)[]).map((m) => (
              <button
                key={m}
                onClick={() => setMetodoPago(m)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  op.metodoPago === m ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground"
                }`}
              >
                {METODO_PAGO_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {op.metodoPago === "financiado_externo" && (
        <div className="mt-3 flex items-center gap-2">
          <input
            placeholder="Nombre de la financiera (opcional)"
            value={financieraNombre}
            onChange={(e) => setFinancieraNombre(e.target.value)}
            onBlur={() => patch({ action: "update_metodo_pago", metodoPago: op.metodoPago, financieraNombre }).then(onChanged)}
            className={`${inputClass} w-64`}
          />
        </div>
      )}

      {vehiclePrice > 0 && (
        <div className="mt-3 flex flex-col gap-1 rounded-lg bg-background p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Precio del auto</span>
            <span className="font-semibold">{currency} {vehiclePrice.toLocaleString("es-AR")}</span>
          </div>
          {op.parteDePago.incluye && (
            <div className="flex justify-between text-muted-foreground">
              <span>− Parte de pago {tradeInValue > 0 ? "(precio de toma)" : "(todavía sin definir)"}</span>
              <span>− {currency} {Math.round(tradeInValue).toLocaleString("es-AR")}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-1 font-bold text-accent">
            <span>{op.parteDePago.incluye ? "Resto a cubrir" : "Total a cubrir"}</span>
            <span>{currency} {Math.round(resto).toLocaleString("es-AR")}</span>
          </div>
        </div>
      )}

      <button
        onClick={confirmMetodoPago}
        disabled={confirming || !op.metodoPago}
        title={!op.metodoPago ? "Elegí cómo se cubre el pago antes de confirmar" : undefined}
        className="mt-3 rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {confirming ? "Confirmando…" : "✓ Confirmar forma de pago"}
      </button>
    </div>
  );
}

function FinancingSection({
  op,
  onChanged,
  patch,
  forceOpen,
  initialPrecioTotal,
}: {
  op: SaleOperation;
  onChanged: () => void;
  patch: (body: Record<string, unknown>) => Promise<void>;
  forceOpen: boolean;
  initialPrecioTotal: number;
}) {
  // Derivado, no sincronizado con un efecto: si desde "Forma de pago" se
  // elige "Financiado por la agencia", esta tarjeta se abre sola en el
  // siguiente render en vez de quedar colapsada esperando que alguien la
  // encuentre y la abra a mano. manuallyOpened cubre el click en
  // "+ Agregar financiación" cuando no aplica ninguna de las otras dos.
  const [manuallyOpened, setManuallyOpened] = useState(false);
  const open = !!op.financiacion || forceOpen || manuallyOpened;
  const [anticipo, setAnticipo] = useState(String(op.financiacion?.anticipo ?? ""));
  const [cuotas, setCuotas] = useState(String(op.financiacion?.cuotas ?? "12"));
  const [tasaAnual, setTasaAnual] = useState(String(op.financiacion?.tasaAnual ?? ""));
  // Antes precioTotal arrancaba vacío apenas ya había una financiación
  // guardada (montoFinanciado, que se persistía, ya viene con el anticipo
  // restado — no alcanza para reconstruir el precio total original), así que
  // reabrir para modificar un cálculo existente mostraba el campo en blanco.
  const [precioTotal, setPrecioTotal] = useState(
    op.financiacion?.precioTotal ? String(op.financiacion.precioTotal) : initialPrecioTotal > 0 ? String(Math.round(initialPrecioTotal)) : ""
  );
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

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

  const removeFinancing = async () => {
    if (!confirm("¿Quitar la financiación de esta operación? Se borra el cálculo guardado.")) return;
    setClearing(true);
    try {
      await patch({ action: "clear_financing" });
      setManuallyOpened(false);
      onChanged();
    } finally {
      setClearing(false);
    }
  };

  if (!open) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="mb-1 text-sm font-semibold">Financiación</p>
        <p className="mb-3 text-xs text-muted-foreground">¿La venta incluye un plan de cuotas?</p>
        <button onClick={() => setManuallyOpened(true)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-accent">
          + Agregar financiación
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sm font-semibold">Financiación</p>
        {op.financiacion ? (
          <button onClick={removeFinancing} disabled={clearing} className="text-xs font-semibold text-error disabled:opacity-50">
            {clearing ? "Quitando…" : "Quitar financiación"}
          </button>
        ) : (
          !forceOpen && (
            <button onClick={() => setManuallyOpened(false)} className="text-xs text-muted-foreground">
              Quitar
            </button>
          )
        )}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Calculadora propia, sin conexión a ninguna financiera — vos cargás la tasa que apliques.
      </p>
      <div className="grid grid-cols-2 gap-2">
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
  agency,
  onChanged,
  patch,
  userId,
  onOptimisticUpdate,
}: {
  op: SaleOperation;
  agency: ReturnType<typeof useAgencyMe>["data"];
  onChanged: () => void;
  patch: (body: Record<string, unknown>) => Promise<void>;
  userId: string;
  onOptimisticUpdate: (patch: Partial<SaleOperation>) => void;
}) {
  const tradeIn = op.parteDePago;
  const [marca, setMarca] = useState(tradeIn.marca);
  const [modelo, setModelo] = useState(tradeIn.modelo);
  const [version, setVersion] = useState(tradeIn.version);
  const [anio, setAnio] = useState(tradeIn.anio ? String(tradeIn.anio) : "");
  const [km, setKm] = useState(tradeIn.km ? String(tradeIn.km) : "");
  const [estado, setEstado] = useState<TradeInCondition | "">(tradeIn.estado);
  const [precioTomaFinal, setPrecioTomaFinal] = useState(tradeIn.precioTomaFinal ? String(tradeIn.precioTomaFinal) : "");
  const [tasadoPor, setTasadoPor] = useState(tradeIn.tasadoPor ?? "");
  const [manualValorVenta, setManualValorVenta] = useState("");
  const [showManualValorVenta, setShowManualValorVenta] = useState(false);
  const [appraising, setAppraising] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [confirmingPrice, setConfirmingPrice] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [addingToStock, setAddingToStock] = useState(false);
  const [catalogMakes, setCatalogMakes] = useState<string[]>([]);
  const [catalogModels, setCatalogModels] = useState<{ name: string; versions: string[] }[]>([]);
  const suggested = tradeIn.tasacion?.avg ? suggestTradeInPrice(tradeIn.tasacion.avg, estado) : 0;

  useEffect(() => {
    loadCatalogMakes().then(setCatalogMakes);
  }, []);

  useEffect(() => {
    if (!marca) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset síncrono cuando falta la marca, no dispara un fetch
      setCatalogModels([]);
      return;
    }
    let cancelled = false;
    loadCatalogModels(marca).then((models) => {
      if (!cancelled) setCatalogModels(models);
    });
    return () => {
      cancelled = true;
    };
  }, [marca]);

  const makeOptions = useMemo(() => Array.from(new Set([...STATIC_MAKES, ...catalogMakes])).sort(), [catalogMakes]);
  const modelOptions = useMemo(() => {
    const fromStatic = STATIC_MODELS_BY_MAKE[marca] || [];
    const fromCatalog = catalogModels.map((m) => m.name);
    return Array.from(new Set([...fromStatic, ...fromCatalog])).sort();
  }, [marca, catalogModels]);
  const versionOptions = useMemo(() => {
    const fromStatic = CAR_MODELS_AR.find((x) => x.make === marca && x.model === modelo)?.versions || [];
    const fromCatalog = catalogModels.find((m) => m.name === modelo)?.versions || [];
    return Array.from(new Set([...fromStatic, ...fromCatalog])).sort();
  }, [marca, modelo, catalogModels]);

  if (!tradeIn.incluye) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="mb-1 text-sm font-semibold">Parte de pago</p>
        <p className="mb-3 text-xs text-muted-foreground">¿El comprador entrega un auto como parte del pago?</p>
        <button
          onClick={async () => {
            onOptimisticUpdate({ parteDePago: { ...op.parteDePago, incluye: true } });
            try {
              await patch({ action: "update_trade_in", incluye: true });
            } catch {
              onChanged();
            }
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
      await patch({
        action: "update_trade_in",
        incluye: true,
        marca,
        modelo,
        version,
        anio: Number(anio) || null,
        km: Number(km) || null,
        estado,
        precioTomaFinal: precioTomaFinal ? Number(precioTomaFinal) : null,
        tasadoPor: tasadoPor || null,
      });
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
      if (result.count > 0) {
        await patch({ action: "set_trade_in_appraisal", tasacion: { min: result.min, avg: result.avg, max: result.max, fuente: "matchcars" } });
        onChanged();
      } else {
        // Sin publicaciones similares para comparar — antes esto dejaba a la
        // agencia sin ningún valor y sin forma de cargar uno a mano (el
        // texto decía "cargalo a mano" pero no había dónde). Ahora abre el
        // campo manual en vez de guardar una tasación en $0.
        setShowManualValorVenta(true);
      }
    } finally {
      setAppraising(false);
    }
  };

  const saveManualValorVenta = async () => {
    const val = Number(manualValorVenta) || 0;
    if (val <= 0) return;
    setSavingManual(true);
    try {
      const tasacion: TradeInAppraisal = { min: val, avg: val, max: val, fuente: "manual" };
      await patch({ action: "set_trade_in_appraisal", tasacion });
      onChanged();
      setShowManualValorVenta(false);
      setManualValorVenta("");
    } finally {
      setSavingManual(false);
    }
  };

  const applySuggested = () => setPrecioTomaFinal(String(suggested));

  const confirmPrice = async () => {
    const val = Number(precioTomaFinal) || 0;
    if (val <= 0) return;
    if (!tasadoPor) {
      alert("Elegí quién tasó el auto antes de confirmar la parte de pago.");
      return;
    }
    if (!confirm(`¿Confirmar la parte de pago en ARS ${val.toLocaleString("es-AR")}? Esto cierra los datos del auto recibido — marca, modelo, estado y precio quedan fijos hasta que toques "Editar".`)) {
      return;
    }
    setConfirmingPrice(true);
    try {
      // Guarda el número tipeado y confirma en un solo paso — así el precio
      // que queda marcado como "confirmado" es exactamente el que se ve en
      // pantalla, no uno guardado antes.
      await patch({
        action: "update_trade_in",
        incluye: true,
        marca,
        modelo,
        version,
        anio: Number(anio) || null,
        km: Number(km) || null,
        estado,
        precioTomaFinal: val,
        tasadoPor: tasadoPor || null,
      });
      await patch({ action: "confirm_trade_in_price" });
      onOptimisticUpdate({ parteDePago: { ...op.parteDePago, marca, modelo, version, anio: Number(anio) || null, km: Number(km) || null, estado, precioTomaFinal: val, tasadoPor: tasadoPor || null, precioTomaConfirmado: true } });
    } catch {
      onChanged();
    } finally {
      setConfirmingPrice(false);
    }
  };

  const editPrice = async () => {
    onOptimisticUpdate({ parteDePago: { ...op.parteDePago, precioTomaConfirmado: false } });
    try {
      await patch({ action: "update_trade_in", incluye: true, precioTomaConfirmado: false });
    } catch {
      onChanged();
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
      // Guarda los datos tipeados antes de crear el auto en Stock — antes,
      // si tocabas "Agregar al stock" sin haber tocado "Guardar datos" antes,
      // el servidor validaba contra lo último guardado (podía estar vacío) y
      // devolvía un error que la pantalla nunca mostraba (ver fix de patch()
      // más arriba) — el botón parecía "no hacer nada".
      await patch({
        action: "update_trade_in",
        incluye: true,
        marca,
        modelo,
        version,
        anio: Number(anio) || null,
        km: Number(km) || null,
        estado,
        precioTomaFinal: precioTomaFinal ? Number(precioTomaFinal) : null,
        tasadoPor: tasadoPor || null,
      });
      await patch({ action: "add_trade_in_to_stock" });
      onChanged();
    } finally {
      setAddingToStock(false);
    }
  };

  const tasadoPorName = (agency?.members ?? []).find((m) => m.uid === tradeIn.tasadoPor)?.name
    || (agency?.members ?? []).find((m) => m.uid === tradeIn.tasadoPor)?.email
    || tradeIn.tasadoPor;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Parte de pago</p>
        {!tradeIn.precioTomaConfirmado && (
          <button
            onClick={async () => {
              onOptimisticUpdate({ parteDePago: { ...op.parteDePago, incluye: false } });
              try {
                await patch({ action: "update_trade_in", incluye: false });
              } catch {
                onChanged();
              }
            }}
            className="text-xs text-error"
          >
            Quitar
          </button>
        )}
      </div>

      {tradeIn.precioTomaConfirmado ? (
        // Confirmada = cerrada. Antes de esto la sección quedaba siempre
        // editable aunque ya se hubiera "confirmado" el precio — ahora
        // confirmar cierra marca/modelo/estado/tasador también, no solo el
        // número, y hay que tocar "Editar" a propósito para volver a tocarlo.
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-success/40 bg-success/5 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-success">✓ Parte de pago confirmada</p>
              <button onClick={editPrice} className="shrink-0 text-xs font-semibold text-muted-foreground hover:text-foreground">
                Editar
              </button>
            </div>
            <p className="mt-2 text-sm font-bold">
              {tradeIn.marca} {tradeIn.modelo} {tradeIn.version} {tradeIn.anio ?? ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {tradeIn.km ? `${tradeIn.km.toLocaleString("es-AR")} km` : "Km sin definir"}
              {tradeIn.estado ? ` · ${TRADE_IN_CONDITION_LABELS[tradeIn.estado]}` : ""}
            </p>
            <p className="mt-2 text-lg font-extrabold text-success">ARS {(tradeIn.precioTomaFinal ?? 0).toLocaleString("es-AR")}</p>
            <p className="text-xs text-muted-foreground">Tasado por: {tasadoPorName || "—"}</p>
          </div>
          {tradeIn.fotos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {tradeIn.fotos.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={url} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2">
            <DatalistField
              label="Marca"
              value={marca}
              options={makeOptions}
              onChange={(v) => {
                setMarca(v);
                setModelo("");
                setVersion("");
              }}
            />
            <DatalistField
              label="Modelo"
              value={modelo}
              options={modelOptions}
              disabled={!marca}
              placeholder="Elegí una marca primero"
              onChange={(v) => {
                setModelo(v);
                setVersion("");
              }}
            />
            <DatalistField
              label="Versión"
              value={version}
              options={versionOptions}
              disabled={!modelo}
              placeholder="Elegí un modelo primero"
              onChange={setVersion}
            />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Año</span>
              <input type="number" className={inputClass} value={anio} onChange={(e) => setAnio(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Km</span>
              <ThousandsInput value={km} onChange={setKm} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Estado</span>
              <select className={inputClass} value={estado} onChange={(e) => setEstado(e.target.value as TradeInCondition)}>
                <option value="">Sin definir</option>
                {(Object.keys(TRADE_IN_CONDITION_LABELS) as TradeInCondition[]).map((c) => (
                  <option key={c} value={c}>
                    {TRADE_IN_CONDITION_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={save} disabled={saving} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
              {saving ? "Guardando…" : "Guardar datos"}
            </button>
            <button
              onClick={appraise}
              disabled={appraising || !marca || !modelo || !anio}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-50"
            >
              {appraising ? "Tasando…" : "Tasar con MatchCars"}
            </button>
            <button
              onClick={() => setShowManualValorVenta((v) => !v)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground"
            >
              {tradeIn.tasacion ? "Corregir valor a mano" : "Cargar valor a mano"}
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

          {showManualValorVenta && (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-background p-2">
              <span className="text-xs text-muted-foreground">Valor de venta estimado</span>
              <ThousandsInput value={manualValorVenta} onChange={setManualValorVenta} className="w-32 rounded-md border border-border bg-card px-2 py-1 text-xs" />
              <button
                onClick={saveManualValorVenta}
                disabled={savingManual || !manualValorVenta}
                className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-accent-foreground disabled:opacity-50"
              >
                {savingManual ? "Guardando…" : "Guardar"}
              </button>
            </div>
          )}

          {tradeIn.fotos.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {tradeIn.fotos.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={url} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
              ))}
            </div>
          )}

          {tradeIn.tasacion && tradeIn.tasacion.avg > 0 && (
            <div className="mt-3 flex flex-col gap-1 rounded-lg bg-background p-3">
              <p className="text-xs text-muted-foreground">
                Valor de venta estimado {tradeIn.tasacion.fuente === "manual" ? "(cargado a mano)" : "(datos MatchCars)"}
              </p>
              <p className="text-lg font-extrabold text-accent">ARS {Math.round(tradeIn.tasacion.avg).toLocaleString("es-AR")}</p>
              {tradeIn.tasacion.fuente === "matchcars" && (
                <p className="text-xs text-muted-foreground">
                  Min {Math.round(tradeIn.tasacion.min).toLocaleString("es-AR")} – Max {Math.round(tradeIn.tasacion.max).toLocaleString("es-AR")}
                </p>
              )}
              {estado && suggested > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Sugerido para tomarlo ({TRADE_IN_CONDITION_LABELS[estado]}, con margen de reventa): <strong className="text-foreground">ARS {suggested.toLocaleString("es-AR")}</strong>
                </p>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Precio final de toma</span>
              <div className="flex flex-wrap gap-1">
                <ThousandsInput value={precioTomaFinal} onChange={setPrecioTomaFinal} className={`${inputClass} w-32`} />
                {suggested > 0 && (
                  <button
                    type="button"
                    onClick={applySuggested}
                    title="Usar el precio sugerido"
                    className="shrink-0 rounded-lg border border-accent/40 bg-accent/5 px-2 py-1 text-xs font-semibold text-accent"
                  >
                    Usar sugerido
                  </button>
                )}
                <button
                  type="button"
                  onClick={confirmPrice}
                  disabled={confirmingPrice || !precioTomaFinal || !tasadoPor}
                  title={!tasadoPor ? "Elegí quién tasó antes de confirmar" : "Confirmar y cerrar la parte de pago"}
                  className="shrink-0 rounded-lg bg-success px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {confirmingPrice ? "Confirmando…" : "✓ Confirmar parte de pago"}
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Tasado por *</span>
              <select value={tasadoPor} onChange={(e) => setTasadoPor(e.target.value)} className={`${inputClass} w-full sm:w-56`}>
                <option value="">Sin definir</option>
                {(agency?.members ?? []).map((m) => (
                  <option key={m.uid} value={m.uid}>
                    {m.name || m.email || m.uid}
                  </option>
                ))}
              </select>
              {!tasadoPor && <span className="text-[11px] text-muted-foreground">Hace falta para poder confirmar</span>}
            </label>
          </div>
        </>
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
