import { CarCard } from "@/components/cards/carcard";
import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import type { Vehicle } from "@/types/vehicle";
import { useRouter } from "expo-router";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function MyCarsTab() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [myVehicles, setMyVehicles] = useState<Vehicle[]>([]);

  useEffect(() => {
    if (!user) {
      setMyVehicles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = query(collection(db, "vehicles"), where("userId", "==", user.uid));
    const unsub = onSnapshot(ref, (snap) => {
      const items: Vehicle[] = [];
      snap.forEach((doc) => {
        const data: any = doc.data();
        const mapped: Vehicle = {
          id: doc.id,
          brand: data.brand,
          model: data.model,
          version: data.version ?? undefined,
          year: data.year,
          price: data.price,
          currency: data.currency,
          km: data.km,
          coverImage: data.coverImage ?? data.images?.cover ?? undefined,
          additionalImages: data.additionalImages ?? data.images?.gallery ?? undefined,
          city: data.location?.city ?? data.city,
          province: data.location?.province ?? data.province,
          location: data.location ? {
            latitude: data.location.latitude ?? undefined,
            longitude: data.location.longitude ?? undefined,
            address: data.location.address ?? undefined,
            city: data.location.city ?? undefined,
            province: data.location.province ?? undefined,
          } : undefined,
          userId: data.userId,
          userName: data.userName,
          createdAt: data.createdAt,
          published: data.published,
        } as any;
        items.push(mapped);
      });
      setMyVehicles(items);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching my cars:", error);
      Alert.alert("Error", "No se pudieron cargar tus autos. Revisá tu conexión.");
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  // Sincronización de likedBy se hace al momento del like (en index/favorites)

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Header />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ color: theme.text, fontSize: 16, textAlign: "center" }}>
            Para gestionar tus autos, iniciá sesión o registrate.
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
      <View style={{ padding: 16, flex: 1 }}>
        <TouchableOpacity onPress={() => router.push("/(screens)/add-car")} style={{ backgroundColor: theme.accent, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}>
          <Text style={{ color: theme.buttonText, fontWeight: "700" }}>Publicar auto</Text>
        </TouchableOpacity>
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : myVehicles.length === 0 ? (
          <Text style={{ color: theme.textMuted, marginTop: 12 }}>Todavía no publicaste ningún auto.</Text>
        ) : (
          <FlatList
            style={{ marginTop: 12 }}
            data={myVehicles}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <CarCard vehicle={item} hideLike showEdit />
            )}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
