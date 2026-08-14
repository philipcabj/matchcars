"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { NotificationItem } from "@/lib/notifications";
import { useEffect, useState } from "react";

const POLL_MS = 45_000;

// Sin listeners de Firestore en tiempo real (el portal usa Admin SDK
// server-side, no el SDK de cliente) — un polling liviano cada 45s alcanza
// para "cosas que necesitan tu atención" sin agregar infraestructura nueva.
export function useNotifications() {
  const { user, getIdToken } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/agency/notifications", { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<{ items: NotificationItem[] }>(res);
        if (!cancelled) setItems(data.items);
      } catch {
        // Silencioso: es un indicador secundario, no vale la pena un error visible.
      }
    };

    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user, getIdToken]);

  return { items };
}
