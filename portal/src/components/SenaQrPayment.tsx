// portal/src/components/SenaQrPayment.tsx
// Cobro de seña por QR de Mercado Pago, dentro del paso "Seña / Reserva" del
// checklist de una operación. El cobro lo crea functions/src/senaPayments.ts
// (createSenaPayment) con la cuenta de MP de la agencia; esta pantalla solo
// escucha senaPayments/{id} en vivo — cuando el webhook de MP lo marca
// "approved", el panel pasa solo a "Seña recibida" (y el backend ya tildó el
// paso del checklist y sacó el auto de la web).
"use client";

import { ThousandsInput } from "@/components/ThousandsInput";
import { app, db } from "@/lib/firebase-client";
import { collection, doc, onSnapshot, query, Timestamp, where } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";

export interface SenaPayment {
  id: string;
  saleOperationId: string;
  operationNumber: number;
  amount: number;
  status: "pending" | "approved" | "cancelled" | "refunded";
  checkoutUrl: string;
  title: string;
  mpPaymentId: string | null;
  mpStatus: string | null;
  createdAt: Timestamp | null;
  expiresAt: Timestamp | null;
  paidAt: Timestamp | null;
}

const QUICK_AMOUNTS = [300000, 500000, 1000000];
const fmt = (n: number) => `$ ${n.toLocaleString("es-AR")}`;

function useCountdown(expiresAt: Timestamp | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  const left = expiresAt ? Math.max(0, Math.floor((expiresAt.toMillis() - now) / 1000)) : 0;
  return { left, label: `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}` };
}

