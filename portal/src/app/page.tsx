// portal/src/app/page.tsx
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { user, initializing } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;
    router.replace(user ? "/dashboard" : "/login");
  }, [initializing, user, router]);

  return (
    <main className="flex flex-1 items-center justify-center">
      <p className="text-muted-foreground text-sm">Cargando…</p>
    </main>
  );
}
