// portal/src/app/dashboard/cobros/page.tsx
// Cobro de seña por QR — conexión de la cuenta de Mercado Pago de la agencia.
// El OAuth lo maneja functions/src/mercadoPago.ts (mpOAuthStart → MP →
// mpOAuthCallback, que vuelve acá con ?mp=connected|cancelled|error). Esta
// pantalla solo lee sellerPaymentAccounts/{agencyId} (sin tokens, ver
// firestore.rules). Solo el dueño puede conectar/desconectar.
"use client";

import { SenaPaymentsHistory } from "@/components/SenaPaymentsHistory";
import { useAgencyMe } from "@/hooks/useAgencyMe";
import { app, db } from "@/lib/firebase-client";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

interface SellerPaymentAccount {
  status: "connected" | "needs_reconnect";
  mpUserId: string;
  nickname: string | null;
  holderName: string | null;
  identificationType: string | null;
  identificationMasked: string | null;
  hasIdentification: boolean;
  connectedBy: string;
  connectedAt: Timestamp | null;
}

const RETURN_MESSAGES: Record<string, { text: string; tone: "ok" | "warn" }> = {
  connected: { text: "Listo, tu cuenta de Mercado Pago quedó conectada.", tone: "ok" },
  cancelled: { text: "Cancelaste la conexión en Mercado Pago. Podés volver a intentarlo cuando quieras.", tone: "warn" },
  account_in_use: {
    text: "Esa cuenta de Mercado Pago ya está conectada a otro usuario de MatchCars. Usá otra cuenta o escribinos a soporte.",
    tone: "warn",
  },
  not_argentina: { text: "La cuenta de Mercado Pago tiene que ser de Argentina.", tone: "warn" },
  exchange_failed: { text: "No pudimos terminar la conexión con Mercado Pago. Probá de nuevo en unos minutos.", tone: "warn" },
};

function MpLogo() {
  return (
    <div
      aria-hidden
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#e6f6fd] text-[15px] font-bold text-[#009ee3]"
    >
      MP
    </div>
  );
}

function StatusPill({ tone, children }: { tone: "off" | "ok" | "warn"; children: React.ReactNode }) {
  const cls = {
    off: "bg-muted/20 text-muted-foreground",
    ok: "bg-success/10 text-green-700",
    warn: "bg-amber-50 text-amber-700",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

const mpButtonClass =
  "rounded-lg bg-[#009ee3] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#008ac7] disabled:opacity-60";

// useSearchParams() exige un límite de Suspense en el App Router (mismo
// patrón que entre-agencias/page.tsx).
export default function CobrosPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
      <Cobros />
    </Suspense>
  );
}

function returnMessage(params: URLSearchParams): { text: string; tone: "ok" | "warn" } | null {
  const mp = params.get("mp");
  if (!mp) return null;
  const key = mp === "error" ? params.get("reason") || "exchange_failed" : mp;
  return RETURN_MESSAGES[key] ?? RETURN_MESSAGES.exchange_failed;
}

