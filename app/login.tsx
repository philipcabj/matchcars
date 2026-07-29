import { CustomAlert } from "@/components/CustomAlert";
import type { Theme } from "@/config/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { getAvatarColorFromEmail } from "@/utils/avatarUtils";
import { getAuthErrorMessage } from "@/utils/firebaseErrors";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    Image,
    Keyboard,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { auth, db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import {
    GoogleAuthProvider,
    signInWithCredential,
} from "firebase/auth";

let GoogleSignin: any = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    GoogleSignin = require("@react-native-google-signin/google-signin").GoogleSignin;
  } catch {
    logger.log("GoogleSignin module not found. Check if you are running in Expo Go.");
  }
}

// Necesario para completar el flujo en Expo Go
WebBrowser.maybeCompleteAuthSession();

const appLogo = require("@/assets/images/icon.png");


export default function LoginScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const router = useRouter();
  const { loginWithEmail, loginWithApple, resetPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{ visible: boolean; title: string; message: string; type: "error" | "success" | "info" | "warning" }>({ visible: false, title: "", message: "", type: "info" });

  const showAlert = (title: string, message: string, type: "error" | "success" | "info" | "warning" = "error") => {
    setAlertConfig({ visible: true, title, message, type });
  };

  const hideAlert = () => {
    setAlertConfig((prev) => ({ ...prev, visible: false }));
  };

  // ⚙️ CONFIG GOOGLE
  useEffect(() => {
    if (GoogleSignin) {
        GoogleSignin.configure({
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        offlineAccess: false,
        });
    }
  }, []);

  // 🔑 Login email/password
  const handleEmailLogin = async () => {
    try {
      if (!email || !password) {
        showAlert("Campos incompletos", "Completá email y contraseña.", "info");
        return;
      }

      setLoadingEmail(true);
      await loginWithEmail(email.trim(), password);
      router.replace("/(tabs)");
    } catch (error: any) {
      // console.error("Error login email:", error);
      showAlert(
        "Error",
        getAuthErrorMessage(error?.code),
        "error"
      );
    } finally {
      setLoadingEmail(false);
    }
  };

  const handleForgotPassword = async () => {
    try {
      if (!email) {
        showAlert("Ingresá tu email", "Necesitamos tu correo para enviarte el enlace de recuperación.", "info");
        return;
      }
      await resetPassword(email);
      showAlert("Enlace enviado", "Revisá tu correo para restablecer la contraseña.", "success");
    } catch (error: any) {
      // console.error("Error reset password:", error);
      showAlert("Error", getAuthErrorMessage(error?.code), "error");
    }
  };

  // ▶️ Botón Google
  const handleGooglePress = async () => {    
    if (!GoogleSignin) {
        showAlert("No disponible", "Google Sign-In requiere una Development Build (no funciona en Expo Go estándar).", "warning");
        return;
    }
    try {
      setLoadingGoogle(true);

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo: any = await GoogleSignin.signIn();

      const idToken = userInfo.data?.idToken || userInfo.idToken;
      if (!idToken) {
        showAlert("Error", "No se recibió el token de Google.", "error");
        return;
      }

      const credential = GoogleAuthProvider.credential(idToken);
      const credResult = await signInWithCredential(auth, credential);
      const firebaseUser = credResult.user;

      const userRef = doc(db, "users", firebaseUser.uid);
      const snap = await getDoc(userRef);

      let needsTerms = false;

      if (!snap.exists()) {
        const email = (firebaseUser.email ?? "").trim().toLowerCase();
        const displayName = firebaseUser.displayName ?? "";
        const [firstName = "", lastName = ""] = displayName.split(" ");

        const initialsRaw =
          (firstName[0] ?? "") + (lastName[0] ?? "");
        const initials =
          initialsRaw.trim().length > 0
            ? initialsRaw.toUpperCase()
            : email.slice(0, 2).toUpperCase() || "MC";

        const avatarColor = getAvatarColorFromEmail(email);

        await setDoc(userRef, {
          firstName,
          lastName,
          email,
          role: "user",
          initials,
          avatarColor,
          acceptedTerms: false,
          provider: "google",
          createdAt: serverTimestamp(),
        });
        needsTerms = true;
      } else {
        // Si ya existe, verificamos si aceptó términos
        const data = snap.data();
        if (data?.acceptedTerms !== true) {
            needsTerms = true;
        }
      }

      if (needsTerms) {
        router.replace("/terms");
      } else {
        router.replace("/(tabs)");
      }

    } catch (error: any) {
        if (error.code === 'STATUS_CANCELLED') {
            // Usuario canceló
        } else {
            console.error("Google Sign-In Error:", error);
            showAlert("Error Google", "No se pudo iniciar sesión con Google. Intentá nuevamente.", "error");
        }
    } finally {
      setLoadingGoogle(false);
    }
  };


  return (
    <SafeAreaView style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.content}>
          <View style={{ alignItems: "center", marginBottom: 24 }}>
            <Image
              source={appLogo}
              style={{ width: 104, height: 104, borderRadius: 52 }}
              resizeMode="cover"
            />
            <Text style={styles.appTitle}>MATCHCARS</Text>
            <Text style={styles.subtitle}>
              Iniciá sesión para empezar a matchear autos 🚗
            </Text>
          </View>

        {/* Login por email */}
        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="tu@email.com"
            placeholderTextColor={theme.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
          />

          {/* Contraseña */}
          <Text style={styles.label}>Contraseña</Text>
          <View style={[styles.input, { flexDirection: "row", alignItems: "center", paddingVertical: 0 }]}>
            <TextInput
              style={{ flex: 1, color: theme.inputText, paddingVertical: 10 }}
              placeholder="••••••"
              placeholderTextColor={theme.textMuted}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 10, justifyContent: 'center' }}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleEmailLogin}
            disabled={loadingEmail}
          >
            <Text style={styles.primaryButtonText}>
              {loadingEmail ? "Ingresando..." : "Iniciar sesión"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/register")}
            style={styles.linkButton}
          >
            <Text style={styles.linkText}>
              ¿No tenés cuenta?{" "}
              <Text style={styles.linkTextBold}>Registrate</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleForgotPassword}
            style={styles.linkButton}
          >
            <Text style={styles.linkText}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>
        </View>

        {/* Separador */}
        <View style={styles.separatorRow}>
          <View style={styles.separatorLine} />
          <Text style={styles.separatorText}>o continuá con</Text>
          <View style={styles.separatorLine} />
        </View>

        {/* Botón Google */}
        <TouchableOpacity
          style={[styles.googleButton, { flexDirection: "row", justifyContent: "center", gap: 10 }]}
          onPress={handleGooglePress}
          disabled={loadingGoogle}
        >
          <Ionicons name="logo-google" size={20} color="#111827" />
          <Text style={styles.googleButtonText}>
            {loadingGoogle
              ? "Conectando..."
              : "Continuar con Google"}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 12 }} />
        {Platform.OS === "ios" && !Platform.isPad && (
          <TouchableOpacity
            style={[styles.googleButton, { flexDirection: "row", justifyContent: "center", gap: 10 }]}
            onPress={() => {
              loginWithApple().catch((e) => {
                if (e?.code === 'ERR_REQUEST_CANCELED') return;
                showAlert("Error", "No se pudo iniciar con Apple.", "error");
              });
            }}
          >
            <Ionicons name="logo-apple" size={20} color="#111827" />
            <Text style={styles.googleButtonText}>Continuar con Apple</Text>
          </TouchableOpacity>
        )}
        {/* Facebook temporalmente deshabilitado
        <View style={{ height: 8 }} />
        <TouchableOpacity
          style={styles.googleButton}
          onPress={() => {
            loginWithFacebook().catch((e) => showAlert("Error", getAuthErrorMessage(e?.code) || e.message, "error"));
          }}
        >
          <Text style={styles.googleButtonText}>Continuar con Facebook</Text>
        </TouchableOpacity>
        */}
      </View>
      </TouchableWithoutFeedback>
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={hideAlert}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 40,
    },
    appTitle: {
      fontSize: 28,
      fontWeight: "800",
      color: theme.title,
      textAlign: "center",
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: theme.textMuted,
      textAlign: "center",
      marginBottom: 24,
    },
    form: {
      marginTop: 8,
      marginBottom: 24,
    },
    label: {
      fontSize: 13,
      color: theme.textMuted,
      marginBottom: 4,
    },
    input: {
      backgroundColor: theme.inputBackground,
      color: theme.inputText,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
    },
    primaryButton: {
      backgroundColor: theme.buttonBackground,
      borderRadius: 999,
      paddingVertical: 12,
      alignItems: "center",
      marginTop: 4,
    },
    primaryButtonText: {
      color: theme.buttonText,
      fontWeight: "700",
      fontSize: 15,
    },
    linkButton: {
      marginTop: 10,
      alignItems: "center",
    },
    linkText: {
      color: theme.textMuted,
      fontSize: 13,
    },
    linkTextBold: {
      color: theme.accent,
      fontWeight: "700",
    },
    separatorRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
    },
    separatorLine: {
      flex: 1,
      height: 1,
      backgroundColor: theme.likeBoxBackground,
    },
    separatorText: {
      color: theme.textMuted,
      fontSize: 12,
      marginHorizontal: 8,
    },
    googleButton: {
      borderRadius: 999,
      backgroundColor: "#FFFFFF",
      paddingVertical: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: "#E5E7EB",
    },
    googleButtonText: {
      color: "#111827",
      fontWeight: "600",
    },
  });
