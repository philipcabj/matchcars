"use client";

import { useNotifications } from "@/hooks/useNotifications";
import Link from "next/link";
import { useState } from "react";

const TYPE_ICON: Record<string, string> = {
  new_lead: "🆕",
  pending_offer: "💰",
  pending_sale_confirmation: "⏳",
};

function fmtRelative(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  return `Hace ${days} días`;
}

export function NotificationBell() {
  const { items } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-accent hover:text-accent"
      >
        <span>🔔</span>
        <span>Novedades</span>
        {items.length > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
            {items.length > 9 ? "9+" : items.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 flex max-h-96 w-80 flex-col overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
            {items.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">No tenés nada pendiente por ahora.</p>
            ) : (
              items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-2 border-b border-border/60 px-3 py-2.5 text-left transition last:border-0 hover:bg-background"
                >
                  <span className="shrink-0 text-base">{TYPE_ICON[item.type]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{item.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{fmtRelative(item.at)}</span>
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
