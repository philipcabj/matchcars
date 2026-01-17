// app/profile.tsx
import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ProfileScreen() {
  const { theme, themeName, setThemeName } = useTheme();
  const { user, profile, deleteAccount } = useAuth();
  const router = useRouter();

  const fullName = (profile?.firstName || profile?.lastName)
    ? `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim()
    : user?.displayName || "";

  const initials =
    profile?.initials ||
    (profile?.firstName && profile?.lastName
      ? `${profile.firstName[0]}${profile.lastName[0]}`
      : user?.email
      ? user.email.slice(0, 2).toUpperCase()
      : "MC");

  const avatarColor = profile?.avatarColor || theme.accent;

  const createdAtDate = profile?.createdAt && (profile as any).createdAt?.toDate
    ? (profile as any).createdAt.toDate()
    : null;
  const createdAtLabel = createdAtDate
    ? createdAtDate.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Header />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ color: theme.text, fontSize: 16, textAlign: "center" }}>
            Para ver tu perfil, iniciá sesión o registrate.
          </Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
            <TouchableOpacity onPress={() => router.push("/login")} style={{ backgroundColor: theme.buttonBackground, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 }}>
              <Text style={{ color: theme.buttonText, fontWeight: "700" }}>Iniciar sesión</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/register")} style={{ backgroundColor: theme.accent, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 }}>
              <Text style={{ color: theme.buttonText, fontWeight: "700" }}>Registrarme</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header />
      <View style={{ padding: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.inputBackground }}>
            <Text style={{ color: theme.text }}>← Volver</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/(tabs)")} style={{ borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.inputBackground }}>
            <Text style={{ color: theme.text }}>Ir al inicio</Text>
          </TouchableOpacity>
        </View>
        <View style={{ alignItems: "center", marginTop: 12 }}>
          <View
            style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              backgroundColor: avatarColor,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 28 }}>{initials}</Text>
          </View>
          <Text style={{ color: theme.text, fontSize: 22, fontWeight: "800", marginTop: 12 }}>
            {fullName || profile?.email || user.email || "Usuario"}
          </Text>
          <Text style={{ color: theme.textLight, marginTop: 4 }}>{profile?.email ?? user.email ?? ""}</Text>
          {profile?.role && (
            <Text style={{ color: theme.subtext, marginTop: 2 }}>Rol: {profile.role}</Text>
          )}
        </View>

        <View style={{ marginTop: 24, gap: 12 }}>
          <View style={{ backgroundColor: theme.card, borderRadius: 12, padding: 16 }}>
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}>Información</Text>
            <View style={{ marginTop: 8, gap: 6 }}>
              <Text style={{ color: theme.textMuted }}>Nombre: {fullName || "—"}</Text>
              <Text style={{ color: theme.textMuted }}>Correo: {profile?.email ?? user.email ?? "—"}</Text>
              <Text style={{ color: theme.textMuted }}>Registrado: {createdAtLabel}</Text>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 16, gap: 12 }}>
          <View style={{ backgroundColor: theme.card, borderRadius: 12, padding: 16 }}>
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}>Tema</Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => setThemeName("light")}
                style={{
                  backgroundColor: themeName === "light" ? theme.buttonBackground : theme.badgeBackground,
                  borderRadius: 999,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                }}
              >
                <Text style={{ color: themeName === "light" ? theme.buttonText : theme.text, fontWeight: "700" }}>Claro</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setThemeName("dark")}
                style={{
                  backgroundColor: themeName === "dark" ? theme.buttonBackground : theme.badgeBackground,
                  borderRadius: 999,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                }}
              >
                <Text style={{ color: themeName === "dark" ? theme.buttonText : theme.text, fontWeight: "700" }}>Oscuro</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 16, gap: 12 }}>
          <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}>Accesos rápidos</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/mycars")}
              style={{ backgroundColor: theme.buttonBackground, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 }}
            >
              <Text style={{ color: theme.buttonText, fontWeight: "700" }}>Mis autos</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/favorites")}
              style={{ backgroundColor: theme.accent, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 }}
            >
              <Text style={{ color: theme.buttonText, fontWeight: "700" }}>Favoritos</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ marginTop: 24 }}>
          <TouchableOpacity
            onPress={() => {
              Alert.alert(
                "Eliminar cuenta",
                "Esto eliminará tu cuenta y todas tus publicaciones. ¿Deseás continuar?",
                [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Eliminar",
                    style: "destructive",
                    onPress: async () => {
                      try {
                        await deleteAccount();
                        router.replace("/login");
                      } catch {
                        Alert.alert("Error", "No se pudo eliminar la cuenta. Intentá nuevamente.");
                      }
                    },
                  },
                ]
              );
            }}
            activeOpacity={0.8}
            style={{
              backgroundColor: theme.removeButton,
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 16,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Eliminar mi cuenta</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
