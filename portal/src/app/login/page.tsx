// portal/src/app/login/page.tsx
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { DownloadAppQr } from "@/components/DownloadAppQr";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const { loginWithEmail, resetPassword, loginWithGoogle, loginWithApple } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginWithEmail(email, password);
      router.replace("/dashboard");
    } catch {
      setError("No pudimos iniciar sesión. Revisá el email y la contraseña.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      router.replace("/dashboard");
    } catch (e) {
      console.error("[loginWithGoogle]", e);
      const code = e && typeof e === "object" && "code" in e ? ` (${(e as { code: string }).code})` : "";
      setError(`No pudimos iniciar sesión con Google. Probá de nuevo.${code}`);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setMessage(null);
    if (!email.trim()) {
      setError("Ingresá tu email para poder enviarte el link de recuperación.");
      return;
    }
    setResetLoading(true);
    try {
      await resetPassword(email);
      setMessage("Te enviamos un email con un link para restablecer tu contraseña.");
    } catch (e) {
      console.error("[resetPassword]", e);
      const code = e && typeof e === "object" && "code" in e ? (e as { code: string }).code : "";
      setError(
        code === "auth/user-not-found"
          ? "No encontramos una cuenta con ese email."
          : "No pudimos enviar el link de recuperación. Probá de nuevo."
      );
    } finally {
      setResetLoading(false);
    }
  };

  const handleApple = async () => {
    setError(null);
    setAppleLoading(true);
    try {
      await loginWithApple();
      router.replace("/dashboard");
    } catch (e) {
      console.error("[loginWithApple]", e);
      const code = e && typeof e === "object" && "code" in e ? ` (${(e as { code: string }).code})` : "";
      setError(`No pudimos iniciar sesión con Apple. Probá de nuevo.${code}`);
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm">
            <Image src="/logo.png" alt="MatchCars" width={48} height={48} className="rounded-lg" priority />
          </span>
          <h1 className="text-lg font-bold">Portal de Agencias</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ingresá con la misma cuenta que usás en la app Matchcars.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="tu@agencia.com"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm outline-none focus:border-accent"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.4 5.5A9.8 9.8 0 0 1 12 5c5 0 9 4 10 7-.4 1.1-1.2 2.4-2.3 3.6M6.2 6.6C4.2 8 2.7 9.9 2 12c1 3 5 7 10 7 1.3 0 2.6-.3 3.7-.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={resetLoading}
            className="self-end text-xs font-semibold text-accent hover:underline disabled:opacity-60"
          >
            {resetLoading ? "Enviando…" : "¿Olvidaste tu contraseña?"}
          </button>

          {error && <p className="text-sm text-error">{error}</p>}
          {message && <p className="text-sm text-success">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition disabled:opacity-60"
          >
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          o
          <span className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold transition hover:bg-card disabled:opacity-60"
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.36-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          {googleLoading ? "Ingresando…" : "Continuar con Google"}
        </button>

        <button
          type="button"
          onClick={handleApple}
          disabled={appleLoading}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          <svg width="16" height="16" viewBox="0 0 384 512" fill="white">
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
          </svg>
          {appleLoading ? "Ingresando…" : "Continuar con Apple"}
        </button>
      </div>

      <div className="w-full max-w-xl">
        <DownloadAppQr
          title="¿No tenés cuenta o plan todavía?"
          description="El Portal de Agencias se activa con la misma cuenta de la app MatchCars — descargala, creá tu cuenta, contratá un plan pago y volvé acá con el mismo mail."
        />
        <Link href="/planes" className="mt-3 block text-center text-xs font-semibold text-accent hover:underline">
          Ver los planes →
        </Link>
      </div>
    </main>
  );
}
