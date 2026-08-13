// portal/src/app/dashboard/admin/page.tsx
// Panel de administración global de la plataforma — puerto de
// app/(admin)/dashboard.tsx (raíz) al portal. Distinto del resto de
// /dashboard/**: no está scopeado a una agencia, sino al rol de plataforma
// (users/{uid}.role admin/moderator), chequeado server-side en cada route de
// /api/admin/* (ver requireAdminRole/requireSuperAdmin en lib/api-auth.ts).
"use client";

import { useAdminRole } from "@/hooks/useAdminRole";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AllVehiclesTab } from "./AllVehiclesTab";
import { ModerationTab } from "./ModerationTab";
import { PricingWidget } from "./PricingWidget";
import { ReportsTab } from "./ReportsTab";
import { UsersTab } from "./UsersTab";

type Tab = "moderation" | "reports" | "all-vehicles" | "users";

export default function AdminPage() {
  const { role, loading, isAdmin, isModerator } = useAdminRole();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("moderation");

  useEffect(() => {
    if (!loading && !isModerator) router.replace("/dashboard");
  }, [loading, isModerator, router]);

  if (loading || !isModerator) {
    return <p className="text-sm text-muted-foreground">{loading ? "Cargando…" : "Redirigiendo…"}</p>;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Administración</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Panel global de la plataforma — conectado como {role === "admin" ? "admin" : "moderador"}.
        </p>
      </div>

      <PricingWidget />

      <div className="flex gap-2 rounded-2xl border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => setTab("moderation")}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold ${tab === "moderation" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
        >
          Publicaciones
        </button>
        <button
          type="button"
          onClick={() => setTab("reports")}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold ${tab === "reports" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
        >
          Reportes
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setTab("all-vehicles")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold ${tab === "all-vehicles" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
          >
            Eliminar publicación
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setTab("users")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold ${tab === "users" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
          >
            Usuarios
          </button>
        )}
      </div>

      {tab === "moderation" && <ModerationTab />}
      {tab === "reports" && <ReportsTab />}
      {tab === "all-vehicles" && isAdmin && <AllVehiclesTab />}
      {tab === "users" && isAdmin && <UsersTab />}
    </div>
  );
}
