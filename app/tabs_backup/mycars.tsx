// app/(tabs)/mycars.tsx
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
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Vehicle } from "@/types/vehicle";
import { CarCard } from "@/components/cards/carcard";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Header } from "@/components/Header";

export default function MyCarsScreen() {
  const router = useRouter();
  const { user, initializing } = useAuth();
  const { theme } = useTheme();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (initializing) return;

    // Si no hay usuario, no suscribimos nada, solo limpiamos el estado
    if (!user) {
      setVehicles([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, "vehicles"),
      where("userId", "==", user.uid)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Vehicle)
      );
      setVehicles(data);
      setLoading(false);
    });

    return () => unsub();
  }, [initializing, user]);

  // Mientras Firebase está resolviendo si hay sesión
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

  // Si NO hay usuario → pedimos login / registro
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
            Para ver y publicar tus autos necesitás iniciar sesión.
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

  // Si hay usuario logueado y todavía está cargando sus autos
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

  // Si hay usuario logueado pero no tiene autos
  if (!loading && vehicles.length === 0) {
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
            Todavía no publicaste autos 🚗
          </Text>

          <TouchableOpacity
            onPress={() => router.push("../add-car")}
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
              Publicar mi primer auto
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ✅ Usuario logueado y con autos
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
        <TouchableOpacity
          onPress={() => router.push("../add-car")}
          style={{
            marginBottom: 16,
            alignSelf: "flex-end",
            backgroundColor: theme.buttonBackground,
            borderRadius: 999,
            paddingVertical: 8,
            paddingHorizontal: 16,
          }}
        >
          <Text
            style={{
              color: theme.buttonText,
              fontWeight: "700",
            }}
          >
            + Publicar auto
          </Text>
        </TouchableOpacity>

        <FlatList
          data={vehicles}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <CarCard vehicle={item} />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      </View>
    </SafeAreaView>
  );
}
