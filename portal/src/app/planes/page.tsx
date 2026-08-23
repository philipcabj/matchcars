// portal/src/app/planes/page.tsx
// Landing pública de planes — sin sesión, para linkear desde la web y desde
// el login del portal. Presentación compartida con /dashboard/plans, ver
// PlansDisplay.tsx. Ruta fuera de /dashboard a propósito: sin Sidebar ni
// gate de sesión, cualquiera puede entrar.
import { PlansDisplay } from "@/components/PlansDisplay";
import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Planes — Portal de Agencias · Matchcars",
  description: "Un portal, tres tamaños: CRM, gestión de venta, comisiones y reportes desde el plan más chico.",
};

export default function PublicPlansPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-5 py-10 sm:py-14">
      <Link href="/login" className="flex w-fit items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white p-1 shadow-sm">
          <Image src="/logo.png" alt="MatchCars" width={30} height={30} className="rounded" priority />
        </span>
        <span className="text-sm font-bold">Portal de Agencias</span>
      </Link>

      <PlansDisplay showDownloadCta />
    </main>
  );
}
