// portal/src/app/dashboard/layout.tsx
"use client";

import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencyMe } from "@/hooks/useAgencyMe";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, initializing, logout } = useAuth();
  const router = useRouter();
  // resolveMembership (server) rechaza cuentas sin invitación y sin plan
  // pago — acá se traduce ese 403 en una pantalla clara en vez de un
  // dashboard roto a medio cargar.
  const { error: agencyError, sessionExpired, loading: agencyLoading } = useAgencyMe();

  useEffect(() => {
    if (!initializing && !user) router.replace("/login");
  }, [initializing, user, router]);

  if (initializing || !user || agencyLoading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </main>
    );
  }

  if (agencyError) {
    return (
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          {sessionExpired ? (
            <>
              <p className="text-sm font-semibold">Tu sesión expiró</p>
              <p className="mt-2 text-sm text-muted-foreground">Iniciá sesión de nuevo para continuar.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">Sin acceso al portal</p>
              <p className="mt-2 text-sm text-muted-foreground">{agencyError}</p>
            </>
          )}
          <button
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-semibold"
          >
            {sessionExpired ? "Iniciar sesión" : "Cerrar sesión"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
