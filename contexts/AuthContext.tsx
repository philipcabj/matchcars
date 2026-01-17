// app/contexts/AuthContext.tsx
import React, {
    ReactNode,
    createContext,
    useContext,
    useEffect,
    useState,
} from "react";

import * as Facebook from "expo-auth-session/providers/facebook";
import * as WebBrowser from "expo-web-browser";

import {
    FacebookAuthProvider,
    GoogleAuthProvider,
    OAuthProvider,
    User,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    sendPasswordResetEmail,
    signInWithCredential,
    signInWithEmailAndPassword,
    signOut
} from "firebase/auth";

import { auth, db } from "@/lib/firebase";
import * as AppleAuthentication from "expo-apple-authentication";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { Platform } from "react-native";

WebBrowser.maybeCompleteAuthSession(); // Cierra bien el flujo OAuth

type Role = "user" | "moderator" | "admin";

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  initials: string;
  avatarColor: string;
  createdAt?: any;
  acceptedTerms?: boolean;
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  initializing: boolean;
  registerWithEmail: (params: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    acceptedTerms?: boolean;
  }) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;   // ✔️ CORREGIDO
  loginWithFacebook: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  acceptTerms: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AVATAR_COLORS = [
  "#FF6B6B",
  "#FFB347",
  "#F9D66B",
  "#4ECDC4",
  "#1B9CFC",
  "#A66DD4",
  "#FF7F50",
];

