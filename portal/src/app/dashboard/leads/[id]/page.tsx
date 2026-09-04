// portal/src/app/dashboard/leads/[id]/page.tsx
// Detalle de un lead: para los orgánicos (con conversación real en la app),
// muestra el hilo completo y permite responder — la respuesta llega al
// comprador como si la hubiera escrito el vendedor, igual que en la app
// (ver nota de senderId en la API de mensajes). Para los manuales, solo
// datos de contacto/notas (no hay chat que mostrar).
"use client";

import { AssigneeSelect } from "@/components/AssigneeSelect";
import { DeliveryQrCode } from "@/components/DeliveryQrCode";
import { ThousandsInput } from "@/components/ThousandsInput";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencyMe } from "@/hooks/useAgencyMe";
import { parseJsonResponse } from "@/lib/api-client";
import { LEAD_STATUS_LABELS, MANUAL_CONTACT_SOURCE_LABELS, LeadDetail, LeadMessage, LeadStatus } from "@/lib/leads";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: "bg-blue-500/15 text-blue-600",
  contacted: "bg-amber-500/15 text-amber-600",
  negotiation: "bg-cyan-500/15 text-cyan-600",
  won: "bg-success/15 text-success",
  lost: "bg-error/15 text-error",
};

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getIdToken } = useAuth();
  const { data: agency } = useAgencyMe();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [messages, setMessages] = useState<LeadMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState<{ action: "advance" | "lost"; text: string } | null>(null);
  const [editContact, setEditContact] = useState<{ name: string; phone: string; email: string; instagramHandle: string } | null>(
    null
  );
  const [deleteReason, setDeleteReason] = useState<string | null>(null);
  const [counterPrompt, setCounterPrompt] = useState<{ amount: string; currency: "ARS" | "USD"; note: string } | null>(null);
  const [closePrompt, setClosePrompt] = useState<{ price: string; currency: "ARS" | "USD" } | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [startingOp, setStartingOp] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const headers = { Authorization: `Bearer ${token}` };
        const leadRes = await fetch(`/api/agency/leads/${id}`, { headers });
        const leadData = await parseJsonResponse<LeadDetail>(leadRes);
        setLead(leadData);
        if (leadData.conversationId) {
          const msgRes = await fetch(`/api/agency/leads/${id}/messages`, { headers });
          const msgData = await parseJsonResponse<{ messages: LeadMessage[] }>(msgRes);
          setMessages(msgData.messages);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [id, getIdToken, reloadKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  const runAction = async (action: "advance" | "lost", text?: string) => {
    setBusy(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action,
          ...(action === "lost" && text ? { reason: text } : {}),
          ...(action === "advance" && text ? { note: text } : {}),
        }),
      });
      await parseJsonResponse(res);
      setPrompt(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  };

  const runOfferAction = async (action: "accept" | "reject" | "counter" | "withdraw", extra?: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/leads/${id}/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, ...extra }),
      });
      await parseJsonResponse(res);
      setCounterPrompt(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  };

  const markWon = async (dealPrice: number, dealCurrency: "ARS" | "USD") => {
    // Mismo criterio que confirmar el precio de toma del usado (Operación):
    // antes esto se guardaba con un solo click sin ninguna pausa, y no había
    // forma de distinguir a simple vista "cargué un número" de "esto es lo
    // que de verdad se acordó con el comprador".
    if (!confirm(`¿Confirmar el cierre en ${dealCurrency} ${dealPrice.toLocaleString("es-AR")}? Este precio queda guardado como el acordado con el comprador.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "mark_won", dealPrice, dealCurrency }),
      });
      await parseJsonResponse(res);
      setClosePrompt(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  };

  const markVehicleSold = async () => {
    // La comisión se calcula en este momento según quién esté asignado
    // (ver mark_vehicle_sold en la API) — si nadie lo asignó todavía, avisar
    // antes de seguir en vez de dejar una venta sin comisión sin que se note.
    if (!lead?.assignedTo && agency && agency.members.length > 1) {
      const proceed = confirm(
        "No hay un vendedor asignado a este lead — no se va a calcular comisión para esta venta. ¿Confirmar igual?"
      );
      if (!proceed) return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "mark_vehicle_sold" }),
      });
      await parseJsonResponse(res);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  };

  const recalculateCommission = async () => {
    setBusy(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "recalculate_commission" }),
      });
      await parseJsonResponse(res);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  };

  const saveContact = async () => {
    if (!editContact || !editContact.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "edit_contact", ...editContact }),
      });
      await parseJsonResponse(res);
      setEditContact(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  };

  const deleteLead = async () => {
    if (!deleteReason || !deleteReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/leads/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: deleteReason.trim() }),
      });
      await parseJsonResponse(res);
      router.push("/dashboard/leads");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      setBusy(false);
    }
  };

  const sendReply = async () => {
    const text = reply.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/leads/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text }),
      });
      await parseJsonResponse(res);
      setReply("");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSending(false);
    }
  };

  const startOperation = async () => {
    setStartingOp(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/leads/${id}/operation`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await parseJsonResponse<{ id: string }>(res);
      router.push(`/dashboard/operaciones/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      setStartingOp(false);
    }
  };

  if (agency && !agency.hasCRM) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
        <p className="font-semibold">Función exclusiva de planes pagos</p>
        <p className="mt-2 text-sm text-muted-foreground">El CRM de Leads está disponible desde el plan Pro Plus.</p>
      </div>
    );
  }
  if (error && !lead) return <p className="text-sm text-error">No pudimos abrir este lead: {error}</p>;
  if (!lead) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const veh = lead.vehicleSnapshot;
  const buyer = lead.buyerSnapshot;
  const manual = lead.manualContact;
  const title = veh?.brand || veh?.model ? `${veh?.brand ?? ""} ${veh?.model ?? ""} ${veh?.year ?? ""}`.trim() : "Consulta general";
  const buyerName = manual?.name || (buyer?.firstName || buyer?.lastName ? `${buyer?.firstName ?? ""} ${buyer?.lastName ?? ""}`.trim() : "Comprador");
  const isWeb = lead.source === "web";
  const canAct = !lead.deletedAt && lead.status !== "won" && lead.status !== "lost";
  const isOrganic = !!lead.conversationId;
  const canDelete = !lead.deletedAt && !!manual && !lead.saleOperationId;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link href="/dashboard/leads" className="text-xs font-semibold text-accent">
        ← Volver a Leads
      </Link>

      <div
        className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-4 ${
          isWeb ? "border-blue-500/30 bg-blue-500/5" : manual ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-card"
        }`}
      >
        <div>
          <p className="text-base font-bold">{title}</p>
          <p className="text-sm text-muted-foreground">
            {buyerName}
            {isWeb ? (
              <span className="ml-1.5 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">🌐 Consulta web</span>
            ) : isOrganic ? (
              <span className="ml-1.5 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">App</span>
            ) : (
              <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">Manual</span>
            )}
            {!isWeb && manual?.contactSource && MANUAL_CONTACT_SOURCE_LABELS[manual.contactSource] && (
              <span className="ml-1.5 rounded-full bg-muted/20 px-1.5 py-0.5 text-[10px] font-semibold">
                {MANUAL_CONTACT_SOURCE_LABELS[manual.contactSource]}
              </span>
            )}
            {manual && !lead.deletedAt && (
              <button
                onClick={() =>
                  setEditContact({
                    name: manual.name ?? "",
                    phone: manual.phone ?? "",
                    email: manual.email ?? "",
                    instagramHandle: manual.instagramHandle ?? "",
                  })
                }
                className="ml-1.5 text-[10px] font-semibold text-accent"
              >
                Editar
              </button>
            )}
            {canDelete && (
              <button onClick={() => setDeleteReason("")} className="ml-1.5 text-[10px] font-semibold text-error">
                Eliminar
              </button>
            )}
          </p>
          {manual && (manual.phone || manual.email || manual.instagramHandle) && (
            <p className="text-xs text-muted-foreground">
              {[manual.phone, manual.email, manual.instagramHandle].filter(Boolean).join(" · ")}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {manual?.phone && (
              <a
                href={`https://wa.me/${manual.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                  `Hola ${manual.name}, te escribo por tu consulta${veh?.brand ? ` sobre el ${veh.brand} ${veh.model}` : ""}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success"
              >
                💬 Contactar por WhatsApp
              </a>
            )}
            {manual?.instagramHandle && (
              <a
                href={`https://ig.me/m/${manual.instagramHandle.replace(/^@/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/10 px-3 py-1.5 text-xs font-semibold text-fuchsia-600"
              >
                📷 Contactar por Instagram
              </a>
            )}
          </div>
          {manual?.notes && <p className="mt-1 text-xs italic text-muted-foreground">{manual.notes}</p>}
          {lead.activity && lead.activity.length > 0 && (
            <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
              {lead.activity.map((ev) => (
                <p key={ev.id} className="text-[11px] text-muted-foreground">
                  <span className="font-semibold">{ev.actorName}</span> · {ev.summary} · {fmtDateTime(ev.createdAt)}
                </p>
              ))}
            </div>
          )}
          {veh?.price && !(lead.status === "won" && lead.dealPrice) && (
            <p className="mt-1 text-sm font-semibold text-accent">
              {veh.currency} {Number(veh.price).toLocaleString("es-AR")}
            </p>
          )}
          {lead.status === "won" && lead.dealPrice && (
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-bold text-success">
              ✓ Cerrado en {lead.dealCurrency} {Number(lead.dealPrice).toLocaleString("es-AR")}
            </span>
          )}
          {lead.status === "lost" && lead.reasonLost && (
            <p className="mt-1 text-xs text-error">Motivo: {lead.reasonLost}</p>
          )}
          {lead.deletedAt && (
            <p className="mt-1 text-xs font-semibold text-error">
              Eliminado{lead.deletedReason ? `: ${lead.deletedReason}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[lead.status]}`}>
            {LEAD_STATUS_LABELS[lead.status]}
          </span>
          {agency && agency.members.length > 1 && (
            <AssigneeSelect
              leadId={lead.id}
              assignedTo={lead.assignedTo}
              members={agency.members}
              locked={lead.status === "won" || lead.status === "lost"}
              onAssigned={(uid) => setLead((prev) => (prev ? { ...prev, assignedTo: uid } : prev))}
            />
          )}
          {canAct && (
            <div className="flex gap-2">
              {lead.status !== "negotiation" && (
                <button
                  disabled={busy}
                  onClick={() => (isOrganic ? runAction("advance") : setPrompt({ action: "advance", text: "" }))}
                  className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                >
                  Avanzar
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => setPrompt({ action: "lost", text: "" })}
                className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-error disabled:opacity-50"
              >
                Perdido
              </button>
            </div>
          )}
        </div>
      </div>

      {(lead.status === "negotiation" || lead.status === "won") &&
        (lead.saleOperationId ? (
          <Link
            href={`/dashboard/operaciones/${lead.saleOperationId}`}
            className="flex items-center justify-between rounded-2xl border border-accent/30 bg-accent/5 p-4 transition hover:border-accent"
          >
            <div>
              <p className="text-sm font-semibold text-accent">📋 Operación de venta en curso</p>
              <p className="text-xs text-muted-foreground">Checklist de trámites, financiación y parte de pago.</p>
            </div>
            <span className="text-xs font-semibold text-accent">Ver →</span>
          </Link>
        ) : (
          <button
            onClick={startOperation}
            disabled={startingOp}
            className="flex items-center justify-between rounded-2xl border border-dashed border-border bg-card p-4 text-left transition hover:border-accent disabled:opacity-50"
          >
            <div>
              <p className="text-sm font-semibold">📋 Iniciar operación de venta</p>
              <p className="text-xs text-muted-foreground">Checklist de trámites, financiación rápida y parte de pago.</p>
            </div>
            <span className="text-xs font-semibold text-accent">{startingOp ? "Creando…" : "Iniciar →"}</span>
          </button>
        ))}

      {deleteReason !== null && (
        <div className="flex flex-col gap-2 rounded-2xl border border-error/40 bg-error/5 p-4">
          <p className="text-sm font-semibold text-error">Eliminar lead</p>
          <p className="text-xs text-muted-foreground">
            Esta acción no se puede deshacer — el lead deja de aparecer en la lista y en las estadísticas.
          </p>
          <textarea
            autoFocus
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            placeholder="Ej: lo cargué dos veces, era para otro auto, dato equivocado…"
            className="min-h-16 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-error"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteReason(null)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              disabled={busy || !deleteReason.trim()}
              onClick={deleteLead}
              className="rounded-lg bg-error px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Eliminar definitivamente
            </button>
          </div>
        </div>
      )}

      {editContact && (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Editar contacto</p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Nombre *</span>
            <input
              autoFocus
              value={editContact.name}
              onChange={(e) => setEditContact({ ...editContact, name: e.target.value })}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Teléfono</span>
            <input
              value={editContact.phone}
              onChange={(e) => setEditContact({ ...editContact, phone: e.target.value })}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Email</span>
            <input
              type="email"
              value={editContact.email}
              onChange={(e) => setEditContact({ ...editContact, email: e.target.value })}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Usuario de Instagram</span>
            <input
              value={editContact.instagramHandle}
              onChange={(e) => setEditContact({ ...editContact, instagramHandle: e.target.value })}
              placeholder="@usuario"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditContact(null)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              disabled={busy || !editContact.name.trim()}
              onClick={saveContact}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </div>
      )}

      {prompt && (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">
            {prompt.action === "lost" ? "Motivo de la pérdida *" : "¿Qué pasó? *"}
          </p>
          <textarea
            autoFocus
            value={prompt.text}
            onChange={(e) => setPrompt({ ...prompt, text: e.target.value })}
            placeholder={
              prompt.action === "lost"
                ? "Ej: eligió otro auto, se le complicó el crédito, dejó de responder…"
                : "Ej: llamó y pidió que lo llamemos la semana que viene…"
            }
            className="min-h-20 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPrompt(null)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              disabled={busy || !prompt.text.trim()}
              onClick={() => runAction(prompt.action, prompt.text.trim())}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
            >
              {prompt.action === "lost" ? "Confirmar pérdida" : "Confirmar avance"}
            </button>
          </div>
        </div>
      )}

      {lead.offer && (lead.offer.status === "pending" || lead.offer.status === "countered") && (
        <div className="flex flex-col gap-3 rounded-2xl border border-accent/30 bg-accent/5 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Oferta del comprador</p>
            <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
              {lead.offer.status === "pending" ? "Pendiente" : "Contraofertada"}
            </span>
          </div>
          <p className="text-xl font-extrabold text-accent">
            {lead.offer.currency} {Number(lead.offer.amount).toLocaleString("es-AR")}
          </p>
          {(lead.offer.includesTradeIn || lead.offer.includesFinancing) && (
            <div className="flex flex-wrap gap-2">
              {lead.offer.includesTradeIn && <span className="rounded-full bg-background px-2.5 py-1 text-xs">Con permuta</span>}
              {lead.offer.includesFinancing && (
                <span className="rounded-full bg-background px-2.5 py-1 text-xs">
                  Con financiación{lead.offer.financingNote ? `: ${lead.offer.financingNote}` : ""}
                </span>
              )}
            </div>
          )}
          {lead.offer.note && <p className="text-sm italic text-muted-foreground">&quot;{lead.offer.note}&quot;</p>}

          {lead.offer.status === "countered" ? (
            <div className="rounded-lg bg-background p-3 text-sm">
              <p className="font-semibold">
                Tu contraoferta: {lead.offer.counterCurrency} {Number(lead.offer.counterAmount).toLocaleString("es-AR")}
              </p>
              {lead.offer.counterNote && <p className="mt-1 text-xs text-muted-foreground">{lead.offer.counterNote}</p>}
              <p className="mt-2 text-xs text-muted-foreground">Esperando respuesta del comprador…</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy}
                onClick={() => runOfferAction("accept")}
                className="rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Aceptar
              </button>
              <button
                disabled={busy}
                onClick={() => setCounterPrompt({ amount: "", currency: (lead.offer!.currency as "ARS" | "USD") || "ARS", note: "" })}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                Contraofertar
              </button>
              <button
                disabled={busy}
                onClick={() => runOfferAction("reject")}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-error disabled:opacity-50"
              >
                Rechazar
              </button>
            </div>
          )}
        </div>
      )}

      {counterPrompt && (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Contraoferta</p>
          <div className="flex gap-2">
            <ThousandsInput
              autoFocus
              value={counterPrompt.amount}
              onChange={(v) => setCounterPrompt({ ...counterPrompt, amount: v })}
              placeholder="Monto"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <select
              value={counterPrompt.currency}
              onChange={(e) => setCounterPrompt({ ...counterPrompt, currency: e.target.value as "ARS" | "USD" })}
              className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
            >
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <textarea
            value={counterPrompt.note}
            onChange={(e) => setCounterPrompt({ ...counterPrompt, note: e.target.value })}
            placeholder="Nota (opcional)"
            className="min-h-16 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setCounterPrompt(null)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              disabled={busy || !counterPrompt.amount}
              onClick={() =>
                runOfferAction("counter", {
                  counterAmount: Number(counterPrompt.amount),
                  counterCurrency: counterPrompt.currency,
                  counterNote: counterPrompt.note.trim() || undefined,
                })
              }
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
            >
              Enviar contraoferta
            </button>
          </div>
        </div>
      )}

      {(lead.status === "contacted" || lead.status === "negotiation") &&
        !(lead.offer && (lead.offer.status === "pending" || lead.offer.status === "countered")) &&
        (closePrompt ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold">Cerrar acuerdo de precio</p>
            <p className="text-xs text-muted-foreground">
              Esto todavía no es la venta confirmada — solo deja el precio acordado. La venta se confirma después, al
              marcar el auto como vendido/entregado.
            </p>
            {agency && agency.members.length > 1 && (
              <div className="flex items-center justify-between rounded-lg bg-background p-2">
                <span className="text-xs font-semibold text-muted-foreground">Vendedor asignado</span>
                <AssigneeSelect
                  leadId={lead.id}
                  assignedTo={lead.assignedTo}
                  members={agency.members}
                  onAssigned={(uid) => setLead((prev) => (prev ? { ...prev, assignedTo: uid } : prev))}
                />
              </div>
            )}
            <div className="flex gap-2">
              <ThousandsInput
                autoFocus
                value={closePrompt.price}
                onChange={(v) => setClosePrompt({ ...closePrompt, price: v })}
                placeholder="Precio de cierre"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <select
                value={closePrompt.currency}
                onChange={(e) => setClosePrompt({ ...closePrompt, currency: e.target.value as "ARS" | "USD" })}
                className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setClosePrompt(null)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground"
              >
                Cancelar
              </button>
              <button
                disabled={busy || !closePrompt.price}
                onClick={() => markWon(Number(closePrompt.price), closePrompt.currency)}
                className="rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Cerrar con este precio
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() =>
              // Precarga el precio publicado hoy (veh.price, ya en vivo) en
              // vez de arrancar en blanco — sigue siendo editable si el
              // precio realmente acordado con el comprador es otro.
              setClosePrompt({ price: veh?.price ? String(veh.price) : "", currency: (veh?.currency as "ARS" | "USD") || "ARS" })
            }
            className="self-start rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs font-semibold text-success"
          >
            💰 Cerrar acuerdo de precio
          </button>
        ))}

      {lead.status === "won" && lead.vehicleId && lead.vehicleStatus === "reserved" && (
        <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
          <p className="text-sm font-semibold text-accent">Esperando confirmación del comprador</p>
          <p className="text-xs text-muted-foreground">
            {lead.buyerId
              ? "Le avisamos que marcaste esta venta como entregada. Cuando confirme desde la app (o pase el plazo de 3 días sin respuesta), el auto pasa a Vendido o vuelve a estar disponible automáticamente."
              : "Este auto está reservado."}
          </p>
          {lead.buyerId && lead.deliveryConfirmToken && (
            <DeliveryQrCode vehicleId={lead.vehicleId} token={lead.deliveryConfirmToken} />
          )}
        </div>
      )}

      {lead.status === "won" && lead.vehicleId && lead.vehicleStatus === "sold" && lead.assignedTo && lead.saleHasCommission === false && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-error/30 bg-error/10 p-4">
          <div>
            <p className="text-sm font-semibold text-error">Esta venta no tiene comisión calculada</p>
            <p className="text-xs text-muted-foreground">
              Puede pasar si el vendedor se reasignó después de cerrar la venta. Recalculala con el vendedor asignado
              actual.
            </p>
          </div>
          <button
            disabled={busy}
            onClick={recalculateCommission}
            className="rounded-lg bg-error px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            Recalcular comisión
          </button>
        </div>
      )}

      {lead.status === "won" && lead.vehicleId && lead.vehicleStatus !== "sold" && lead.vehicleStatus !== "reserved" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-success/30 bg-success/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-success">Este paso confirma la venta</p>
              <p className="text-xs text-muted-foreground">
                {lead.buyerId
                  ? "Marcá el auto como entregado — le vamos a pedir al comprador que confirme la recepción. Acá se calcula la comisión según el vendedor asignado."
                  : "Marcá el auto como vendido en el stock para que salga de publicados. Acá se calcula la comisión según el vendedor asignado."}
              </p>
            </div>
            <div className="flex gap-2">
              {lead.offer?.status === "accepted" && (
                <button
                  disabled={busy}
                  onClick={() => runOfferAction("withdraw")}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-error disabled:opacity-50"
                >
                  Cancelar acuerdo
                </button>
              )}
              <button
                disabled={busy}
                onClick={markVehicleSold}
                className="rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {lead.buyerId ? "Marcar auto como entregado" : "Marcar auto como vendido"}
              </button>
            </div>
          </div>
          {agency && agency.members.length > 1 && (
            <div className="flex items-center justify-between rounded-lg bg-background p-2">
              <span className="text-xs font-semibold text-muted-foreground">Vendedor asignado</span>
              <AssigneeSelect
                leadId={lead.id}
                assignedTo={lead.assignedTo}
                members={agency.members}
                locked={lead.status === "won" || lead.status === "lost"}
                onAssigned={(uid) => setLead((prev) => (prev ? { ...prev, assignedTo: uid } : prev))}
              />
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-error">{error}</p>}

      {isOrganic ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Conversación</p>
          <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
            {!messages && <p className="text-sm text-muted-foreground">Cargando mensajes…</p>}
            {messages?.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay mensajes.</p>}
            {messages?.map((m) => (
              <div key={m.id} className={`flex ${m.isAgency ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    m.isAgency ? "bg-accent text-accent-foreground" : "bg-background text-foreground"
                  }`}
                >
                  <p>{m.text}</p>
                  <p className={`mt-0.5 text-[10px] ${m.isAgency ? "text-accent-foreground/70" : "text-muted-foreground"}`}>
                    {fmtDateTime(m.createdAt)}
                  </p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div className="flex gap-2">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendReply();
                }
              }}
              placeholder="Escribí una respuesta…"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              onClick={sendReply}
              disabled={sending || !reply.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
            >
              {sending ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Este lead se cargó a mano — no tiene una conversación en la app para mostrar acá.
        </p>
      )}
    </div>
  );
}
