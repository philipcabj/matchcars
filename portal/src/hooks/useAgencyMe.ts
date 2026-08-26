// portal/src/hooks/useAgencyMe.ts
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { AgencyMe } from "@/lib/agency";
import { ApiClientError, parseJsonResponse } from "@/lib/api-client";
import { useCallback, useEffect, useState } from "react";

export function useAgencyMe() {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<AgencyMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 401 (requireUid: sin token o token vencido) es un problema de sesión, no
  // de la cuenta — distinto de un 403 real (resolveMembership: cuenta sin
  // invitación ni plan pago). dashboard/layout.tsx usa esto para no mostrar
  // "Token inválido o expirado" crudo como si fuera un mensaje de negocio.
  const [sessionExpired, setSessionExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const token = await getIdToken();
        const res = await fetch("/api/agency/me", { headers: { Authorization: `Bearer ${token}` } });
        const json = await parseJsonResponse<AgencyMe>(res);
        if (!cancelled) setData(json);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Error desconocido");
        setSessionExpired(e instanceof ApiClientError && e.status === 401);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getIdToken, reloadKey]);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  return { data, error, sessionExpired, loading, refetch };
}