function getAvatarColorFromEmail(email: string): string {
  if (!email) return AVATAR_COLORS[0];
  let sum = 0;
  for (let i = 0; i < email.length; i++) {
    sum += email.charCodeAt(i);
  }
  const index = sum % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);

  const [fbRequest, fbResponse, fbPromptAsync] = Facebook.useAuthRequest(
    React.useMemo(
      () => ({
        clientId: process.env.EXPO_PUBLIC_FACEBOOK_APP_ID || "1234567890", // Fallback to avoid crash
        iosClientId: process.env.EXPO_PUBLIC_FACEBOOK_APP_ID || "1234567890", // Required for iOS
        webClientId:
          process.env.EXPO_PUBLIC_FACEBOOK_WEB_CLIENT_ID ??
          process.env.EXPO_PUBLIC_FACEBOOK_APP_ID ??
          "dev-fb-client-id",
      }),
      []
    )
  );


  // Escuchar cambios de sesión (Firebase Auth)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setInitializing(false);
      try {
        if (firebaseUser) {
          const ref = doc(db, "users", firebaseUser.uid);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            const data = snap.data() as UserProfile;
            setProfile({ ...data, id: firebaseUser.uid });
          } else {
            const email = (firebaseUser.email ?? "").trim().toLowerCase();
            const fallbackInitials =
              email.length >= 2 ? email.slice(0, 2).toUpperCase() : "MC";
            const minimalProfile: UserProfile = {
              id: firebaseUser.uid,
              firstName: "",
              lastName: "",
              email,
              role: "user",
              initials: fallbackInitials,
              avatarColor: getAvatarColorFromEmail(email),
              acceptedTerms: false,
            };
            setProfile(minimalProfile);
          }
        } else {
          setProfile(null);
        }
      } catch (e) {
        setProfile(null);
      }
    });
    return () => unsub();
  }, []);

  // Registro con email
  const registerWithEmail = async ({
    firstName,
    lastName,
    email,
    password,
    acceptedTerms,
  }: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    acceptedTerms?: boolean;
  }) => {
    const cleanEmail = email.trim().toLowerCase();

    const cred = await createUserWithEmailAndPassword(
      auth,
      cleanEmail,
      password
    );
    const uid = cred.user.uid;

    const initials =
      `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase().trim() || "MC";

    const avatarColor = getAvatarColorFromEmail(cleanEmail);

    const userProfile: UserProfile = {
      id: uid,
      firstName,
      lastName,
      email: cleanEmail,
      role: "user",
      initials,
      avatarColor,
      acceptedTerms: acceptedTerms === true,
    };

    await setDoc(doc(db, "users", uid), {
      ...userProfile,
      acceptedTerms: acceptedTerms === true,
      createdAt: serverTimestamp(),
      provider: "password",
    });

    setProfile(userProfile);
  };

  // Login con email
  const loginWithEmail = async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();

    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);
      // onAuthStateChanged actualiza profile
    } catch (error: any) {
      console.log("🔥 ERROR LOGIN:", error.code, error.message);

      if (
        error.code === "auth/invalid-credential" ||
        error.code === "auth/invalid-login-credentials" ||
        error.code === "auth/wrong-password" ||
        error.code === "auth/user-not-found"
      ) {
        throw new Error(
          "Credenciales inválidas. Revisá el correo y la contraseña."
        );
      }

      if (error.code === "auth/operation-not-allowed") {
        throw new Error(
          "El método Email/Password no está habilitado. Activalo en Firebase Auth."
        );
      }

      if (error.code === "auth/network-request-failed") {
        throw new Error(
          "Fallo de red. Verificá tu conexión e intentá de nuevo."
        );
      }

      if (error.code === "auth/too-many-requests") {
        throw new Error(
          "Demasiados intentos fallidos. Esperá unos minutos y volvé a intentar."
        );
      }

      throw new Error("Ocurrió un error al iniciar sesión. Intentalo de nuevo.");
    }
  };

  // Login con Google (recibe idToken desde login.tsx)
  const loginWithGoogle = async (idToken: string) => {
    try {
      if (!idToken) {
        throw new Error("No se recibió el token de Google.");
      }

      // Convertir idToken en credencial de Firebase
      const credential = GoogleAuthProvider.credential(idToken);
      const userCred = await signInWithCredential(auth, credential);
      const fbUser = userCred.user;

      const ref = doc(db, "users", fbUser.uid);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        // Usuario ya registrado
        const data = snap.data() as UserProfile;
        setProfile({ ...data, id: fbUser.uid });
      } else {
        // Primer login Google
        const email = (fbUser.email ?? "").trim().toLowerCase();
        const displayName = fbUser.displayName ?? "";
        const parts = displayName.split(" ");
        const firstName = parts[0] ?? "";
        const lastName = parts.slice(1).join(" ") ?? "";

        const initialsRaw =
          (firstName[0] ?? "") + (lastName[0] ?? "");
        const initials =
          initialsRaw.trim().length > 0
            ? initialsRaw.toUpperCase()
            : email.slice(0, 2).toUpperCase() || "MC";

        const avatarColor = getAvatarColorFromEmail(email);

        const userProfile: UserProfile = {
          id: fbUser.uid,
          firstName,
          lastName,
          email,
          role: "user",
          initials,
          avatarColor,
          acceptedTerms: false,
        };

        await setDoc(ref, {
          ...userProfile,
          acceptedTerms: false,
          createdAt: serverTimestamp(),
          provider: "google",
        });

        setProfile(userProfile);
      }
    } catch (error) {
      console.error("Error en login con Google:", error);
      throw error;
    }
  };

  const loginWithFacebook = async () => {
    try {
      if (!fbRequest) {
        throw new Error("Facebook Auth no está listo o no está configurado.");
      }
      const result = await fbPromptAsync();
      if (result.type !== "success" || !result.authentication?.accessToken) {
        return;
      }
      const credential = FacebookAuthProvider.credential(result.authentication.accessToken);
      const userCred = await signInWithCredential(auth, credential);
      const fbUser = userCred.user;
      const ref = doc(db, "users", fbUser.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        const email = (fbUser.email ?? "").trim().toLowerCase();
        const displayName = fbUser.displayName ?? "";
        const parts = displayName.split(" ");
        const firstName = parts[0] ?? "";
        const lastName = parts.slice(1).join(" ") ?? "";
        const initialsRaw = (firstName[0] ?? "") + (lastName[0] ?? "");
        const initials = initialsRaw.trim().length > 0 ? initialsRaw.toUpperCase() : email.slice(0, 2).toUpperCase() || "MC";
        const avatarColor = getAvatarColorFromEmail(email);
        const userProfile: UserProfile = {
          id: fbUser.uid,
          firstName,
          lastName,
          email,
          role: "user",
          initials,
          avatarColor,
          acceptedTerms: false,
        };
        await setDoc(ref, {
          ...userProfile,
          acceptedTerms: false,
          createdAt: serverTimestamp(),
          provider: "facebook",
        });
        setProfile(userProfile);
      } else {
        const data = snap.data() as UserProfile;
        setProfile({ ...data, id: fbUser.uid });
      }
    } catch (error) {
      console.error("Error en login con Facebook:", error);
      throw error;
    }
  };

  const loginWithApple = async () => {
    try {
      if (Platform.OS !== "ios") {
        throw new Error("Apple Sign In solo está disponible en iOS.");
      }

      const result = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      const idToken = (result as any)?.identityToken;
      if (!idToken) {
        throw new Error("No se obtuvo identityToken de Apple.");
      }

      const provider = new OAuthProvider("apple.com");
      const credential = provider.credential({ idToken });
      const userCred = await signInWithCredential(auth, credential);
      const aUser = userCred.user;

      const ref = doc(db, "users", aUser.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        const email = (aUser.email ?? "").trim().toLowerCase();
        const firstName = result.fullName?.givenName ?? "";
        const lastName = result.fullName?.familyName ?? "";
        const initialsRaw = (firstName[0] ?? "") + (lastName[0] ?? "");
        const initials = initialsRaw.trim().length > 0 ? initialsRaw.toUpperCase() : email.slice(0, 2).toUpperCase() || "MC";
        const avatarColor = getAvatarColorFromEmail(email);
        const userProfile: UserProfile = {
          id: aUser.uid,
          firstName,
          lastName,
          email,
          role: "user",
          initials,
          avatarColor,
          acceptedTerms: false,
        };
        await setDoc(ref, {
          ...userProfile,
          acceptedTerms: false,
          createdAt: serverTimestamp(),
          provider: "apple",
        });
        setProfile(userProfile);
      } else {
        const data = snap.data() as UserProfile;
        setProfile({ ...data, id: aUser.uid });
      }
    } catch (error) {
      console.error("Error en login con Apple:", error);
      throw error;
    }
  };

  const acceptTerms = async () => {
    if (!user) return;
    const ref = doc(db, "users", user.uid);
    await setDoc(ref, { acceptedTerms: true }, { merge: true });
    setProfile((prev) => (prev ? { ...prev, acceptedTerms: true } : prev));
  };

  const resetPassword = async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    await sendPasswordResetEmail(auth, cleanEmail);
  };

  // Logout
  const logout = async () => {
    await signOut(auth);
  };

  // Eliminar cuenta: borra publicaciones, favoritos y el documento de usuario. Luego intenta borrar el usuario de Auth.
  const deleteAccount = async () => {
    if (!user) return;
    const uid = user.uid;

    try {
      // Eliminar vehículos del usuario
      const q = query(collection(db, "vehicles"), where("userId", "==", uid));
      const vs = await getDocs(q);
      const vehicleDeletes: Promise<void>[] = [];
      vs.forEach((d) => {
        vehicleDeletes.push(deleteDoc(doc(db, "vehicles", d.id)));
      });
      await Promise.all(vehicleDeletes);

      // Eliminar favoritos del subcolección
      const favSnap = await getDocs(collection(db, "users", uid, "favorites"));
      const favDeletes: Promise<void>[] = [];
      favSnap.forEach((d) => {
        favDeletes.push(deleteDoc(doc(db, "users", uid, "favorites", d.id)));
      });
      await Promise.all(favDeletes);

      // Eliminar documento de usuario
      await deleteDoc(doc(db, "users", uid));

      // Borrar cuenta de autenticación
      try {
        // Algunos proveedores requieren reautenticación reciente; si falla, al menos cerramos sesión
        await (user as any).delete?.();
      } catch (e) {
        await signOut(auth);
      }
    } catch (e) {
      // En caso de error, no lanzamos para no romper la app; el caller puede mostrar mensaje
      throw e as any;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        initializing,
        registerWithEmail,
        loginWithEmail,
        loginWithGoogle,
        loginWithFacebook,
        loginWithApple,
        acceptTerms,
        resetPassword,
        logout,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
