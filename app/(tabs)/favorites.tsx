import { CarCard } from "@/components/cards/carcard";
import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import type { Vehicle } from "@/types/vehicle";
import { useRouter } from "expo-router";
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function FavoritesTab() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favVehicles, setFavVehicles] = useState<Vehicle[]>([]);
  const [likesRemaining, setLikesRemaining] = useState<number>(10);

  // Nota: no usar early return antes de hooks para evitar violar reglas de hooks

  // Suscripción a favoritos del usuario
  useEffect(() => {
    if (!user) {
      setFavoriteIds([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const favRef = collection(db, "users", user.uid, "favorites");
    const unsubFav = onSnapshot(favRef, (snap) => {
      const ids: string[] = [];
      let todayCount = 0;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      snap.forEach((d) => {
        ids.push(d.id);
        const data = d.data() as any;
        const ts: Timestamp | undefined = data?.createdAt;
        if (ts && ts.toDate() >= start) {
          todayCount += 1;
        }
      });
      setFavoriteIds(ids);
      setLikesRemaining(Math.max(0, 10 - todayCount));
    });
    return () => unsubFav();
  }, [user]);

  // Suscribir a cada vehicle favorito para ver cambios en tiempo real
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    setFavVehicles([]);
    if (favoriteIds.length === 0) {
      setLoading(false);
      return;
    }
    favoriteIds.forEach((vid) => {
      const vRef = doc(db, "vehicles", vid);
      const unsub = onSnapshot(vRef, (snap) => {
        setFavVehicles((prev) => {
          const others = prev.filter((p) => p.id !== vid);
          if (snap.exists()) {
            const data: any = snap.data();
            const mapped: Vehicle = {
              id: snap.id,
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
            return [...others, mapped];
          }
          return others;
        });
        setLoading(false);
      }, () => setLoading(false));
      unsubs.push(unsub);
    });
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [favoriteIds]);

  const toggleFavorite = async (vehicleId: string, vehicleOwnerId?: string) => {
    if (!user) {
      router.push("/login");
      return;
    }
    const ref = doc(db, "users", user.uid, "favorites", vehicleId);
    const vRef = doc(db, "vehicles", vehicleId);
    const isFav = favoriteIds.includes(vehicleId);
    if (isFav) {
      await deleteDoc(ref);
      try {
        await updateDoc(vRef, { likedBy: arrayRemove(user.uid) });
      } catch (e) {
        Alert.alert("Error", "No se pudo actualizar los likes en la publicación.");
      }
    } else {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const favRef = collection(db, "users", user.uid, "favorites");
      const q = query(favRef, where("createdAt", ">=", Timestamp.fromDate(start)));
      const snap = await getDocs(q);
      if (snap.size >= 10) {
        Alert.alert("Límite diario", "Sólo podés dar hasta 10 likes por día.");
        return;
      }
      await setDoc(ref, { vehicleId, createdAt: serverTimestamp(), userId: user.uid, vehicleOwnerId: vehicleOwnerId ?? null });
      try {
        await updateDoc(vRef, { likedBy: arrayUnion(user.uid) });
      } catch (e) {
        Alert.alert("Error", "No se pudo actualizar los likes en la publicación.");
      }
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header />
      <View style={{ padding: 16, flex: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 8 }}>
          <Text style={{ color: theme.textMuted }}>Te quedan {likesRemaining} likes hoy</Text>
        </View>
        {!user ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
            <Text style={{ color: theme.text, fontSize: 16, textAlign: "center" }}>
              Para ver tus favoritos, iniciá sesión o registrate.
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
        ) : loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : favVehicles.length === 0 ? (
          <Text style={{ color: theme.textMuted }}>Todavía no tenés favoritos.</Text>
        ) : (
          <FlatList
            data={favVehicles}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <CarCard vehicle={item} liked={true} onToggleLike={() => toggleFavorite(item.id, item.userId)} compact horizontal />
            )}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
