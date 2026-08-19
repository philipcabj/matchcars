// app/contexts/AuthContext.tsx
import { logger } from "@/lib/logger";
import React, {
    ReactNode,
    createContext,
    useContext,
    useEffect,
    useState,
} from "react";

import * as Facebook from "expo-auth-session/providers/facebook";
import * as WebBrowser from "expo-web-browser";

import { ONBOARDING_KEY } from "@/components/Onboarding";
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { getMaxCars, getMonthlyFeaturedAllowance, hasUnlimitedFeatured } from "@/lib/planChecks";
import { getAvatarColorFromEmail } from "@/utils/avatarUtils";
import { TrustLevel } from "@/types/commerce";
import { SubscriptionPlan, UserProfile, UserRole } from "@/types/user";
import { Timestamp, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, increment, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { Platform } from "react-native";

let AppleAuthentication: any = null;
if (Platform.OS !== 'web') {
    try {
        AppleAuthentication = require("expo-apple-authentication");
    } catch (e) {
        logger.warn("AppleAuthentication module not found");
    }
}

WebBrowser.maybeCompleteAuthSession(); // Cierra bien el flujo OAuth

export { SubscriptionPlan, UserProfile, UserRole };

// Shape of a user document as stored in Firestore
interface FirestoreUserDoc extends Partial<UserProfile> {
  isPro?: boolean;
  displayName?: string;
  notificationsLastSeenAt?: unknown;
  notificationsClearedAt?: unknown;
  seenLikesCount?: number;
  seenMatchesCount?: number;
  hideHomeRecentlyViewed?: boolean;
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  /**
   * uid a usar como `userId` al crear/publicar un auto — el propio uid,
   * salvo que la cuenta sea miembro invitado de una agencia del Portal
   * (agencyMemberships/{uid}, ver portal/src/lib/agency-server.ts), en cuyo
   * caso es el uid del dueño de esa agencia. Antes de esto, un vendedor
   * invitado que publicaba desde la app quedaba con userId = su propio uid,
   * así que el auto (y cualquier lead que le hicieran) no aparecía en el
   * Portal del dueño (que filtra todo por su propio uid). null mientras se
   * resuelve al loguearse.
   */
  agencyId: string | null;
  /**
   * Perfil bajo el que se publica — el propio `profile` si no es miembro de
   * ninguna agencia, o el perfil del dueño (plan, agencyName, trustLevel) si
   * lo es. Usar esto (no `profile`) para decidir límites de plan, nombre de
   * vendedor y demás campos que van al documento del auto.
   */
  sellerProfile: UserProfile | null;
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


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<UserProfile | null>(null);
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

        // Resuelve una sola vez por sesión si esta cuenta es miembro
        // invitado de una agencia del Portal — no hace falta que sea en
        // tiempo real, agencyMemberships casi nunca cambia mientras la app
        // está abierta.
        getDoc(doc(db, "agencyMemberships", firebaseUser.uid))
          .then(async (memSnap) => {
            if (!memSnap.exists()) {
              setAgencyId(firebaseUser.uid);
              setOwnerProfile(null);
              return;
            }
            const ownerUid = memSnap.data().agencyId as string;
            setAgencyId(ownerUid);
            const ownerSnap = await getDoc(doc(db, "users", ownerUid));
            if (ownerSnap.exists()) {
              const data = ownerSnap.data() as FirestoreUserDoc;
              setOwnerProfile({
                ...data,
                id: ownerUid,
                plan: data.plan || (data.isPro ? "pro_monthly" : "free"),
              } as UserProfile);
            }
          })
          .catch(() => {
            setAgencyId(firebaseUser.uid);
            setOwnerProfile(null);
          });

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
            const data = snap.data() as FirestoreUserDoc;
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
        setAgencyId(null);
        setOwnerProfile(null);
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
          logger.warn("Auth initialization timed out. Forcing app load.");
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
        logger.log("Subscription expired, downgrading to free...");
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
      logger.log("🔥 ERROR LOGIN:", error.code, error.message);

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
        const data = snap.data() as FirestoreUserDoc;
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
        const data = snap.data() as FirestoreUserDoc;
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
        const data = snap.data() as FirestoreUserDoc;
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
    try {
        await AsyncStorage.removeItem(ONBOARDING_KEY);
    } catch (e) {
        console.error("Error clearing onboarding status:", e);
    }
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
      const updatePayload: Partial<FirestoreUserDoc> & { isPro: boolean; cancelAtPeriodEnd: boolean } = {
        plan,
        isPro: plan !== "free",
        cancelAtPeriodEnd: false,
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

      // 2. Actualizar vehículos según nuevo plan
      const q = query(collection(db, "vehicles"), where("userId", "==", user.uid));
      const querySnapshot = await getDocs(q);

      const oldPlan = profile.plan || "free";
      const newMaxCars = getMaxCars(plan);
      const newFeaturedLimit = getMonthlyFeaturedAllowance(plan);
      const EXCLUDED = ["deleted", "rejected", "rejected_limit", "blocked", "sold"];

      // Clasificar vehículos por estado
      const activeDocs = querySnapshot.docs.filter(d => !EXCLUDED.includes(d.data().status || "available"));
      const rejectedLimitDocs = querySnapshot.docs.filter(d => d.data().status === "rejected_limit");
      const featuredDocs = querySnapshot.docs
        .filter(d => d.data().isFeatured === true)
        .sort((a, b) => (a.data().featuredAt?.seconds || 0) - (b.data().featuredAt?.seconds || 0)); // más antiguos primero

      // a) Actualizar userPlan en todos los vehículos
      querySnapshot.forEach((docSnap) => {
        const updateData: Record<string, unknown> = { userPlan: plan };

        // b) Dealer: destacar todos automáticamente
        if (hasUnlimitedFeatured(plan)) {
          updateData.isFeatured = true;
          updateData.featuredAt = serverTimestamp();
        }

        // c) Bajar a free o a un plan que no tenga featured ilimitado
        // si venía de dealer (featured ilimitado) → quitar featured a todos
        if (hasUnlimitedFeatured(oldPlan) && !hasUnlimitedFeatured(plan)) {
          updateData.isFeatured = false;
        }

        // d) Bajar a free → quitar featured a todos
        if (plan === "free") {
          updateData.isFeatured = false;
        }

        batch.update(docSnap.ref, updateData);
      });

      // e) Downgrade de featured: si el nuevo plan tiene límite finito y hay más de los permitidos,
      //    quitar featured a los más recientes (se conservan los que llevan más tiempo activos)
      if (newFeaturedLimit !== Infinity && featuredDocs.length > newFeaturedLimit) {
        for (let i = newFeaturedLimit; i < featuredDocs.length; i++) {
          batch.update(featuredDocs[i].ref, { isFeatured: false });
        }
      }

      // f) Upgrade: restaurar vehículos con rejected_limit hasta el nuevo cupo
      if (newMaxCars > getMaxCars(oldPlan) || newMaxCars === Infinity) {
        const slots = newMaxCars === Infinity ? Infinity : newMaxCars - activeDocs.length;
        let restored = 0;
        for (const rejDoc of rejectedLimitDocs) {
          if (restored >= slots) break;
          batch.update(rejDoc.ref, {
            status: "pending_review",
            published: false,
            rejectedReason: null,
          });
          restored++;
        }
      }

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
        // PRO Plan (any non-free) OR Sales >= 3
        const isPro = !!profile.plan && profile.plan !== 'free';
        if (isPro) {
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
    agencyId,
    sellerProfile: ownerProfile ?? profile,
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
