// app/(tabs)/favorites.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Header } from "@/components/Header";

// Cuando tengas el tipo real de “favorito”, lo reemplazamos
type FavoriteVehicle = {
  id: string;
  // acá podés ir agregando campos reales (brand, model, etc.)
};

export default function FavoritesScreen() {
  const router = useRouter();
  const { user, initializing } = useAuth();
  const { theme } = useTheme();

  const [favorites, setFavorites] = useState<FavoriteVehicle[]>([]);
  const [loading, setLoading] = useState(true);

  // 🔒 Carga de datos solo si hay usuario
  useEffect(() => {
    if (initializing) return;

    if (!user) {
      setFavorites([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // TODO: acá va tu lógica real para cargar favoritos desde Firestore
    // Por ahora simulo “sin favoritos”:
    const timeout = setTimeout(() => {
      setFavorites([]); // o una lista dummy si querés
      setLoading(false);
    }, 400);

    return () => clearTimeout(timeout);
  }, [initializing, user]);

  // ⏳ Firebase resolviendo sesión
  if (initializing) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={theme.accent} />
        <Text style={{ color: theme.text, marginTop: 8 }}>
          Cargando sesión...
        </Text>
      </SafeAreaView>
    );
  }

  // 🔐 Usuario no logueado → pedir login / registro
  if (!user) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.background,
        }}
      >
        <Header />
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            gap: 16,
          }}
        >
          <Text
            style={{
              color: theme.text,
              fontSize: 18,
              textAlign: "center",
            }}
          >
            Para ver tus autos favoritos necesitás iniciar sesión.
          </Text>

          <TouchableOpacity
            onPress={() => router.push("/login")}
            style={{
              backgroundColor: theme.buttonBackground,
              borderRadius: 999,
              paddingVertical: 12,
              paddingHorizontal: 24,
            }}
          >
            <Text
              style={{
                color: theme.buttonText,
                fontSize: 16,
                fontWeight: "700",
              }}
            >
              Iniciar sesión / Registrarme
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // 👀 Usuario logueado, pero todavía cargando favoritos
  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={theme.accent} />
      </SafeAreaView>
    );
  }

  // 💤 Usuario logueado pero sin favoritos
  if (!loading && favorites.length === 0) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.background,
        }}
      >
        <Header />
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            gap: 16,
          }}
        >
          <Text
            style={{
              color: theme.text,
              fontSize: 18,
              textAlign: "center",
            }}
          >
            Todavía no tenés autos en favoritos ⭐
          </Text>

          <Text
            style={{
              color: theme.textLight,
              fontSize: 14,
              textAlign: "center",
            }}
          >
            Explorá la lista de autos y marcá con like los que te interesen.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ✅ Usuario logueado con favoritos
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: theme.background,
      }}
    >
      <Header />

      <View
        style={{
          flex: 1,
          paddingHorizontal: 12,
          paddingTop: 16,
        }}
      >
        <Text
          style={{
            color: theme.text,
            fontSize: 18,
            fontWeight: "600",
            marginBottom: 12,
          }}
        >
          Tus autos favoritos
        </Text>

        <FlatList
          data={favorites}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            // TODO: reemplazar por CarCard cuando tengas los datos completos
            <View
              style={{
                padding: 12,
                borderRadius: 8,
                backgroundColor: theme.card,
                marginBottom: 8,
              }}
            >
              <Text style={{ color: theme.text }}>
                Auto favorito ID: {item.id}
              </Text>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      </View>
    </SafeAreaView>
  );
}