export function SenaQrPayment({
  saleOperationId,
  agencyId,
  vehicleLabel,
  buyerLabel,
  operationNumber,
  onChanged,
}: {
  saleOperationId: string;
  agencyId: string;
  vehicleLabel: string;
  buyerLabel: string;
  operationNumber: number | null;
  onChanged: () => void;
}) {
  const [payments, setPayments] = useState<SenaPayment[]>([]);
  const [mpConnected, setMpConnected] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "senaPayments"),
      where("sellerUid", "==", agencyId),
      where("saleOperationId", "==", saleOperationId)
    );
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SenaPayment, "id">) }));
      list.sort((a, b) => (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now()));
      setPayments(list);
    });
  }, [agencyId, saleOperationId]);

  useEffect(() => {
    return onSnapshot(doc(db, "sellerPaymentAccounts", agencyId), (snap) =>
      setMpConnected(snap.exists() && snap.data().status === "connected")
    );
  }, [agencyId]);

  const approved = payments.find((p) => p.status === "approved") ?? null;
  const active = useMemo(() => payments.find((p) => p.id === activeId) ?? null, [payments, activeId]);
  const { left, label: countdown } = useCountdown(active?.status === "pending" ? active.expiresAt : null);
  const expired = active?.status === "pending" && !!active.expiresAt && left === 0;

  // Cuando el webhook aprueba el pago, el checklist del padre tiene que
  // refrescarse para mostrar el paso tildado.
  const approvedId = approved?.id;
  useEffect(() => {
    if (approvedId) onChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedId]);

  const checkoutUrl = active?.checkoutUrl;
  useEffect(() => {
    if (!checkoutUrl) return;
    let cancelled = false;
    QRCode.toDataURL(checkoutUrl, { margin: 1, width: 440, color: { dark: "#0E1117", light: "#FFFFFF" } }).then((d) => {
      if (!cancelled) setQr(d);
    });
    return () => {
      cancelled = true;
    };
  }, [checkoutUrl]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const fn = httpsCallable<{ saleOperationId: string; amount: number }, { paymentId: string }>(getFunctions(app), "createSenaPayment");
      const { data } = await fn({ saleOperationId, amount: Number(amount) });
      setQr(null);
      setActiveId(data.paymentId);
      onChanged(); // por si se le asignó el número de operación recién ahora
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el cobro.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!active) return;
    setBusy(true);
    try {
      await httpsCallable(getFunctions(app), "cancelSenaPayment")({ paymentId: active.id });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cancelar.");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setOpen(false);
    setActiveId(null);
    setQr(null);
    setError(null);
    setCopied(false);
  };

  const copyLink = async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(active.checkoutUrl);
      setCopied(true);
    } catch {
      setError("No se pudo copiar. Mantené apretado el link para copiarlo.");
    }
  };

  const opLabel = active?.operationNumber ?? operationNumber;
  const waText = active
    ? `Hola ${buyerLabel}, te paso el link para pagar la seña de ${fmt(active.amount)} del ${vehicleLabel} (operación OP-${active.operationNumber}): ${active.checkoutUrl}`
    : "";

  return (
    <>
      {approved ? (
        <span className="rounded-md bg-success/10 px-2 py-1 text-xs font-semibold text-green-700">
          ✓ {fmt(approved.amount)} cobrada por Mercado Pago{approved.mpPaymentId ? ` · pago n.º ${approved.mpPaymentId}` : ""}
        </span>
      ) : (
        <button
          onClick={() => {
            setOpen(true);
            // Si ya había un QR abierto y sin vencer, se retoma en vez de pedir monto de nuevo.
            const pending = payments.find((p) => p.status === "pending" && (p.expiresAt?.toMillis() ?? 0) > Date.now());
            if (pending) setActiveId(pending.id);
          }}
          className="rounded-md bg-[#009ee3] px-2 py-1 text-xs font-semibold text-white"
        >
          💳 Cobrar seña con QR
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full w-full max-w-md flex-col gap-4 overflow-auto rounded-2xl bg-card p-6 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold">
                  {active?.status === "approved" ? "Seña recibida" : active ? "Mostrale este QR al comprador" : "Cobrar seña"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {opLabel ? <span className="font-mono">OP-{opLabel} · </span> : null}
                  {vehicleLabel} · {buyerLabel}
                </p>
              </div>
              <button onClick={close} aria-label="Cerrar" className="text-xl leading-none text-muted-foreground">
                ×
              </button>
            </div>

            {error && <p className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">{error}</p>}

            {!active ? (
              mpConnected === false ? (
                <div className="flex flex-col gap-3 text-sm">
                  <p>Para cobrar señas primero hay que conectar la cuenta de Mercado Pago de la agencia.</p>
                  <Link href="/dashboard/cobros" className="self-start rounded-lg bg-[#009ee3] px-4 py-2 font-semibold text-white">
                    Ir a Cobros
                  </Link>
                </div>
              ) : (
                // ── Paso 1: monto ──
                <>
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Monto de la seña (pesos)
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                      <span className="font-mono text-lg">$</span>
                      <ThousandsInput
                        autoFocus
                        value={amount}
                        onChange={setAmount}
                        placeholder="500.000"
                        className="w-full bg-transparent py-2 font-mono text-2xl text-foreground outline-none"
                      />
                    </div>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_AMOUNTS.map((v) => (
                      <button
                        key={v}
                        onClick={() => setAmount(String(v))}
                        className="rounded-full border border-border px-3 py-1 font-mono text-xs"
                      >
                        {fmt(v)}
                      </button>
                    ))}
                  </div>
                  <p className="rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">
                    La plata entra directo a la cuenta de Mercado Pago de la agencia. MatchCars no la recibe. En Mercado Pago
                    va a figurar como <b>&quot;Seña {opLabel ? `OP-${opLabel}` : "de la operación"} · {vehicleLabel}&quot;</b>.
                  </p>
                  <button
                    onClick={generate}
                    disabled={busy || !amount || Number(amount) < 1000 || mpConnected === null}
                    className="rounded-lg bg-[#009ee3] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? "Generando…" : "Generar QR"}
                  </button>
                </>
              )
            ) : active.status === "approved" ? (
              // ── Paso 3: recibida ──
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-3xl text-green-700">✓</div>
                <p className="text-center font-mono text-2xl">{fmt(active.amount)}</p>
                <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">Operación</dt>
                  <dd className="font-mono">
                    OP-{active.operationNumber}
                    {active.mpPaymentId ? ` · pago MP n.º ${active.mpPaymentId}` : ""}
                  </dd>
                  <dt className="text-muted-foreground">Auto</dt>
                  <dd>Se ocultó de la web</dd>
                  <dt className="text-muted-foreground">Checklist</dt>
                  <dd>&quot;Seña / Reserva&quot; quedó hecha</dd>
                  <dt className="text-muted-foreground">Avisos</dt>
                  <dd>Mail al comprador y a la agencia</dd>
                </dl>
                <button onClick={close} className="rounded-lg bg-[#009ee3] px-4 py-2.5 text-sm font-semibold text-white">
                  Listo
                </button>
              </>
            ) : active.status !== "pending" || expired ? (
              // ── Vencido / cancelado ──
              <>
                <p className="text-sm">
                  {expired ? "Este QR venció sin que se pagara." : "Este cobro se canceló."} Podés generar uno nuevo.
                </p>
                <button
                  onClick={() => {
                    setActiveId(null);
                    setQr(null);
                  }}
                  className="rounded-lg bg-[#009ee3] px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Generar otro QR
                </button>
              </>
            ) : (
              // ── Paso 2: QR esperando pago ──
              <>
                <p className="text-center font-mono text-2xl">{fmt(active.amount)}</p>
                <div className="self-center rounded-xl border border-border bg-white p-3">
                  {qr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qr} alt="QR de pago de Mercado Pago" width={220} height={220} />
                  ) : (
                    <div className="h-[220px] w-[220px] animate-pulse rounded bg-gray-100" />
                  )}
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Lo escanea con la cámara del celular y paga con Mercado Pago o tarjeta.
                </p>
                <p className="flex items-center justify-center gap-2 text-xs font-semibold text-amber-700">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
                  {active.mpStatus === "in_process" || active.mpStatus === "pending"
                    ? "Pago en revisión de Mercado Pago…"
                    : active.mpStatus === "rejected"
                      ? "El último intento fue rechazado — puede probar con otro medio"
                      : "Esperando el pago"}
                  {" · vence en "}
                  <span className="font-mono tabular-nums">{countdown}</span>
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button onClick={copyLink} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">
                    {copied ? "✓ Link copiado" : "Copiar link"}
                  </button>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
                  >
                    Enviar por WhatsApp
                  </a>
                </div>
                <button onClick={cancel} disabled={busy} className="self-center text-xs text-muted-foreground hover:text-error">
                  Cancelar cobro
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
