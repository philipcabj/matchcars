// portal/src/hooks/useAgencyMe.ts
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { AgencyMe } from "@/lib/agency";
import { parseJsonResponse } from "@/lib/api-client";
import { useCallback, useEffect, useState } from "react";

export function useAgencyMe() {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<AgencyMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const token = await getIdToken();
        const res = await fetch("/portal/api/agency/me", { headers: { Authorization: `Bearer ${token}` } });
        const json = await parseJsonResponse<AgencyMe>(res);
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error desconocido");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getIdToken, reloadKey]);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  return { data, error, loading, refetch };
}
