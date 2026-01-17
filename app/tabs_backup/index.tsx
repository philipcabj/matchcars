// app/(tabs)/index.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  FlatList,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Vehicle } from "@/types/vehicle";
import { useTheme } from "@/contexts/ThemeContext";
import { Header } from "@/components/Header";
import { useRouter } from "expo-router";

export default function HomeScreen() {
  const { theme } = useTheme();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const q = query(
      collection(db, "vehicles"),
      where("published", "==", true)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Vehicle)
      );
      setVehicles(data);
      setLoading(false);
    });

    return () => unsub();
  }, []);

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

  if (!loading && vehicles.length === 0) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          gap: 12,
        }}
      >
        <Header />
        <Text
          style={{
            color: theme.text,
            fontSize: 18,
            textAlign: "center",
            marginTop: 16,
          }}
        >
          No hay autos publicados todavía.
        </Text>
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
      {/* HEADER ARRIBA */}
      <Header />

      {/* CONTENIDO */}
      <View
        style={{
          flex: 1,
          paddingHorizontal: 12,
          paddingTop: 8,
        }}
      >
        <FlatList
          data={vehicles}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.85}
              style={{
                marginBottom: 12,
                borderRadius: 16,
                overflow: "hidden",
                backgroundColor: theme.card,
              }}
              // 👇 Navegación correcta al detalle
              onPress={() =>
                router.push({
                  pathname: "/car/[id]",
                  params: { id: item.id },
                })
              }
            >
              {/* Imagen */}
              {item.coverImage ? (
                <Image
                  source={{ uri: item.coverImage }}
                  style={{ width: "100%", height: 180 }}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={{
                    width: "100%",
                    height: 180,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: theme.likeBox,
                  }}
                >
                  <Text style={{ color: theme.textMuted }}>Sin foto</Text>
                </View>
              )}

              {/* Info básica */}
              <View style={{ padding: 10 }}>
                <Text
                  style={{
                    color: theme.title,
                    fontSize: 16,
                    fontWeight: "700",
                  }}
                  numberOfLines={1}
                >
                  {[item.brand, item.model, item.year]
                    .filter(Boolean)
                    .join(" ") || "Auto sin título"}
                </Text>

                <Text
                  style={{
                    color: theme.secondaryText,
                    fontSize: 13,
                    marginTop: 2,
                    marginBottom: 4,
                  }}
                  numberOfLines={1}
                >
                  {item.version || "Versión no especificada"}
                </Text>

                <Text
                  style={{
                    color: theme.price,
                    fontSize: 16,
                    fontWeight: "700",
                    marginBottom: 4,
                  }}
                >
                  {item.currency}{" "}
                  {Number(item.price || 0).toLocaleString("es-AR")}
                </Text>

                <Text
                  style={{
                    color: theme.textMuted,
                    fontSize: 12,
                  }}
                  numberOfLines={1}
                >
                  📍 {item.city || "-"} / {item.province || "-"}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      </View>
    </SafeAreaView>
  );
}
