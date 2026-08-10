// portal/src/contexts/AuthContext.tsx
"use client";

import { getAvatarColorFromEmail } from "@/lib/avatar-color";
import { auth, db } from "@/lib/firebase-client";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
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
  /**
   * Solo se usa desde /invite/[id] (aceptar una invitación de equipo) — no
   * hay un registro público general en el portal todavía. Mismo shape de
   * users/{uid} que registerWithEmail en contexts/AuthContext.tsx (raíz),
   * para no crear una cuenta "incompleta" a ojos del resto de la app.
   */
  registerWithEmail: (params: RegisterParams) => Promise<void>;
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

  const loginWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
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
  };

  const logout = async () => {
    await signOut(auth);
  };

  const getIdToken = async () => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  };

  return (
    <AuthContext.Provider value={{ user, initializing, loginWithEmail, registerWithEmail, logout, getIdToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