function Cobros() {
  const searchParams = useSearchParams();
  const { data: agency, loading: agencyLoading } = useAgencyMe();
  const [account, setAccount] = useState<SellerPaymentAccount | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  // Arranca con el mensaje de vuelta desde Mercado Pago (?mp=...&reason=...), si lo hay.
  const [message, setMessage] = useState(() => returnMessage(new URLSearchParams(searchParams.toString())));

  const agencyId = agency?.agencyId;
  const isOwner = agency?.myRole === "owner";

  // Limpiar ?mp= de la URL para que el mensaje no reaparezca al recargar.
  useEffect(() => {
    if (window.location.search.includes("mp=")) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (!agencyId) return;
    return onSnapshot(
      doc(db, "sellerPaymentAccounts", agencyId),
      (snap) => {
        setAccount(snap.exists() ? (snap.data() as SellerPaymentAccount) : null);
        setAccountLoading(false);
      },
      (err) => {
        console.error("sellerPaymentAccounts", err);
        setAccountLoading(false);
      }
    );
  }, [agencyId]);

  const connect = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const start = httpsCallable<{ returnTo: string }, { url: string }>(getFunctions(app), "mpOAuthStart");
      const { data } = await start({ returnTo: "portal" });
      window.location.href = data.url;
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "No se pudo iniciar la conexión.", tone: "warn" });
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await httpsCallable(getFunctions(app), "mpDisconnect")({});
      setConfirmDisconnect(false);
      setMessage({ text: "Mercado Pago desconectado.", tone: "ok" });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "No se pudo desconectar.", tone: "warn" });
    } finally {
      setBusy(false);
    }
  };

  const loading = agencyLoading || (!!agencyId && accountLoading);
  const connectedByName = account
    ? agency?.members.find((m) => m.uid === account.connectedBy)?.name ||
      agency?.members.find((m) => m.uid === account.connectedBy)?.email ||
      null
    : null;
  const connectedAt = account?.connectedAt?.toDate().toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Cobros</h1>
        <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
          Cobrá la seña de un auto con un QR de Mercado Pago. El comprador paga desde su celular y la plata entra directo
          a tu cuenta.
        </p>
      </div>

      {message && (
        <div
          role="status"
          className={`rounded-lg px-4 py-3 text-sm ${
            message.tone === "ok" ? "bg-success/10 text-green-800" : "bg-amber-50 text-amber-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        {loading ? (
          <div className="h-24 animate-pulse rounded-lg bg-background" />
        ) : !account ? (
          // ── Sin conectar ──
          <>
            <div className="flex flex-wrap items-start gap-3.5">
              <MpLogo />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Cuenta de Mercado Pago</p>
                <p className="text-sm text-muted-foreground">
                  {isOwner
                    ? "Conectala una sola vez. MatchCars no recibe ni retiene tu dinero."
                    : "Todavía no está conectada. Solo el dueño de la agencia puede conectar la cuenta donde entra la plata."}
                </p>
              </div>
              <StatusPill tone="off">Sin conectar</StatusPill>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Conectá tu cuenta", "Te llevamos a Mercado Pago para que autorices a MatchCars."],
                ["Generá el QR", "Desde una operación, elegí \"Cobrar seña\" y poné el monto."],
                ["Listo", "Cuando el comprador paga, el auto pasa a Reservado solo."],
              ].map(([title, text], i) => (
                <div key={title} className="border-t-2 border-border pt-2.5">
                  <span className="font-mono text-xs font-medium text-accent">{i + 1}</span>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
            {isOwner && (
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={connect} disabled={busy} className={mpButtonClass}>
                  {busy ? "Abriendo Mercado Pago…" : "Conectar Mercado Pago"}
                </button>
                <span className="text-sm text-muted-foreground">Tarda menos de un minuto.</span>
              </div>
            )}
          </>
        ) : account.status === "needs_reconnect" ? (
          // ── Hay que reconectar ──
          <>
            <div className="flex flex-wrap items-start gap-3.5">
              <MpLogo />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Cuenta de Mercado Pago</p>
                <p className="text-sm text-muted-foreground">
                  {[account.holderName, account.nickname].filter(Boolean).join(" · ")}
                </p>
              </div>
              <StatusPill tone="warn">Hay que reconectar</StatusPill>
            </div>
            <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              Mercado Pago dejó de autorizar a MatchCars (puede pasar si quitaste el acceso desde tu cuenta). Mientras
              tanto no podés cobrar señas.
            </p>
            {isOwner ? (
              <div>
                <button onClick={connect} disabled={busy} className={mpButtonClass}>
                  {busy ? "Abriendo Mercado Pago…" : "Volver a conectar"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Avisale al dueño de la agencia para que la vuelva a conectar.</p>
            )}
          </>
        ) : (
          // ── Conectada ──
          <>
            <div className="flex flex-wrap items-start gap-3.5">
              <MpLogo />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Cuenta de Mercado Pago</p>
                <p className="text-sm text-muted-foreground">
                  {isOwner ? "Las señas se acreditan en esta cuenta." : "Ya podés cobrar señas desde cualquier operación."}
                </p>
              </div>
              <StatusPill tone="ok">Conectada</StatusPill>
            </div>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-5 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Titular</dt>
              <dd className="min-w-0">
                {account.holderName || "—"}
                {account.hasIdentification && (
                  <span className="ml-1.5 text-xs font-semibold text-green-700">✓ Identidad informada por Mercado Pago</span>
                )}
              </dd>
              {isOwner && account.identificationMasked && (
                <>
                  <dt className="text-muted-foreground">{account.identificationType || "Documento"}</dt>
                  <dd className="font-mono tabular-nums">{account.identificationMasked}</dd>
                </>
              )}
              {account.nickname && (
                <>
                  <dt className="text-muted-foreground">Usuario de MP</dt>
                  <dd className="font-mono">{account.nickname}</dd>
                </>
              )}
              {isOwner && connectedAt && (
                <>
                  <dt className="text-muted-foreground">Conectada</dt>
                  <dd>
                    {connectedAt}
                    {connectedByName && ` por ${connectedByName}`}
                  </dd>
                </>
              )}
            </dl>
            {isOwner &&
              (confirmDisconnect ? (
                <div className="flex flex-wrap items-center gap-2.5 rounded-lg bg-background p-3 text-sm">
                  <span className="min-w-0 flex-1">
                    ¿Desconectar Mercado Pago? No vas a poder cobrar señas hasta volver a conectarla.
                  </span>
                  <button
                    onClick={() => setConfirmDisconnect(false)}
                    disabled={busy}
                    className="rounded-lg border border-border px-4 py-2 font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={disconnect}
                    disabled={busy}
                    className="rounded-lg bg-error px-4 py-2 font-semibold text-white disabled:opacity-60"
                  >
                    {busy ? "Desconectando…" : "Desconectar"}
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={connect}
                    disabled={busy}
                    className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold transition hover:border-accent"
                  >
                    Usar otra cuenta
                  </button>
                  <button
                    onClick={() => setConfirmDisconnect(true)}
                    className="rounded-lg px-2 py-2.5 text-sm font-semibold text-error"
                  >
                    Desconectar
                  </button>
                </div>
              ))}
          </>
        )}
      </section>

      {agencyId && (
        <SenaPaymentsHistory agencyId={agencyId} canRefund={agency?.myRole === "owner" || agency?.myRole === "manager"} />
      )}

      <p className="border-l-[3px] border-border pl-3 text-xs text-muted-foreground">
        Mercado Pago cobra su comisión habitual sobre cada pago. Si la venta no se concreta, la devolución de la seña se
        hace desde acá y vuelve al medio de pago del comprador.
      </p>
    </div>
  );
}
