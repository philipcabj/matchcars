import { DownloadAppBanner } from "@/components/DownloadAppBanner";
import { Header } from "@/components/Header";
import { WebContainer } from "@/components/WebContainer";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { Vehicle } from "@/types/vehicle";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Platform, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function InteresadosTab() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { markLikesAsSeen } = useNotifications();
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
        markLikesAsSeen();
    }, [])
  );
  const [loading, setLoading] = useState(true);
  const [interestedMap, setInterestedMap] = useState<Map<string, Set<string>>>(new Map());
  const [vehicleCache, setVehicleCache] = useState<Map<string, Vehicle>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, { name: string; initials: string; avatarColor: string; photoUrl: string | null }>>(new Map());

  // Modal Selection State
  const [modalVisible, setModalVisible] = useState(false);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [targetVehicles, setTargetVehicles] = useState<Vehicle[]>([]);

  const handleChatPress = (uid: string) => {
    const vehicleIds = interestedMap.get(uid);
    if (!vehicleIds || vehicleIds.size === 0) return;

    const vehiclesList: Vehicle[] = [];
    vehicleIds.forEach(vid => {
        const v = vehicleCache.get(vid);
        if (v) vehiclesList.push(v);
    });

    if (vehiclesList.length === 1) {
        // Solo un auto, ir directo
        navigateToChat(uid, vehiclesList[0]);
    } else if (vehiclesList.length > 1) {
        // Múltiples autos, abrir selección
        setTargetUserId(uid);
        setTargetVehicles(vehiclesList);
        setModalVisible(true);
    }
  };

  const navigateToChat = (uid: string, v: Vehicle) => {
      setModalVisible(false);
      const vData = {
           id: v.id,
           brand: v.brand,
           model: v.model,
           year: v.year,
           price: v.price,
           currency: v.currency,
           cover: v.coverImage || (v as any).images?.cover || (v as any).cover || ""
      };
      
      router.push({ 
        pathname: "/(screens)/chat/[uid]", 
        params: { 
          uid: uid,
          vehicleId: v.id,
          vehicleData: JSON.stringify(vData)
        } 
      });
  };

  useEffect(() => {
    if (!user) {
      setInterestedMap(new Map());
      setVehicleCache(new Map());
      setProfiles(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    const ownRef = query(collection(db, "vehicles"), where("userId", "==", user.uid));
    const unsubOwn = onSnapshot(ownRef, (snap) => {
      const map = new Map<string, Set<string>>();
      const vCache = new Map<string, Vehicle>();
      
      snap.forEach((d) => {
        const data: any = d.data();
        const vehicle = { id: d.id, ...data } as Vehicle;
        vCache.set(d.id, vehicle);

        const liked: string[] = Array.isArray(data?.likedBy) ? data.likedBy : [];
        liked.forEach((uid: string) => {
          if (user && uid === user.uid) return;
          const current = map.get(uid) || new Set<string>();
          current.add(d.id);
          map.set(uid, current);
        });
      });
      setVehicleCache(vCache);
      setInterestedMap(map);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsubOwn();
  }, [user]);

  useEffect(() => {
    // Eliminado getDocs masivo para evitar reglas/performance; la suscripción por batches cubre el caso
  }, []);

  useEffect(() => {
    const missing: string[] = [];
    interestedMap.forEach((_, uid) => {
      if (!profiles.has(uid)) missing.push(uid);
    });
    if (missing.length === 0) return;
    Promise.all(missing.map(async (uid) => {
      try {
        const p = await getDoc(doc(db, "users", uid));
        const data = p.data() as any;
        const name = data?.firstName || data?.lastName ? `${data?.firstName ?? ""} ${data?.lastName ?? ""}`.trim() : (data?.displayName || data?.email || uid);
        let initials = (data?.initials as string) || "";
        if (!initials) {
          const dn = (data?.displayName || "").trim();
          if (dn) {
            const parts = dn.split(/\s+/).filter(Boolean);
            const first = (parts[0]?.[0] ?? "");
            const second = (parts[1]?.[0] ?? "");
            const base = (first + second) || (parts[0]?.slice(0, 2) ?? "");
            initials = base.toUpperCase();
          } else {
            const fi = (data?.firstName?.[0] ?? "");
            const li = (data?.lastName?.[0] ?? "");
            const base = (fi + li) || (data?.firstName ? String(data.firstName).slice(0, 2) : "");
            initials = base.toUpperCase();
          }
        }
        if (!initials) {
          const em = (data?.email || "");
          initials = em ? String(em).slice(0, 2).toUpperCase() : "MC";
        }
        const avatarColor = data?.avatarColor || theme.accent;
        const photoUrl = data?.photoURL || data?.avatar || null;
        setProfiles((prev) => new Map(prev).set(uid, { name, initials, avatarColor, photoUrl }));
      } catch {
        setProfiles((prev) => new Map(prev).set(uid, { name: uid, initials: String(uid).slice(0, 2).toUpperCase(), avatarColor: theme.accent, photoUrl: null }));
      }
    })).catch(() => {});
  }, [interestedMap, profiles, theme.accent]);

  const interestedList = useMemo(() => {
    const arr: { userId: string; count: number; name: string; initials: string; avatarColor: string; photoUrl: string | null }[] = [];
    interestedMap.forEach((set, uid) => {
      if (user && uid === user.uid) return;
      const prof = profiles.get(uid);
      const name = prof?.name || "Usuario";
      const initials = prof?.initials || String(uid).slice(0, 2).toUpperCase();
      const avatarColor = prof?.avatarColor || theme.accent;
      const photoUrl = prof?.photoUrl || null;
      arr.push({ userId: uid, count: set.size, name, initials, avatarColor, photoUrl });
    });
    arr.sort((a, b) => b.count - a.count);
    return arr;
  }, [interestedMap, profiles, theme.accent, user]);

  const navigateToProfile = (uid: string) => {
    router.push(`/(screens)/user-profile/${uid}` as any);
  };

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Header />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ color: theme.text, fontSize: 16, textAlign: "center" }}>
            Para ver interesados, iniciá sesión o registrate.
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

  if (Platform.OS === "web") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Header title="Interesados" />
        <WebContainer>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Ionicons name="people-outline" size={56} color={theme.textMuted} style={{ opacity: 0.4, marginBottom: 12 }} />
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 8 }}>
              Interesados disponibles en la App
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: "center", marginBottom: 24, maxWidth: 340, lineHeight: 22 }}>
              Descargá la app para ver quiénes se interesaron en tus autos y ponerte en contacto con ellos.
            </Text>
            <DownloadAppBanner message="Descargá la App para ver tus interesados" compact />
          </View>
        </WebContainer>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header />
      <View style={{ padding: 16, flex: 1 }}>
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : interestedList.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
            <Ionicons name="heart-outline" size={48} color={theme.textMuted} style={{ marginBottom: 12, opacity: 0.5 }} />
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600", textAlign: "center", marginBottom: 4 }}>
              Todavía no hay interesados en tus publicaciones.
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 }}>
              A medida que tus autos reciban likes, los posibles compradores van a aparecer acá.
            </Text>
          </View>
        ) : (
          <>
            {/* Summary row */}
            <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 0, paddingBottom: 8 }}>
              <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.border }}>
                <Text style={{ color: theme.text, fontSize: 20, fontWeight: "800" }}>{interestedList.length}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 11 }}>Interesados</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: "#FEF3C7", borderRadius: 10, padding: 10 }}>
                <Text style={{ color: "#92400E", fontSize: 20, fontWeight: "800" }}>
                  {interestedList.filter((i) => i.count >= 2).length}
                </Text>
                <Text style={{ color: "#92400E", fontSize: 11 }}>Muy interesados</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.border }}>
                <Text style={{ color: theme.text, fontSize: 20, fontWeight: "800" }}>
                  {interestedList.reduce((s, i) => s + i.count, 0)}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 11 }}>Likes totales</Text>
              </View>
            </View>
          <FlatList
            data={interestedList}
            keyExtractor={(item) => item.userId}
            renderItem={({ item }) => (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 16,
                  backgroundColor: theme.card,
                  marginBottom: 10,
                  borderRadius: 12,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  elevation: 2,
                }}
              >
                <TouchableOpacity onPress={() => navigateToProfile(item.userId)}>
                  <View
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: 25,
                      backgroundColor: item.avatarColor,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 12,
                      overflow: "hidden",
                    }}
                  >
                    {item.photoUrl ? (
                      <Image
                        source={{ uri: item.photoUrl }}
                        style={{ width: 50, height: 50, borderRadius: 25 }}
                        contentFit="cover"
                      />
                    ) : (
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 18 }}>{item.initials}</Text>
                    )}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={{ flex: 1 }} onPress={() => handleChatPress(item.userId)}>
                  <View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}>{item.name}</Text>
                      {item.count >= 2 && (
                        <View style={{ backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: "#F59E0B" }}>
                          <Text style={{ color: "#92400E", fontSize: 10, fontWeight: "700" }}>MUY INTERESADO</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: theme.textMuted, fontSize: 14 }}>Le {item.count === 1 ? "interesa" : "interesan"} {item.count} {item.count === 1 ? "auto" : "autos"}</Text>
                    {(() => {
                      const ids = Array.from(interestedMap.get(item.userId) || []);
                      const vehicles = ids
                        .map((id) => vehicleCache.get(id))
                        .filter(Boolean) as Vehicle[];
                      vehicles.sort((a: any, b: any) => {
                        const ta = (a.updatedAt?.seconds ?? a.createdAt?.seconds ?? 0);
                        const tb = (b.updatedAt?.seconds ?? b.createdAt?.seconds ?? 0);
                        return tb - ta;
                      });
                      const thumbs = vehicles.slice(0, 3);
                      const remaining = Math.max(0, (vehicles.length - thumbs.length));
                      return (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                          {thumbs.map((v) => {
                            const isSold = v.status === 'sold';
                            const isDeleted = v.status === 'deleted';
                            const badgeLabel = isSold ? 'VENDIDO' : isDeleted ? 'ELIMINADO' : null;
                            return (
                              <TouchableOpacity key={v.id} onPress={() => router.push(`/car/${v.id}` as any)}>
                                <View style={{ width: 32, height: 32, borderRadius: 6, overflow: "hidden" }}>
                                  <Image
                                    source={{ uri: v.coverImage || (v as any).images?.cover || (v as any).images?.gallery?.[0] || "https://placehold.co/64" }}
                                    style={{ width: 32, height: 32, borderRadius: 6, opacity: badgeLabel ? 0.5 : 1 }}
                                    contentFit="cover"
                                  />
                                  {badgeLabel && (
                                    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.15)" }} />
                                  )}
                                  {badgeLabel && (
                                    <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.35)", paddingVertical: 2 }}>
                                      <Text style={{ color: "#fff", fontSize: 8, textAlign: "center", fontWeight: "700" }}>{badgeLabel}</Text>
                                    </View>
                                  )}
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                          {remaining > 0 && (
                            <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border }}>
                              <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700" }}>+{remaining}</Text>
                            </View>
                          )}
                        </View>
                      );
                    })()}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => handleChatPress(item.userId)}>
                  <Ionicons name="chatbubble-ellipses-outline" size={24} color={theme.text} />
                </TouchableOpacity>
              </View>
            )}
          />
          </>
        )}
      </View>

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity 
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 }}
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
        >
            <TouchableOpacity 
                activeOpacity={1} 
                style={{ width: "100%", backgroundColor: theme.card, borderRadius: 16, overflow: "hidden", maxHeight: "80%" }}
            >
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.likeBoxBackground, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>Seleccioná el auto</Text>
                    <TouchableOpacity onPress={() => setModalVisible(false)}>
                        <Ionicons name="close" size={24} color={theme.text} />
                    </TouchableOpacity>
                </View>
                <FlatList
                    data={targetVehicles}
                    keyExtractor={(v) => v.id}
                    renderItem={({ item }) => (
                        <TouchableOpacity 
                            style={{ flexDirection: "row", padding: 12, borderBottomWidth: 1, borderBottomColor: theme.likeBoxBackground, alignItems: "center", gap: 12 }}
                            onPress={() => targetUserId && navigateToChat(targetUserId, item)}
                        >
                            <Image 
                                source={{ uri: item.coverImage || (item as any).images?.cover || "https://placehold.co/100" }}
                                style={{ width: 60, height: 40, borderRadius: 6 }}
                                contentFit="cover"
                            />
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.text, fontWeight: "700" }}>{item.brand} {item.model}</Text>
                                <Text style={{ color: theme.accent, fontWeight: "600" }}>{item.currency} {Number(item.price).toLocaleString("es-AR")}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
                        </TouchableOpacity>
                    )}
                />
            </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
