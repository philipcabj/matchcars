import { CarCard } from "@/components/cards/carcard";
import { CustomAlert } from "@/components/CustomAlert";
import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { sendNotificationEmail } from "@/lib/mail";
import type { Vehicle } from "@/types/vehicle";
import { useRouter } from "expo-router";
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, increment, onSnapshot, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function FavoritesTab() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favVehicles, setFavVehicles] = useState<Vehicle[]>([]);
  const [likesRemaining, setLikesRemaining] = useState<number>(10);
  const [alertConfig, setAlertConfig] = useState({ 
    visible: false, 
    title: "", 
    message: "", 
    type: "info" as "success" | "error" | "info" | "warning",
    onClose: () => {}
  });

  const showAlert = (title: string, message: string, type: "success" | "error" | "info" | "warning" = "info", onClose = () => {}) => {
    setAlertConfig({ visible: true, title, message, type, onClose });
  };

  const closeAlert = () => {
    setAlertConfig(prev => ({ ...prev, visible: false }));
    if (alertConfig.onClose) alertConfig.onClose();
  };

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
            // Filter out reported/deleted cars
            if (["rejected", "blocked", "deleted"].includes(data.status)) {
                return others;
            }
            
            // Filter blocked users
            if (profile?.blockedUsers && data.userId && profile.blockedUsers.includes(data.userId)) {
                return others;
            }

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
              isFeatured: data.isFeatured,
              status: data.status,
            } as any;
            
            // Filter
            if (mapped.status === "blocked" || mapped.status === "rejected" || data.deleted === true) {
                return others;
            }

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
  }, [favoriteIds, profile?.blockedUsers]);

  const [sellerProfiles, setSellerProfiles] = useState<Record<string, { name: string }>>({});

  useEffect(() => {
    if (favVehicles.length === 0) return;
    
    const fetchSellerProfiles = async () => {
        const idsToFetch = Array.from(new Set(favVehicles.map(v => v.userId).filter((id): id is string => !!id && !sellerProfiles[id])));
        if (idsToFetch.length === 0) return;

        const profiles: Record<string, { name: string }> = {};
        
        await Promise.all(idsToFetch.map(async (uid) => {
            try {
                const userDoc = await getDoc(doc(db, "users", uid));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    const name = data.displayName || data.firstName ? `${data.firstName || ""} ${data.lastName || ""}`.trim() : "Usuario";
                    profiles[uid] = { name: name || "Usuario" };
                } else {
                    profiles[uid] = { name: "Usuario" };
                }
            } catch (e) {
                profiles[uid] = { name: "Usuario" };
            }
        }));
        
        setSellerProfiles(prev => ({ ...prev, ...profiles }));
    };
    fetchSellerProfiles();
  }, [favVehicles]);

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
        await updateDoc(vRef, { 
          likedBy: arrayRemove(user.uid),
          likesCount: increment(-1) 
        });
      } catch {
        // Fallback: intentar sin decrementar si falla
        try {
          await updateDoc(vRef, { likedBy: arrayRemove(user.uid) });
        } catch {}
      }
    } else {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const favRef = collection(db, "users", user.uid, "favorites");
      const q = query(favRef, where("createdAt", ">=", Timestamp.fromDate(start)));
      const snap = await getDocs(q);
      if (snap.size >= 10) {
        showAlert("Límite diario", "Sólo podés dar hasta 10 likes por día.", "warning");
        return;
      }
      await setDoc(ref, { vehicleId, createdAt: serverTimestamp(), userId: user.uid, vehicleOwnerId: vehicleOwnerId ?? null });
      try {
        await updateDoc(vRef, { 
          likedBy: arrayUnion(user.uid),
          likesCount: increment(1) 
        });
      } catch {
        // Fallback
        try {
          await updateDoc(vRef, { likedBy: arrayUnion(user.uid) });
        } catch {}
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
            renderItem={({ item }) => {
            const sellerName = item.userId ? sellerProfiles[item.userId]?.name : undefined;
            const vehicleToRender = sellerName ? { ...item, userName: sellerName } : item;
            return (
              <CarCard vehicle={vehicleToRender} liked={true} onToggleLike={() => toggleFavorite(item.id, item.userId)} compact horizontal />
            );
          }}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </View>
      <CustomAlert 
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={closeAlert}
      />
    </SafeAreaView>
  );
}
