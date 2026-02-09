import { CarCard } from "@/components/cards/carcard";
import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { sendNotificationEmail } from "@/lib/mail";
import type { Vehicle } from "@/types/vehicle";
import { useLocalSearchParams, useRouter } from "expo-router";
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, increment, onSnapshot, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function UserFavoritesByUidScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [likesRemaining, setLikesRemaining] = useState<number>(10);
  const hasUid = typeof uid === "string" && uid.length > 0;

  useEffect(() => {
    if (!hasUid) {
      setVehicles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = query(collection(db, "vehicles"), where("userId", "==", String(uid)));
    const unsub = onSnapshot(ref, (snap) => {
      const items: Vehicle[] = [];
      snap.forEach((docSnap) => {
        const data: any = docSnap.data();
        // Filter out reported/deleted cars
        if (["rejected", "blocked", "deleted"].includes(data.status)) {
            return;
        }
        const mapped: Vehicle = {
          id: docSnap.id,
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
          isFeatured: data.isFeatured,
          status: data.status,
        } as any;
        
        // Filter out blocked, rejected or deleted vehicles
        if (mapped.status === "blocked" || mapped.status === "rejected" || data.deleted === true) {
          return;
        }

        items.push(mapped);
      });
      setVehicles(items);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [uid, hasUid]);

  useEffect(() => {
    if (!user) {
      setFavoriteIds(new Set());
      setLikesRemaining(10);
      return;
    }
    const favRef = collection(db, "users", user.uid, "favorites");
    const unsub = onSnapshot(favRef, (snap) => {
      const ids = new Set<string>();
      snap.forEach((d) => { ids.add(d.id); });
      setFavoriteIds(ids);
      let todayCount = 0;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      snap.forEach((d) => {
        const data = d.data() as any;
        const ts: Timestamp | undefined = data?.createdAt;
        if (ts && ts.toDate() >= start) {
          todayCount += 1;
        }
      });
      setLikesRemaining(Math.max(0, 10 - todayCount));
    });
    return () => unsub();
  }, [user]);

  const toggleFavorite = async (vehicleId: string, vehicleOwnerId?: string) => {
    if (!user) {
      router.push("/login");
      return;
    }
    const ref = doc(db, "users", user.uid, "favorites", vehicleId);
    const vRef = doc(db, "vehicles", vehicleId);
    const isFav = favoriteIds.has(vehicleId);
    if (isFav) {
      await deleteDoc(ref);
      try {
        await updateDoc(vRef, { 
          likedBy: arrayRemove(user.uid),
          likesCount: increment(-1) 
        });
      } catch {
        try { await updateDoc(vRef, { likedBy: arrayRemove(user.uid) }); } catch {}
      }
    } else {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const favRef = collection(db, "users", user.uid, "favorites");
      const q = query(favRef, where("createdAt", ">=", Timestamp.fromDate(start)));
      const snap = await getDocs(q);
      if (snap.size >= 10) {
        return;
      }
      await setDoc(ref, { vehicleId, createdAt: serverTimestamp(), userId: user.uid, vehicleOwnerId: vehicleOwnerId ?? null });
      try {
        await updateDoc(vRef, { 
          likedBy: arrayUnion(user.uid),
          likesCount: increment(1) 
        });
      } catch {
        try { await updateDoc(vRef, { likedBy: arrayUnion(user.uid) }); } catch {}
      }
      
      // Send Notification Email
      if (vehicleOwnerId && vehicleOwnerId !== user.uid) {
        try {
            const vSnap = await getDoc(vRef);
            const vData = vSnap.data() as any;
            const carModel = `${vData?.brand || ""} ${vData?.model || ""}`.trim();
    
            const myVehiclesRef = query(
                collection(db, "vehicles"), 
                where("userId", "==", user.uid), 
                where("likedBy", "array-contains", vehicleOwnerId)
            );
            const matchSnap = await getDocs(myVehiclesRef);
            const isMatch = !matchSnap.empty;
    
            const myName = (user.displayName || (user.email?.split('@')[0] ?? "Usuario")).trim();
            
            await sendNotificationEmail(isMatch ? "match" : "like", {
                recipientUid: vehicleOwnerId,
                senderName: myName,
                senderUid: user.uid,
                subject: isMatch ? `¡Tenés un nuevo Match con ${myName}!` : `¡A ${myName} le gustó tu auto!`,
                carModel: carModel
            });
        } catch (err) {
            console.error("Error sending notification:", err);
        }
      }
    }
  };

  if (!hasUid) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Header />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ color: theme.text }}>No se recibió el usuario.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Header />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ color: theme.text, fontSize: 16, textAlign: "center" }}>
            Para ver publicaciones de usuarios, iniciá sesión o registrate.
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
        <TouchableOpacity onPress={() => router.back()} style={{ alignSelf: "flex-start", backgroundColor: theme.inputBackground, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, borderWidth: 1, borderColor: theme.likeBoxBackground }}>
          <Text style={{ color: theme.text }}>← Volver</Text>
        </TouchableOpacity>
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : vehicles.length === 0 ? (
          <Text style={{ color: theme.textMuted }}>Este usuario no tiene publicaciones.</Text>
        ) : (
          <FlatList
            data={vehicles}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <CarCard vehicle={item} liked={favoriteIds.has(item.id)} likeDisabled={!favoriteIds.has(item.id) && likesRemaining <= 0} onToggleLike={() => toggleFavorite(item.id, item.userId)} />
            )}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
