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
import { TrustLevel } from "@/types/commerce";
import { SubscriptionPlan, UserProfile, UserRole } from "@/types/user";
import { Timestamp, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, increment, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { Platform } from "react-native";

let AppleAuthentication: any = null;
if (Platform.OS !== 'web') {
    try {
        AppleAuthentication = require("expo-apple-authentication");
    } catch (e) {
        console.warn("AppleAuthentication module not found");
    }
}

WebBrowser.maybeCompleteAuthSession(); // Cierra bien el flujo OAuth

export { SubscriptionPlan, UserProfile, UserRole };

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
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginWithFacebook: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  acceptTerms: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  updatePlan: (plan: SubscriptionPlan, billingCycle?: "monthly" | "annual", customExpirationDate?: Date) => Promise<void>; // Deprecated: Use RevenueCat logic
  cancelSubscription: () => Promise<void>; // Deprecated: Use RevenueCat logic
  refreshTrustLevel: () => Promise<void>;
  blockUser: (userIdToBlock: string) => Promise<void>;
  unblockUser: (userIdToUnblock: string) => Promise<void>;
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
    let unsubProfile: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      // Clean up previous profile listener if any
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = undefined;
      }

      if (firebaseUser) {
        const ref = doc(db, "users", firebaseUser.uid);
        
        // Update login count logic
        getDoc(ref).then((snap) => {
            if (snap.exists()) {
                const data = snap.data();
                const lastLogin = data.lastLoginAt?.toDate ? data.lastLoginAt.toDate() : (data.lastLoginAt ? new Date(data.lastLoginAt) : new Date(0));
                const now = new Date();
                const hoursDiff = (now.getTime() - lastLogin.getTime()) / (1000 * 3600);
                
                if (hoursDiff > 1) {
                    updateDoc(ref, { 
                        loginCount: increment(1),
                        lastLoginAt: serverTimestamp()
                    }).catch(err => console.error("Error updating login stats", err));
                }
            }
        });

        // Escuchar cambios en el perfil en tiempo real
        unsubProfile = onSnapshot(ref, (snap) => {
          if (snap.exists()) {
            const data = snap.data() as any;
            setProfile({ 
              ...data, 
              id: firebaseUser.uid,
              plan: data.plan || (data.isPro ? "pro_monthly" : "free") // Migración segura
            });
          } else {
            // Fallback para usuarios sin documento en firestore (edge case)
            const email = (firebaseUser.email ?? "").trim().toLowerCase();
            const fallbackInitials = email.length >= 2 ? email.slice(0, 2).toUpperCase() : "MC";
            setProfile({
              id: firebaseUser.uid,
              firstName: "",
              lastName: "",
              email,
              role: "user",
              plan: "free",
              initials: fallbackInitials,
              avatarColor: getAvatarColorFromEmail(email),
              acceptedTerms: false,
              trustLevel: "new",
              salesCount: 0,
              loginCount: 1,
            });
          }
          setInitializing(false);
        }, (error) => {
            console.error("Profile snapshot error:", error);
            setInitializing(false);
        });
      } else {
        setProfile(null);
        setInitializing(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  // Safety Timeout for Auth Initialization (fix for iOS Web hanging)
  useEffect(() => {
      if (!initializing) return;
      const timer = setTimeout(() => {
          console.warn("Auth initialization timed out. Forcing app load.");
          setInitializing(false);
      }, 4000); // 4 seconds timeout
      return () => clearTimeout(timer);
  }, [initializing]);

  // Check for subscription expiration
  useEffect(() => {
    const checkSubscriptionStatus = async () => {
      if (!user || !profile || !profile.nextBillingDate || !profile.cancelAtPeriodEnd) return;

      const now = new Date();
      const nextBill = profile.nextBillingDate.toDate ? profile.nextBillingDate.toDate() : new Date(profile.nextBillingDate);

      if (now > nextBill) {
        console.log("Subscription expired, downgrading to free...");
        await updatePlan("free");
      }
    };

    checkSubscriptionStatus();
  }, [user, profile]);

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
      plan: "free",
      initials,
      avatarColor,
      acceptedTerms: acceptedTerms === true,
      trustLevel: "new",
      salesCount: 0,
      loginCount: 1,
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
        const data = snap.data() as any;
        setProfile({ 
          ...data, 
          id: fbUser.uid,
          plan: data.plan || (data.isPro ? "pro_monthly" : "free")
        });
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
          plan: "free",
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
          plan: "free",
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
        const data = snap.data() as any;
        setProfile({ 
          ...data, 
          id: fbUser.uid,
          plan: data.plan || (data.isPro ? "pro_monthly" : "free")
        });
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
          plan: "free",
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
        const data = snap.data() as any;
        setProfile({ 
          ...data, 
          id: aUser.uid,
          plan: data.plan || (data.isPro ? "pro_monthly" : "free")
        });
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

  const updatePlan = async (plan: SubscriptionPlan, billingCycle: "monthly" | "annual" = "monthly", customExpirationDate?: Date) => {
    if (!user || !profile) return;
    try {
      const batch = writeBatch(db);

      // Calcular fechas
      let subDate = null;
      let nextBill = null;
      
      if (plan !== "free") {
        const now = new Date();
        subDate = Timestamp.fromDate(now);
        
        if (customExpirationDate) {
          nextBill = Timestamp.fromDate(customExpirationDate);
        } else {
          const next = new Date(now);
          if (billingCycle === "monthly") {
            next.setDate(next.getDate() + 30);
          } else {
            next.setDate(next.getDate() + 365);
          }
          nextBill = Timestamp.fromDate(next);
        }
      }

      // 1. Actualizar perfil de usuario
      const userRef = doc(db, "users", user.uid);
      const updatePayload: any = { 
        plan, 
        isPro: plan !== "free",
        cancelAtPeriodEnd: false // Resetear cancelación al cambiar de plan
      };
      
      if (plan !== "free") {
        updatePayload.subscriptionDate = subDate;
        updatePayload.nextBillingDate = nextBill;
      } else {
        // Si es free, limpiamos fechas (o las dejamos como histórico, pero para lógica activa mejor limpiar)
        updatePayload.subscriptionDate = null;
        updatePayload.nextBillingDate = null;
      }

      batch.set(userRef, updatePayload, { merge: true });

      // 2. Actualizar vehículos
      const q = query(collection(db, "vehicles"), where("userId", "==", user.uid));
      const querySnapshot = await getDocs(q);
      
      const shouldFeatureAll = plan.startsWith("pro_dealer");
      const shouldUnfeatureAll = plan === "free";
      
      querySnapshot.forEach((doc) => {
        const updateData: any = { userPlan: plan };
        
        if (shouldFeatureAll) {
          updateData.isFeatured = true;
          updateData.featuredAt = serverTimestamp();
        } else if (shouldUnfeatureAll) {
          updateData.isFeatured = false;
        }
        
        batch.update(doc.ref, updateData);
      });

      await batch.commit();

      // Actualizar estado local
      setProfile({ 
        ...profile, 
        plan, 
        subscriptionDate: subDate,
        nextBillingDate: nextBill,
        cancelAtPeriodEnd: false
      });
    } catch (error) {
      console.error("Error al actualizar plan:", error);
      throw error;
    }
  };

  const cancelSubscription = async () => {
    if (!user || !profile) return;
    try {
      // No bajamos a free inmediatamente, solo marcamos el flag
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { cancelAtPeriodEnd: true });
      setProfile({ ...profile, cancelAtPeriodEnd: true });
    } catch (error) {
      console.error("Error al cancelar suscripción:", error);
      throw error;
    }
  };

  const refreshTrustLevel = async () => {
    if (!user || !profile) return;
    try {
        const vehiclesRef = collection(db, "vehicles");
        const q = query(vehiclesRef, where("userId", "==", user.uid));
        const snap = await getDocs(q);
        const publishedCount = snap.size;

        const createdAt = profile.createdAt?.toDate ? profile.createdAt.toDate() : (profile.createdAt ? new Date(profile.createdAt) : new Date());
        const daysSinceRegistration = (new Date().getTime() - createdAt.getTime()) / (1000 * 3600 * 24);

        let newLevel: TrustLevel = "new";

        // Logic: Active (Frecuente)
        // Registered > 7 days, Logins > 5, (Published >= 1 OR Has Photo)
        const hasPhoto = !!profile.photoURL;
        if (daysSinceRegistration >= 7 && (profile.loginCount || 0) >= 5 && (publishedCount >= 1 || hasPhoto)) {
            newLevel = "active";
        }

        // Logic: Verified
        // PRO Plan OR Sales >= 3
        if (profile.plan !== 'free') {
            newLevel = "verified";
        } else if ((profile.salesCount || 0) >= 3) {
            newLevel = "verified";
        }

        if (newLevel !== profile.trustLevel) {
            await updateDoc(doc(db, "users", user.uid), { trustLevel: newLevel });
        }
    } catch (e) {
        console.error("Error refreshing trust level:", e);
    }
  };

  const blockUser = async (userIdToBlock: string) => {
    if (!user) return;
    try {
        const userRef = doc(db, "users", user.uid);
        // Usamos arrayUnion para agregar el ID a la lista sin duplicados
        await updateDoc(userRef, {
            blockedUsers: arrayUnion(userIdToBlock)
        });
        // Actualizamos estado local optimista
        if (profile) {
            setProfile({
                ...profile,
                blockedUsers: [...(profile.blockedUsers || []), userIdToBlock]
            });
        }
    } catch (e) {
        console.error("Error blocking user:", e);
        throw e;
    }
  };

  const unblockUser = async (userIdToUnblock: string) => {
    if (!user) return;
    try {
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, {
            blockedUsers: arrayRemove(userIdToUnblock)
        });
        if (profile) {
            setProfile({
                ...profile,
                blockedUsers: (profile.blockedUsers || []).filter(id => id !== userIdToUnblock)
            });
        }
    } catch (e) {
        console.error("Error unblocking user:", e);
        throw e;
    }
  };

  const value = {
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
    updatePlan,
    cancelSubscription,
    refreshTrustLevel,
    blockUser,
    unblockUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
