// portal/src/hooks/useAdminRole.ts
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { useEffect, useState } from "react";

export type PlatformRole = "admin" | "moderator" | null;

export function useAdminRole() {
  const { user, getIdToken } = useAuth();
  const [role, setRole] = useState<PlatformRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        if (!cancelled) {
          setRole(null);
          setLoading(false);
        }
        return;
      }
      try {
        const token = await getIdToken();
        const res = await fetch("/api/admin/check", { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseJsonResponse<{ role: PlatformRole }>(res);
        if (!cancelled) setRole(data.role);
      } catch {
        if (!cancelled) setRole(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, getIdToken]);

  return { role, loading, isAdmin: role === "admin", isModerator: role === "moderator" || role === "admin" };
}
