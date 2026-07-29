// app/register.tsx
import { CustomAlert } from "@/components/CustomAlert";
import { DownloadAppBanner } from "@/components/DownloadAppBanner";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Analytics } from "@/lib/analytics";
import { logger } from "@/lib/logger";
import { getAuthErrorMessage } from "@/utils/firebaseErrors";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Keyboard,
    Platform,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";


let GoogleSignin: any = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    GoogleSignin = require("@react-native-google-signin/google-signin").GoogleSignin;
  } catch {
    logger.log("GoogleSignin module not found. Check if you are running in Expo Go.");
  }
}

export default function RegisterScreen() {
  const { theme } = useTheme();
  const { registerWithEmail, loginWithGoogle, loginWithApple } = useAuth();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const lastNameRef = useRef<any>(null);
  const emailRef = useRef<any>(null);
  const passwordRef = useRef<any>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{ visible: boolean; title: string; message: string; type: "error" | "success" | "info" }>({ visible: false, title: "", message: "", type: "info" });

  useEffect(() => {
    if (GoogleSignin) {
        GoogleSignin.configure({
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        offlineAccess: false,
        });
    }
  }, []);

  const showAlert = (title: string, message: string, type: "error" | "success" | "info" = "error", onOk?: () => void) => {
    setAlertConfig({ visible: true, title, message, type });
    if (onOk) {
       // simple hack if we want to support callbacks, but CustomAlert doesn't support it directly in props for onClose
       // but we can wrap it. For now, let's keep it simple.
       // Actually, the original Alert.alert("Listo", "...", [{ text: "OK", onPress: ... }]) pattern is used for redirection.
       // We can handle redirection in onClose if we want, or just immediately redirect.
       // But wait, "Cuenta creada correctamente" -> router.replace("/terms").
       // Ideally we show the alert, user clicks OK, then we redirect.
    }
  };

  const hideAlert = () => {
    setAlertConfig((prev) => ({ ...prev, visible: false }));
    if (alertConfig.title === "Listo") {
        router.replace("/terms");
    }
  };

  const handleRegister = async () => {
    if (!firstName || !lastName || !email || !password) {
      showAlert("Error", "Completá todos los campos.", "info");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      showAlert("Email inválido", "Ingresá un email con formato válido (ej: nombre@dominio.com).", "error");
      return;
    }
    if (password.length < 6) {
      showAlert("Contraseña muy corta", "La contraseña debe tener al menos 6 caracteres.", "error");
      return;
    }
    try {
      setLoading(true);
      await registerWithEmail({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
      });
      setLoading(false);
      Analytics.logRegistration('email');
      showAlert("Listo", "Cuenta creada correctamente.", "success");
    } catch (err: any) {
      // console.error(err);
      setLoading(false);
      showAlert("Error", getAuthErrorMessage(err?.code), "error");
    }
  };

  const handleGoogleLogin = async () => {
    try {
      if (!GoogleSignin) {
        showAlert("Error", "Google Sign-In no está disponible.", "error");
        return;
      }
      setLoadingGoogle(true);
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      if (userInfo.data?.idToken) {
        await loginWithGoogle(userInfo.data.idToken);
        Analytics.logRegistration('google');
        router.replace("/(tabs)");
      } else {
        throw new Error("No se obtuvo idToken de Google");
      }
    } catch (error: any) {
      if (error.code === "12501") {
        // Cancelado por usuario
      } else {
        console.error("Google Login Error:", error);
        showAlert("Error", "No se pudo iniciar con Google.", "error");
      }
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleAppleLogin = async () => {
    try {
      await loginWithApple();
      Analytics.logRegistration('apple');
      router.replace("/(tabs)");
    } catch (error: any) {
      if (error.code === "ERR_REQUEST_CANCELED") {
        // Cancelado
      } else {
        console.error("Apple Login Error:", error);
        showAlert("Error", "No se pudo iniciar con Apple.", "error");
      }
    }
  };

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <DownloadAppBanner message="Descargá la App para registrarte" />
        <TouchableOpacity
          onPress={() => router.replace("/(tabs)")}
          style={{ marginTop: 20, padding: 10 }}
        >
          <Text
            style={{
              color: theme.accent,
              fontSize: 16,
              fontWeight: "600",
            }}
          >
            Volver al inicio
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: theme.background,
      }}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View
          style={{
            flex: 1,
            paddingHorizontal: 24,
            paddingTop: 16,
            paddingBottom: 24,
          }}
        >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ padding: 8, marginRight: 8 }}
          >
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text
            style={{
              color: theme.text,
              fontSize: 22,
              fontWeight: "700",
            }}
          >
            Crear cuenta
          </Text>
        </View>

        <View style={{ flex: 1, justifyContent: "center" }}>
          <TextInput
            placeholder="Nombre"
            placeholderTextColor={theme.textMuted}
            value={firstName}
            onChangeText={setFirstName}
            returnKeyType="next"
            onSubmitEditing={() => lastNameRef.current?.focus()}
            blurOnSubmit={false}
            style={{
              backgroundColor: theme.inputBackground,
              color: theme.inputText,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 8,
              marginBottom: 12,
            }}
          />

          <TextInput
            ref={lastNameRef}
            placeholder="Apellido"
            placeholderTextColor={theme.textMuted}
            value={lastName}
            onChangeText={setLastName}
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            blurOnSubmit={false}
            style={{
              backgroundColor: theme.inputBackground,
              color: theme.inputText,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 8,
              marginBottom: 12,
            }}
          />

          <TextInput
            ref={emailRef}
            placeholder="Email"
            placeholderTextColor={theme.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            blurOnSubmit={false}
            style={{
              backgroundColor: theme.inputBackground,
              color: theme.inputText,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 8,
              marginBottom: 12,
            }}
          />

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: theme.inputBackground,
              borderRadius: 8,
              paddingHorizontal: 12,
              marginBottom: 16,
            }}
          >
            <TextInput
              ref={passwordRef}
              placeholder="Contraseña"
              placeholderTextColor={theme.textMuted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
              returnKeyType="done"
              onSubmitEditing={handleRegister}
              style={{
                flex: 1,
                color: theme.inputText,
                paddingVertical: 10,
              }}
            />
            <TouchableOpacity
              onPress={() => setShowPassword((p) => !p)}
              style={{ paddingHorizontal: 4, paddingVertical: 4 }}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={theme.textMuted}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={handleRegister}
            disabled={loading}
            style={{
              backgroundColor: theme.buttonBackground,
              paddingVertical: 12,
              borderRadius: 999,
              alignItems: "center",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <ActivityIndicator color={theme.buttonText} />
            ) : (
              <Text
                style={{
                  color: theme.buttonText,
                  fontWeight: "700",
                  fontSize: 16,
                }}
              >
                Registrarme
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/login" as any)}
            style={{ marginTop: 16, alignItems: "center" }}
          >
            <Text style={{ color: theme.accent }}>
              ¿Ya tenés cuenta? Iniciá sesión
            </Text>
          </TouchableOpacity>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginVertical: 24,
            }}
          >
            <View
              style={{
                flex: 1,
                height: 1,
                backgroundColor: theme.inputBackground,
              }}
            />
            <Text
              style={{ color: theme.textMuted, marginHorizontal: 10 }}
            >
              O continuá con
            </Text>
            <View
              style={{
                flex: 1,
                height: 1,
                backgroundColor: theme.inputBackground,
              }}
            />
          </View>

          <View style={{ gap: 12 }}>
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.card,
                paddingVertical: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: theme.inputBackground,
                gap: 10,
              }}
              onPress={handleGoogleLogin}
              disabled={loadingGoogle}
            >
              {loadingGoogle ? (
                <ActivityIndicator size="small" color={theme.text} />
              ) : (
                <Ionicons name="logo-google" size={20} color={theme.text} />
              )}
              <Text style={{ color: theme.text, fontWeight: "600" }}>
                Google
              </Text>
            </TouchableOpacity>

            {Platform.OS === "ios" && !Platform.isPad && (
              <TouchableOpacity
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.card,
                  paddingVertical: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: theme.inputBackground,
                  gap: 10,
                }}
                onPress={handleAppleLogin}
              >
                <Ionicons name="logo-apple" size={20} color={theme.text} />
                <Text style={{ color: theme.text, fontWeight: "600" }}>
                  Apple
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <CustomAlert
            visible={alertConfig.visible}
            title={alertConfig.title}
            message={alertConfig.message}
            type={alertConfig.type}
            onClose={hideAlert}
          />
        </View>
        </View>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}
