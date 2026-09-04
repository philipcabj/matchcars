"use client";

import { useNotifications } from "@/hooks/useNotifications";
import Link from "next/link";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

const TYPE_ICON: Record<string, string> = {
  new_lead: "🆕",
  lead_stale: "⏰",
  pending_offer: "💰",
  pending_sale_confirmation: "⏳",
  checklist_due: "📅",
  agency_thread_message: "🤝",
  stock_incomplete: "📝",
  stock_stale: "🐌",
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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen((o) => !o);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
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

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              style={{ top: pos.top, left: pos.left }}
              className="fixed z-50 flex max-h-96 w-80 flex-col overflow-y-auto rounded-xl border border-border bg-card shadow-xl"
            >
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
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold">{item.title}</p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{fmtRelative(item.at)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
