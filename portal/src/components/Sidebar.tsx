// portal/src/components/Sidebar.tsx
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { NotificationBell } from "@/components/NotificationBell";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAgencyMe } from "@/hooks/useAgencyMe";

const MARKETPLACE_URL = process.env.NEXT_PUBLIC_MARKETPLACE_URL || "http://localhost:3100";

type Gate = "none" | "crm";

const NAV_ITEMS: { label: string; href: string; icon: string; enabled: boolean; gate: Gate }[] = [
  { label: "Mi Agencia", href: "/dashboard", icon: "🏠", enabled: true, gate: "none" },
  { label: "Configurar agencia", href: "/dashboard/profile", icon: "🏷️", enabled: true, gate: "none" },
  { label: "Equipo", href: "/dashboard/team", icon: "👥", enabled: true, gate: "none" },
  { label: "Stock", href: "/dashboard/stock", icon: "🚗", enabled: true, gate: "none" },
  { label: "Leads", href: "/dashboard/leads", icon: "📞", enabled: true, gate: "crm" },
  { label: "Operaciones", href: "/dashboard/operaciones", icon: "📋", enabled: true, gate: "crm" },
  { label: "Postventa", href: "/dashboard/postventa", icon: "🔄", enabled: true, gate: "crm" },
  // Comisiones ya es universal (canManageCommissions = cualquier plan pago,
  // ver plans.ts) -- mismo gate "crm" que el resto del CRM, no "dealer"
  // (ese gate quedaba mostrando "🔒 Dealer" a Pro/Pro Plus aunque la
  // pantalla ya los dejaba entrar).
  { label: "Comisiones", href: "/dashboard/comisiones", icon: "💰", enabled: true, gate: "crm" },
  { label: "Costos", href: "/dashboard/costos", icon: "💵", enabled: true, gate: "crm" },
  { label: "Reportes", href: "/dashboard/reports", icon: "📊", enabled: true, gate: "none" },
  { label: "Planes", href: "/dashboard/plans", icon: "💎", enabled: true, gate: "none" },
];

const ADMIN_NAV_ITEM = { label: "Administración", href: "/dashboard/admin", icon: "🛡️", enabled: true, gate: "none" as Gate };
const GATE_LABEL: Record<Gate, string> = { none: "", crm: "🔒 Plan pago" };

export function Sidebar() {
  const { user, logout } = useAuth();
  const { data: agency } = useAgencyMe();
  const { isModerator } = useAdminRole();
  const router = useRouter();
  const pathname = usePathname();
  const navItems = isModerator ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-card p-4">
      <div className="mb-6 flex items-center gap-2 px-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">
          M
        </div>
        <span className="text-sm font-bold">Portal Agencias</span>
      </div>

      <div className="mb-4 flex flex-col gap-2">
        <NotificationBell />
        <a
          href={MARKETPLACE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-accent hover:text-accent"
        >
          <span>🌐</span>
          <span>Ver sitio web</span>
          <span className="ml-auto">↗</span>
        </a>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => {
          const active = item.href === "/dashboard" ? pathname === item.href : pathname?.startsWith(item.href);
          const unread = item.href === "/dashboard/leads" ? agency?.unreadLeadsCount ?? 0 : 0;
          const locked = !!agency && item.gate === "crm" && !agency.hasCRM;
          const className = `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
            active ? "bg-accent/10 text-accent" : item.enabled ? "text-foreground hover:bg-background" : "cursor-default text-muted-foreground/60"
          }`;
          const content = (
            <>
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {!item.enabled && (
                <span className="ml-auto rounded-full bg-muted/20 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  pronto
                </span>
              )}
              {item.enabled && locked && (
                <span className="ml-auto rounded-full bg-muted/20 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {GATE_LABEL[item.gate]}
                </span>
              )}
              {!locked && unread > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-[10px] font-bold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </>
          );
          return item.enabled ? (
            <Link key={item.href} href={item.href} className={className}>
              {content}
            </Link>
          ) : (
            <div key={item.href} className={className} title="Próximamente">
              {content}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border pt-3">
        <div className="flex items-center gap-2 px-1">
          <Avatar src={agency?.avatarUrl} name={agency?.agencyName || user?.email || "?"} size={28} />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{agency?.agencyName || "Mi cuenta"}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-left text-sm text-muted-foreground transition hover:text-foreground"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
