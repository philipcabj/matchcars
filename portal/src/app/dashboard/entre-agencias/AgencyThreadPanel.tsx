// portal/src/app/dashboard/entre-agencias/AgencyThreadPanel.tsx
// Hilo privado entre dos agencias — mismo patrón de burbujas +
// input-con-Enter que ya usa la conversación de un lead orgánico
// (dashboard/leads/[id]/page.tsx), pero acá senderId es el agencyId de
// quien escribe (dos identidades reales, no una sola voz enmascarada).
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { useEffect, useRef, useState } from "react";

interface ThreadMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: string | null;
  isMe: boolean;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function AgencyThreadPanel({ threadId, title, onClose }: { threadId: string; title: string; onClose: () => void }) {
  const { getIdToken } = useAuth();
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/agency/agency-threads/${threadId}/messages`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<{ messages: ThreadMessage[] }>(res);
        setMessages(data.messages);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [threadId, getIdToken, reloadKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendReply = async () => {
    const text = reply.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/agency/agency-threads/${threadId}/messages`, {
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col gap-3 overflow-hidden bg-background p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-semibold">{title}</p>
          <button onClick={onClose} className="text-sm text-muted-foreground">
            Cerrar ✕
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto rounded-2xl border border-border bg-card p-3">
          {!messages && <p className="text-sm text-muted-foreground">Cargando mensajes…</p>}
          {messages?.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay mensajes — arrancá la conversación.</p>}
          {messages?.map((m) => (
            <div key={m.id} className={`flex ${m.isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.isMe ? "bg-accent text-accent-foreground" : "bg-background text-foreground"}`}>
                <p>{m.text}</p>
                <p className={`mt-0.5 text-[10px] ${m.isMe ? "text-accent-foreground/70" : "text-muted-foreground"}`}>{fmtDateTime(m.createdAt)}</p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error && <p className="text-xs text-error">{error}</p>}

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
            placeholder="Escribí un mensaje…"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={sendReply}
            disabled={sending || !reply.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {sending ? "…" : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
