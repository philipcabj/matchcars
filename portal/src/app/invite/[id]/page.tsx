// portal/src/app/invite/[id]/page.tsx
// Pantalla pública (sin sidebar, como /login) para aceptar una invitación de
// equipo. Si ya hay sesión con el mismo email, acepta directo. Si no, deja
// crear cuenta (mismo shape que registerWithEmail en la app) o iniciar
// sesión si ya la tenía, y recién ahí acepta.
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { parseJsonResponse } from "@/lib/api-client";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

interface InviteInfo {
  agencyName: string;
  email: string;
  role: string;
  roleLabel: string;
}

export default function InvitePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, initializing, getIdToken, loginWithEmail, registerWithEmail, logout } = useAuth();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [autoAccepting, setAutoAccepting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/portal/api/invite/${id}`);
        const data = await parseJsonResponse<InviteInfo>(res);
        setInvite(data);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "No pudimos cargar la invitación.");
      }
    })();
  }, [id]);

  const acceptInvite = async () => {
    setBusy(true);
    setFormError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/portal/api/invite/${id}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await parseJsonResponse(res);
      router.replace("/dashboard");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "No pudimos aceptar la invitación.");
    } finally {
      setBusy(false);
    }
  };

  // Si ya hay sesión con el mismo email que la invitación, se acepta sola.
  const sameEmailLoggedIn = !!user && !!invite && user.email?.toLowerCase() === invite.email.toLowerCase();
  useEffect(() => {
    if (sameEmailLoggedIn && !autoAccepting) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard para no disparar el accept dos veces, no es estado derivado de render
      setAutoAccepting(true);
      acceptInvite();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sameEmailLoggedIn]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!invite) return;
    setFormError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!acceptedTerms) {
          setFormError("Tenés que aceptar los términos para continuar.");
          setBusy(false);
          return;
        }
        await registerWithEmail({ firstName, lastName, email: invite.email, password, acceptedTerms });
      } else {
        await loginWithEmail(invite.email, password);
      }
      await acceptInvite();
    } catch {
      setFormError(mode === "signup" ? "No pudimos crear la cuenta. Probá con otra contraseña." : "Contraseña incorrecta.");
      setBusy(false);
    }
  };

  if (initializing || (!invite && !loadError)) {
    return (
      <main className="flex flex-1 items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Cargando invitación…</p>
      </main>
    );
  }

  if (loadError || !invite) {
    return (
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-error">{loadError}</p>
        </div>
      </main>
    );
  }

  if (user && !sameEmailLoggedIn) {
    return (
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <p className="text-sm">
            Estás logueado como <strong>{user.email}</strong>, pero esta invitación es para <strong>{invite.email}</strong>.
          </p>
          <button
            onClick={() => logout()}
            className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-semibold"
          >
            Cerrar sesión y continuar
          </button>
        </div>
      </main>
    );
  }

  if (sameEmailLoggedIn) {
    return (
      <main className="flex flex-1 items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">{busy ? "Sumándote al equipo…" : formError}</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-lg font-bold text-accent-foreground">
            M
          </div>
          <h1 className="text-lg font-bold">Te invitaron a un equipo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <strong>{invite.agencyName}</strong> te invitó a sumarte como <strong>{invite.roleLabel}</strong>.
          </p>
        </div>

        <div className="mb-4 flex rounded-lg border border-border p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-md py-1.5 ${mode === "signup" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
          >
            Crear cuenta
          </button>
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-md py-1.5 ${mode === "login" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
          >
            Ya tengo cuenta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              value={invite.email}
              disabled
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground"
            />
          </div>

          {mode === "signup" && (
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-sm font-medium">Nombre</label>
                <input
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-sm font-medium">Apellido</label>
                <input
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="••••••••"
            />
          </div>

          {mode === "signup" && (
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-0.5" />
              Acepto los términos y condiciones de Matchcars.
            </label>
          )}

          {formError && <p className="text-sm text-error">{formError}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition disabled:opacity-60"
          >
            {busy ? "Un momento…" : mode === "signup" ? "Crear cuenta y unirme" : "Iniciar sesión y unirme"}
          </button>
        </form>
      </div>
    </main>
  );
}
