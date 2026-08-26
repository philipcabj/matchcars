// portal/src/contexts/AuthContext.tsx
"use client";

import { getAvatarColorFromEmail } from "@/lib/avatar-color";
import { auth, db } from "@/lib/firebase-client";
import { trackPortalEvent } from "@/lib/ga";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
  type UserCredential,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import React, { createContext, useContext, useEffect, useState } from "react";

interface RegisterParams {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  acceptedTerms: boolean;
}

interface AuthContextValue {
  user: User | null;
  initializing: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  /** Mismo mecanismo que ya usa la app (contexts/AuthContext.tsx raíz) — Firebase manda el mail con su plantilla/link por defecto. */
  resetPassword: (email: string) => Promise<void>;
  /**
   * Solo se usa desde /invite/[id] (aceptar una invitación de equipo) — no
   * hay un registro público general en el portal todavía. Mismo shape de
   * users/{uid} que registerWithEmail en contexts/AuthContext.tsx (raíz),
   * para no crear una cuenta "incompleta" a ojos del resto de la app.
   */
  registerWithEmail: (params: RegisterParams) => Promise<void>;
  /**
   * Mismo uid que la cuenta de la app si el usuario ya se registró/logueó ahí
   * con Google — a diferencia de email/contraseña, acá no hay forma de que
   * quede "sin cuenta" en el portal: agencias que invitan a alguien con Gmail
   * no podían entrar antes porque no tenían contraseña seteada (su cuenta es
   * 100% Google). Crea users/{uid} solo si es la primera vez que esa persona
   * usa MatchCars en cualquier plataforma.
   */
  loginWithGoogle: () => Promise<void>;
  /** Mismo criterio que loginWithGoogle, para quien se registró/logueó en la app con Apple. */
  loginWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  /** Firebase ID token del usuario actual, para llamar a /api/* del portal. */
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setInitializing(false);
    });
    return unsub;
  }, []);

  // Fire-and-forget: registra el login en loginEvents (ver
  // /api/auth/log-login) para que el admin pueda ver quién entró y cuándo.
  // Nunca debe bloquear ni romper el login real si falla.
  const logLogin = (cred: UserCredential, method: "email" | "google" | "apple") => {
    cred.user
      .getIdToken()
      .then((idToken) =>
        fetch("/api/auth/log-login", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ method }),
        })
      )
      .catch(() => {});
  };

  const loginWithEmail = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    logLogin(cred, "email");
    trackPortalEvent("portal_login", { method: "email" });
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  };

  const registerWithEmail = async ({ firstName, lastName, email, password, acceptedTerms }: RegisterParams) => {
    const cleanEmail = email.trim().toLowerCase();
    const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    const uid = cred.user.uid;
    const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase().trim() || "MC";

    await setDoc(doc(db, "users", uid), {
      id: uid,
      firstName,
      lastName,
      email: cleanEmail,
      role: "user",
      plan: "free",
      initials,
      avatarColor: getAvatarColorFromEmail(cleanEmail),
      acceptedTerms,
      trustLevel: "new",
      salesCount: 0,
      loginCount: 1,
      createdAt: serverTimestamp(),
      provider: "password",
    });
    logLogin(cred, "email");
  };

  // Crea users/{uid} si es la primera vez que esta persona usa MatchCars en
  // cualquier plataforma — si ya existe (login habitual con Google/Apple
  // desde la app) no se toca nada.
  const createUserDocIfMissing = async (cred: UserCredential, provider: "google" | "apple") => {
    const uid = cred.user.uid;
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) return;

    const email = (cred.user.email ?? "").trim().toLowerCase();
    const [firstName = "", lastName = ""] = (cred.user.displayName ?? "").split(" ");
    const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase().trim() || email.slice(0, 2).toUpperCase() || "MC";

    await setDoc(userRef, {
      id: uid,
      firstName,
      lastName,
      email,
      role: "user",
      plan: "free",
      initials,
      avatarColor: getAvatarColorFromEmail(email),
      acceptedTerms: false,
      trustLevel: "new",
      salesCount: 0,
      loginCount: 1,
      createdAt: serverTimestamp(),
      provider,
    });
  };

  const loginWithGoogle = async () => {
    const cred = await signInWithPopup(auth, new GoogleAuthProvider());
    await createUserDocIfMissing(cred, "google");
    logLogin(cred, "google");
    trackPortalEvent("portal_login", { method: "google" });
  };

  const loginWithApple = async () => {
    const provider = new OAuthProvider("apple.com");
    provider.addScope("email");
    provider.addScope("name");
    const cred = await signInWithPopup(auth, provider);
    await createUserDocIfMissing(cred, "apple");
    logLogin(cred, "apple");
    trackPortalEvent("portal_login", { method: "apple" });
  };

  const logout = async () => {
    await signOut(auth);
  };

  const getIdToken = async () => {
    if (!auth.currentUser) return null;
    // forceRefresh: true a propósito — sin esto, una pestaña que quedó
    // abierta/en segundo plano rato largo (ej. llega la notificación de un
    // lead nuevo, la persona vuelve más tarde y recién ahí hace click) podía
    // mandar un token vencido y el servidor lo rechazaba con "Token inválido
    // o expirado" (reportado en /dashboard/leads/[id]). Cuesta un viaje de
    // red extra por llamada, pero elimina esa clase de error de raíz.
    return auth.currentUser.getIdToken(true);
  };

  return (
    <AuthContext.Provider
      value={{ user, initializing, loginWithEmail, resetPassword, loginWithGoogle, loginWithApple, registerWithEmail, logout, getIdToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
