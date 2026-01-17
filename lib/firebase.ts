// app/lib/firebase.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// 🔹 Auth con persistencia:
// En web usamos getAuth; en móvil intentamos usar persistencia con AsyncStorage si el módulo está disponible.
let authInstance: ReturnType<typeof getAuth>;
if (Platform.OS === "web") {
  authInstance = getAuth(app);
} else {
  let getRNPersist: any = undefined;
  try {
    // Cargar en runtime para evitar fallos de bundling si el submódulo no existe
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rnAuth = require("firebase/auth/react-native");
    getRNPersist = rnAuth?.getReactNativePersistence;
  } catch { }
  if (typeof getRNPersist === "function") {
    authInstance = initializeAuth(app, {
      persistence: getRNPersist(AsyncStorage as any),
    });
  } else {
    authInstance = getAuth(app);
  }
}

export const auth = authInstance;

// 🔹 Firestore
export const db = getFirestore(app);

// 🔹 Storage
export const storage = getStorage(app);
