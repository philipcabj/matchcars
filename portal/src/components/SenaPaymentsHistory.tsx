// portal/src/components/SenaPaymentsHistory.tsx
// Historial de señas cobradas por QR (pantalla Cobros) — lee senaPayments de
// la agencia en vivo. "Devolver" llama a refundSenaPayment
// (functions/src/senaPayments.ts), que solo deja a dueño o gerente.
"use client";

import type { SenaPayment } from "@/components/SenaQrPayment";
import { app, db } from "@/lib/firebase-client";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import Link from "next/link";
import { useEffect, useState } from "react";

type Row = SenaPayment & { vehicleLabel: string; buyerLabel: string };

const fmt = (n: number) => `$ ${n.toLocaleString("es-AR")}`;

function statusPill(p: Row) {
  const expired = p.status === "pending" && (p.expiresAt?.toMillis() ?? 0) < Date.now();
  const [label, cls] =
    p.status === "approved"
      ? ["Pagada", "bg-success/10 text-green-700"]
      : p.status === "refunded"
        ? ["Devuelta", "bg-muted/20 text-muted-foreground"]
        : p.status === "cancelled"
          ? ["Cancelada", "bg-muted/20 text-muted-foreground"]
          : expired
            ? ["Venció sin pagar", "bg-muted/20 text-muted-foreground"]
            : ["Esperando pago", "bg-amber-50 text-amber-700"];
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export function SenaPaymentsHistory({ agencyId, canRefund }: { agencyId: string; canRefund: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "senaPayments"), where("sellerUid", "==", agencyId), orderBy("createdAt", "desc"), limit(50));
    return onSnapshot(
      q,
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Row, "id">) }))),
      (err) => {
        console.error("senaPayments", err);
        setRows([]);
      }
    );
  }, [agencyId]);

  const refund = async (paymentId: string) => {
    setBusy(true);
    setError(null);
    try {
      await httpsCallable(getFunctions(app), "refundSenaPayment")({ paymentId });
      setConfirmId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo devolver.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <p className="font-semibold">Señas cobradas</p>
      {error && <p className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">{error}</p>}
      {rows === null ? (
        <div className="h-16 animate-pulse rounded-lg bg-background" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no cobraste ninguna seña. Se cobran desde una operación, en el paso &quot;Seña / Reserva&quot;.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Fecha</th>
                <th className="pb-2 pr-3 font-medium">Operación</th>
                <th className="pb-2 pr-3 font-medium">Auto</th>
                <th className="pb-2 pr-3 font-medium">Comprador</th>
                <th className="pb-2 pr-3 font-medium">Monto</th>
                <th className="pb-2 pr-3 font-medium">Estado</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-border align-middle">
                  <td className="whitespace-nowrap py-2.5 pr-3">
                    {p.createdAt?.toDate().toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) ?? "—"}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3">
                    <Link href={`/dashboard/operaciones/${p.saleOperationId}`} className="font-mono text-accent hover:underline">
                      OP-{p.operationNumber}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3">{p.vehicleLabel}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3">{p.buyerLabel}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 font-mono tabular-nums">{fmt(p.amount)}</td>
                  <td className="py-2.5 pr-3">{statusPill(p)}</td>
                  <td className="whitespace-nowrap py-2.5 text-right">
                    {canRefund && p.status === "approved" &&
                      (confirmId === p.id ? (
                        <span className="inline-flex items-center gap-2 text-xs">
                          ¿Devolver {fmt(p.amount)}?
                          <button onClick={() => setConfirmId(null)} disabled={busy} className="font-semibold text-muted-foreground">
                            No
                          </button>
                          <button onClick={() => refund(p.id)} disabled={busy} className="font-semibold text-error">
                            {busy ? "Devolviendo…" : "Sí, devolver"}
                          </button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmId(p.id)} className="text-xs font-semibold text-muted-foreground hover:text-error">
                          Devolver
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
