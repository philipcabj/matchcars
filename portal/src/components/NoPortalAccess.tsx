// portal/src/components/NoPortalAccess.tsx
// Pantalla para una cuenta que existe pero no tiene plan pago ni invitación
// (403 de resolveMembership). Antes era un "Sin acceso al portal" con un solo
// botón de "Cerrar sesión" — callejón sin salida para alguien que llega desde
// la web, entra con Google/Apple (que le crea la cuenta en el acto) y todavía
// no contrató nada. Acá se le dice que la cuenta ya está y cómo activar el portal.
"use client";

import { DownloadAppQr, goToAppDownload } from "@/components/DownloadAppQr";
import Link from "next/link";

const DOWNLOAD_BLOCK_ID = "descargar";

export function NoPortalAccess({
  email,
  onRetry,
  onLogout,
}: {
  email: string | null;
  onRetry: () => void;
  onLogout: () => void;
}) {
  const account = email ? <strong className="text-foreground">{email}</strong> : "la misma cuenta";

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-3xl" aria-hidden>
          ✅
        </p>
        <h1 className="mt-2 text-lg font-bold">Tu cuenta ya está creada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Para activar el Portal de Agencias, contratá un plan desde la app MatchCars iniciando sesión con {account}.
          Después volvé acá y entrá con el mismo mail.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => goToAppDownload(DOWNLOAD_BLOCK_ID)}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground"
          >
            Descargar la app
          </button>
          <Link
            href="/planes"
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold hover:bg-background"
          >
            Ver los planes
          </Link>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          ¿Ya contrataste?{" "}
          <button type="button" onClick={onRetry} className="font-semibold text-accent hover:underline">
            Volver a verificar
          </button>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          ¿Te invitó tu agencia? Pedile que te mande la invitación a {email ?? "tu mail"}.
        </p>
        <button
          type="button"
          onClick={onLogout}
          className="mt-4 text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline"
        >
          Entrar con otra cuenta
        </button>
      </div>

      <div className="w-full max-w-xl">
        <DownloadAppQr id={DOWNLOAD_BLOCK_ID} />
      </div>
    </main>
  );
}
