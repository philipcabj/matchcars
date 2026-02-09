// app/register.tsx
import { CustomAlert } from "@/components/CustomAlert";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { getAuthErrorMessage } from "@/utils/firebaseErrors";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

let GoogleSignin: any = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    GoogleSignin = require("@react-native-google-signin/google-signin").GoogleSignin;
  } catch {
    console.log("GoogleSignin module not found. Check if you are running in Expo Go.");
  }
}

import { DownloadAppBanner } from "@/components/DownloadAppBanner";

export default function RegisterScreen() {
  const { theme } = useTheme();
  const { registerWithEmail, loginWithGoogle, loginWithApple } = useAuth();
  const router = useRouter();

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <DownloadAppBanner message="Descargá la App para registrarte" />
          <TouchableOpacity onPress={() => router.replace("/(tabs)")} style={{ marginTop: 20, padding: 10 }}>
              <Text style={{ color: theme.accent, fontSize: 16, fontWeight: '600' }}>Volver al inicio</Text>
          </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    try {
      setLoading(true);
      await registerWithEmail({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
      });
      setLoading(false);
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

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: theme.background,
        padding: 24,
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: theme.text,
          fontSize: 24,
          fontWeight: "700",
          marginBottom: 16,
          textAlign: "center",
        }}
      >
        Crear cuenta
      </Text>

  <TextInput
        placeholder="Nombre"
        placeholderTextColor={theme.textMuted}
        value={firstName}
        onChangeText={setFirstName}
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
        placeholder="Apellido"
        placeholderTextColor={theme.textMuted}
        value={lastName}
        onChangeText={setLastName}
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
        placeholder="Email"
        placeholderTextColor={theme.textMuted}
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        style={{
          backgroundColor: theme.inputBackground,
          color: theme.inputText,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 8,
          marginBottom: 12,
        }}
      />

      <TouchableOpacity activeOpacity={1} style={{ position: "relative", marginBottom: 16 }}>
        <TextInput
          placeholder={showPassword ? "tu contraseña" : "Contraseña"}
          placeholderTextColor={theme.textMuted}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          value={password}
          onChangeText={setPassword}
          style={{
            backgroundColor: theme.inputBackground,
            color: theme.inputText,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 8,
          }}
        />
        <TouchableOpacity
          onPress={() => setShowPassword((p) => !p)}
          style={{ position: "absolute", right: 10, top: 10, padding: 6 }}
        >
          <Text style={{ color: theme.accent, fontWeight: "600" }}>
            {showPassword ? "Ocultar" : "Ver"}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>

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

      <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 24 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: theme.inputBackground }} />
        <Text style={{ color: theme.textMuted, marginHorizontal: 10 }}>O continuá con</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: theme.inputBackground }} />
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
          <Text style={{ color: theme.text, fontWeight: "600" }}>Google</Text>
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
            <Text style={{ color: theme.text, fontWeight: "600" }}>Apple</Text>
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
    </SafeAreaView>
  );
}
