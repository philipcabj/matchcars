"use client";

import { useCompare } from "@/contexts/CompareContext";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || "http://localhost:3000";

const LINKS = [
  { href: "/", label: "Autos" },
  { href: "/agencias", label: "Agencias" },
];

export function NavBar() {
  const { ids } = useCompare();
  const [menuOpen, setMenuOpen] = useState(false);
  const compareHref = ids.length > 0 ? `/comparar?ids=${ids.join(",")}` : "/comparar";

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center">
          <Image src="/brand/logo-icon.png" alt="MatchCars" width={44} height={44} className="rounded-xl" priority />
        </Link>

        <nav className="hidden items-center gap-5 md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm font-medium text-foreground hover:text-accent">
              {l.label}
            </Link>
          ))}
          <Link href={compareHref} className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-accent">
            Comparar
            {ids.length > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                {ids.length}
              </span>
            )}
          </Link>
          <a href={PORTAL_URL} className="rounded-full bg-accent/10 px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent/20">
            Portal de Agencias →
          </a>
          <ThemeToggle />
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuOpen}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-foreground"
          >
            {menuOpen ? (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 2l14 14M16 2L2 16" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 4h14M2 9h14M2 14h14" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="flex flex-col gap-1 border-t border-border px-4 py-3 md:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="rounded-lg px-2 py-2.5 text-sm font-medium text-foreground hover:bg-background"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href={compareHref}
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-medium text-foreground hover:bg-background"
          >
            Comparar
            {ids.length > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                {ids.length}
              </span>
            )}
          </Link>
          <a
            href={PORTAL_URL}
            className="mt-1 rounded-lg bg-accent/10 px-2 py-2.5 text-center text-sm font-semibold text-accent"
          >
            Portal de Agencias →
          </a>
        </nav>
      )}
    </header>
  );
}
