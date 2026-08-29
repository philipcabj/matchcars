// portal/src/app/dashboard/entre-agencias/ThreadsTab.tsx
// Todas mis conversaciones de "Entre agencias" — como quien pidió o como
// quien respondió, con no leídos.
"use client";

import { useState } from "react";
import { AgencyThreadPanel } from "./AgencyThreadPanel";
import type { AgencyThreadItem } from "./types";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

export function ThreadsTab({ threads, onOpened }: { threads: AgencyThreadItem[]; onOpened: () => void }) {
  const [openThread, setOpenThread] = useState<{ id: string; title: string } | null>(null);

  if (threads.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no tenés conversaciones con otras agencias.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {threads.map((t) => (
        <button
          key={t.id}
          onClick={() => {
            setOpenThread({ id: t.id, title: `${t.otherAgencyName} — ${t.requestSummary.brand} ${t.requestSummary.model}` });
            if (t.unreadForMe > 0) onOpened();
          }}
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:border-accent"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {t.otherAgencyName} — {t.requestSummary.brand} {t.requestSummary.model}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {t.myRole === "requester" ? "Vos pediste" : "Vos respondiste"} · {t.lastMessage || "Sin mensajes todavía"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-muted-foreground">{fmtDate(t.lastMessageAt)}</span>
            {t.unreadForMe > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-[10px] font-bold text-white">{t.unreadForMe}</span>
            )}
          </div>
        </button>
      ))}

      {openThread && (
        <AgencyThreadPanel
          threadId={openThread.id}
          title={openThread.title}
          onClose={() => {
            setOpenThread(null);
            onOpened();
          }}
        />
      )}
    </div>
  );
}
