// portal/src/components/SaleJourney.tsx
// Camino completo de una venta en una sola vista: negociación → checklist →
// venta confirmada → (si hay usado) auto publicado. Cada paso marca hecho/
// actual/pendiente con datos en vivo (ver leadStatus/vehicleStatus/
// tradeInVehicleStatus en sale-operations/[id]/route.ts) y linkea a la
// pantalla donde se gestiona — antes había que recordar de memoria en qué
// paso estaba cada operación, sin ningún resumen que las juntara.
"use client";

import { SaleOperation } from "@/lib/sale-operations";
import Link from "next/link";
import { Fragment } from "react";

type StepState = "done" | "current" | "pending";

interface Step {
  key: string;
  label: string;
  sub?: string;
  state: StepState;
  href?: string;
}

function buildSteps(op: SaleOperation): Step[] {
  const checklistDone = op.checklist.filter((c) => c.status === "hecho").length;
  const checklistTotal = op.checklist.length;
  const checklistComplete = op.status === "completada" || (checklistTotal > 0 && checklistDone === checklistTotal);

  const ventaConfirmada = op.vehicleStatus === "reserved" || op.vehicleStatus === "sold";
  const precioAcordado = op.leadStatus === "won" || ventaConfirmada;

  const steps: Step[] = [
    {
      key: "negociacion",
      label: "Negociación",
      state: "done",
      href: `/dashboard/leads/${op.leadId}`,
    },
    {
      key: "checklist",
      label: "Checklist de trámites",
      sub: `${checklistDone}/${checklistTotal}`,
      state: checklistComplete ? "done" : "current",
      href: "#checklist",
    },
    {
      key: "precio",
      label: "Precio acordado",
      state: precioAcordado ? "done" : op.leadStatus === "negotiation" ? "current" : "pending",
      href: `/dashboard/leads/${op.leadId}`,
    },
    {
      key: "venta",
      label: "Venta confirmada",
      sub: "comisión + stock",
      state: ventaConfirmada ? "done" : precioAcordado ? "current" : "pending",
      href: `/dashboard/leads/${op.leadId}`,
    },
  ];

  if (op.buyerId) {
    const compradorConfirmo = op.vehicleStatus === "sold";
    steps.push({
      key: "comprador",
      label: "Comprador confirma",
      sub: "desde la app",
      state: compradorConfirmo ? "done" : op.vehicleStatus === "reserved" ? "current" : "pending",
    });
  }

  if (op.parteDePago.incluye) {
    const stockStatus = op.tradeInVehicleStatus;
    const publicado = !!stockStatus && !["a_preparar", "pending_review", "rejected", "rejected_limit"].includes(stockStatus);
    steps.push({
      key: "usado",
      label: "Auto usado publicado",
      sub: op.parteDePago.agregadoAlStock ? (publicado ? "publicado" : "a preparar") : "pendiente",
      state: publicado ? "done" : op.parteDePago.agregadoAlStock ? "current" : "pending",
      href: op.parteDePago.vehiculoStockId ? `/dashboard/stock/${op.parteDePago.vehiculoStockId}` : "#parte-de-pago",
    });
  }

  return steps;
}

const STATE_STYLES: Record<StepState, string> = {
  done: "border-success/40 bg-success/10 text-success",
  current: "border-accent/50 bg-accent/10 text-accent",
  pending: "border-border bg-background text-muted-foreground",
};

const STATE_ICON: Record<StepState, string> = { done: "✓", current: "●", pending: "○" };

export function SaleJourney({ op }: { op: SaleOperation }) {
  const steps = buildSteps(op);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-3 text-sm font-semibold">Camino de esta venta</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {steps.map((step, i) => {
          const chip = (
            <span
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${STATE_STYLES[step.state]}`}
            >
              <span>{STATE_ICON[step.state]}</span>
              <span>{step.label}</span>
              {step.sub && <span className="font-normal opacity-70">· {step.sub}</span>}
            </span>
          );
          return (
            <Fragment key={step.key}>
              {i > 0 && <span className="text-muted-foreground">→</span>}
              {step.href ? (
                <Link href={step.href} className="transition hover:opacity-80">
                  {chip}
                </Link>
              ) : (
                chip
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
