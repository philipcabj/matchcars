"use client";

import { useCompare } from "@/contexts/CompareContext";
import Link from "next/link";

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || "http://localhost:3000";

const LINKS = [
  { href: "/", label: "Autos" },
  { href: "/agencias", label: "Agencias" },
];

export function NavBar() {
  const { ids } = useCompare();

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="text-lg font-extrabold">
          Match<span className="text-accent">Cars</span>
        </Link>
        <nav className="flex items-center gap-5">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm font-medium text-foreground hover:text-accent">
              {l.label}
            </Link>
          ))}
          <Link
            href={ids.length > 0 ? `/comparar?ids=${ids.join(",")}` : "/comparar"}
            className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-accent"
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
            className="rounded-full bg-accent/10 px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent/20"
          >
            Portal de Agencias →
          </a>
        </nav>
      </div>
    </header>
  );
}
