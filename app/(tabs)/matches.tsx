import { DownloadAppBanner } from "@/components/DownloadAppBanner";
import { Header } from "@/components/Header";
import { WebContainer } from "@/components/WebContainer";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { calcMatchScore } from "@/lib/matchScore";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Image, Platform, RefreshControl, Text, TouchableOpacity, View } from "react-native";
import { SkeletonList } from "@/components/SkeletonLoader";
import { SafeAreaView } from "react-native-safe-area-context";

export default function MatchesTab() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const { markMatchesAsSeen } = useNotifications();
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
        markMatchesAsSeen();
    }, [])
  );
  const [loading, setLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (loading) {
      setShowSkeleton(true);
    } else {
      const t = setTimeout(() => setShowSkeleton(false), 500);
      return () => clearTimeout(t);
    }
  }, [loading]);

  const onRefresh = () => {
    setRefreshing(true);
    setProfiles(new Map());
    setOtherVehicles(new Map());
    setTimeout(() => setRefreshing(false), 800);
  };
  const [likersOfMine, setLikersOfMine] = useState<Map<string, Set<string>>>(new Map());
  const [ownersILiked, setOwnersILiked] = useState<Map<string, Set<string>>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, { name: string; initials: string; avatarColor: string; photoUrl?: string | null }>>(new Map());
  const [myVehicles, setMyVehicles] = useState<Map<string, any>>(new Map());
  const [otherVehicles, setOtherVehicles] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    if (!user) {
      setLikersOfMine(new Map());
      setOwnersILiked(new Map());
      setProfiles(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    const ownRef = query(collection(db, "vehicles"), where("userId", "==", user.uid));
    const unsubOwn = onSnapshot(ownRef, (snap) => {
      const likers = new Map<string, Set<string>>();
      const mine = new Map<string, any>();
      snap.forEach((d) => {
        const data: any = d.data();
        const likedBy: string[] = Array.isArray(data?.likedBy) ? data.likedBy : [];
        const resolvedCover = data?.coverImage
          ?? data?.images?.cover
          ?? data?.images?.gallery?.[0]
          ?? (Array.isArray(data?.images) ? data.images[0] : undefined)
          ?? data?.image
          ?? data?.thumbnail
          ?? undefined;
        mine.set(d.id, { id: d.id, ...data, coverImage: resolvedCover });
        likedBy.forEach((uid: string) => {
          if (user && uid === user.uid) return;
          const set = likers.get(uid) || new Set<string>();
          set.add(d.id);
          likers.set(uid, set);
        });
      });
      setLikersOfMine(likers);
      setMyVehicles(mine);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsubOwn();
  }, [user]);

  useEffect(() => {
    const ids = new Set<string>();
    ownersILiked.forEach((set) => { set.forEach((vid) => ids.add(vid)); });
    const unsubs: (() => void)[] = [];
    ids.forEach((vid) => {
      const vRef = doc(db, "vehicles", vid);
      const unsub = onSnapshot(vRef, (snap) => {
        setOtherVehicles((prev) => {
          const next = new Map(prev);
          if (snap.exists()) {
            const data: any = snap.data();
            const resolvedCover = data?.coverImage
              ?? data?.images?.cover
              ?? data?.images?.gallery?.[0]
              ?? (Array.isArray(data?.images) ? data.images[0] : undefined)
              ?? data?.image
              ?? data?.thumbnail
              ?? undefined;
            next.set(vid, { id: snap.id, ...data, coverImage: resolvedCover });
          } else {
            next.delete(vid);
          }
          return next;
        });
      });
      unsubs.push(unsub);
    });
    return () => { unsubs.forEach((u) => u()); };
  }, [ownersILiked]);

  useEffect(() => {
    if (!user) return;
    const favRef = collection(db, "users", user.uid, "favorites");
    const unsubFav = onSnapshot(favRef, (snap) => {
      const owners = new Map<string, Set<string>>();
      snap.forEach((d) => {
        const data = d.data() as any;
        const ownerUid = data?.vehicleOwnerId;
        const vid = data?.vehicleId || d.id;
        if (!ownerUid || !vid) return;
        if (user && ownerUid === user.uid) return;
        const set = owners.get(ownerUid) || new Set<string>();
        set.add(String(vid));
        owners.set(ownerUid, set);
      });
      setOwnersILiked(owners);
    });
    return () => unsubFav();
  }, [user]);

  useEffect(() => {
    const missing: string[] = [];
    likersOfMine.forEach((_, uid) => { if (!profiles.has(uid)) missing.push(uid); });
    ownersILiked.forEach((_, uid) => { if (!profiles.has(uid) && !missing.includes(uid)) missing.push(uid); });
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
  }, [likersOfMine, ownersILiked, profiles, theme.accent]);

  const matchesList = useMemo(() => {
    const arr: { userId: string; mineCount: number; theirCount: number; name: string; initials: string; avatarColor: string; photoUrl?: string | null }[] = [];
    const candidateUids = new Set<string>();
    likersOfMine.forEach((_, uid) => candidateUids.add(uid));
    ownersILiked.forEach((_, uid) => candidateUids.add(uid));
    candidateUids.forEach((uid) => {
      if (user && uid === user.uid) return;
      const mine = likersOfMine.get(uid);
      const theirs = ownersILiked.get(uid);
      if (!mine || !theirs) return;
      if (mine.size === 0 || theirs.size === 0) return;
      const prof = profiles.get(uid);
      const name = prof?.name || uid;
      const initials = prof?.initials || String(uid).slice(0, 2).toUpperCase();
      const avatarColor = prof?.avatarColor || theme.accent;
      const photoUrl = prof?.photoUrl;
      arr.push({ userId: uid, mineCount: mine.size, theirCount: theirs.size, name, initials, avatarColor, photoUrl });
    });
    arr.sort((a, b) => (b.mineCount + b.theirCount) - (a.mineCount + a.theirCount));
    return arr;
  }, [likersOfMine, ownersILiked, profiles, theme.accent, user]);

  const matchPairs = useMemo(() => {
    const arr: { userId: string; myVehicle?: any; theirVehicle?: any; name: string; initials: string; avatarColor: string; photoUrl?: string | null }[] = [];
    const candidateUids = new Set<string>();
    likersOfMine.forEach((_, uid) => candidateUids.add(uid));
    ownersILiked.forEach((_, uid) => candidateUids.add(uid));
    candidateUids.forEach((uid) => {
      if (user && uid === user.uid) return;
      const mine = likersOfMine.get(uid);
      const theirs = ownersILiked.get(uid);
      if (!mine || !theirs) return;
      const myId = Array.from(mine)[0];
      const theirId = Array.from(theirs)[0];
      const myVehicle = myVehicles.get(myId);
      const theirVehicle = otherVehicles.get(theirId);
      const prof = profiles.get(uid);
      const name = prof?.name || "Usuario";
      const initials = prof?.initials || String(uid).slice(0, 2).toUpperCase();
      const avatarColor = prof?.avatarColor || theme.accent;
      const photoUrl = prof?.photoUrl;
      arr.push({ userId: uid, myVehicle, theirVehicle, name, initials, avatarColor, photoUrl });
    });
    return arr;
  }, [likersOfMine, ownersILiked, profiles, myVehicles, otherVehicles, user, theme.accent]);

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Header />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ color: theme.text, fontSize: 16, textAlign: "center" }}>
            Para ver tus matches, iniciá sesión o registrate.
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
        <Header title="Matches" />
        <WebContainer>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Ionicons name="heart-outline" size={56} color={theme.textMuted} style={{ opacity: 0.4, marginBottom: 12 }} />
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 8 }}>
              Matches disponibles en la App
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: "center", marginBottom: 24, maxWidth: 340, lineHeight: 22 }}>
              Descargá la app para ver tus matches y conectarte con otros usuarios que tienen lo que buscás.
            </Text>
            <DownloadAppBanner message="Descargá la App para ver tus matches" compact />
          </View>
        </WebContainer>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header />
      <View style={{ padding: 16, flex: 1 }}>
        {showSkeleton ? (
          <SkeletonList count={3} />
        ) : matchPairs.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
            <Ionicons name="git-network-outline" size={48} color={theme.textMuted} style={{ marginBottom: 12, opacity: 0.5 }} />
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600", textAlign: "center", marginBottom: 4 }}>
              Todavía no tenés matches.
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 }}>
              Cuando haya un match entre tus autos y otros usuarios, vas a verlo acá.
            </Text>
          </View>
        ) : (
          <FlatList
            data={matchPairs}
            keyExtractor={(item) => item.userId}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
            renderItem={({ item }) => (
              <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.likeBoxBackground }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                  <View style={{ width: 120 }}>
                    <Text style={{ color: theme.textMuted, fontSize: 12, textAlign: "center", marginBottom: 4 }} numberOfLines={1} ellipsizeMode="tail">Vos</Text>
                    {item.myVehicle?.coverImage ? (
                      <Image source={{ uri: item.myVehicle.coverImage }} style={{ width: 120, height: 90, borderRadius: 8 }} />
                    ) : (
                      <View style={{ width: 120, height: 90, borderRadius: 8, backgroundColor: theme.card }} />
                    )}
                    <Text style={{ color: theme.title, fontSize: 12, fontWeight: "700", marginTop: 4 }}>
                      {(item.myVehicle?.brand ?? "")} {(item.myVehicle?.model ?? "")}
                    </Text>
                    <Text style={{ color: theme.price, fontSize: 12, fontWeight: "700" }}>
                      {item.myVehicle?.price != null && item.myVehicle?.currency ? `${item.myVehicle.currency} ${Number(item.myVehicle.price).toLocaleString()}` : "Consultar"}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => {
                      const params: any = { uid: item.userId, name: item.name };
                      if (item.theirVehicle) {
                          params.vehicleId = item.theirVehicle.id;
                          params.vehicleData = JSON.stringify({
                              id: item.theirVehicle.id,
                              brand: item.theirVehicle.brand,
                              model: item.theirVehicle.model,
                              year: item.theirVehicle.year,
                              price: item.theirVehicle.price,
                              currency: item.theirVehicle.currency,
                              cover: item.theirVehicle.coverImage
                          });
                      }
                      router.push({ pathname: "/(screens)/chat/[uid]", params });
                  }} style={{ width: 60, alignItems: "center", justifyContent: "center", gap: 4 }}>
                    <Ionicons name="chatbubble-ellipses-outline" size={24} color={theme.accent} />
                    <Text style={{ color: theme.accent, fontWeight: "700", textAlign: "center", fontSize: 12 }}>Chat</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => item.theirVehicle?.id && router.push(`/car/${item.theirVehicle.id}`)} style={{ width: 120 }}>
                    <Text style={{ color: theme.textMuted, fontSize: 12, textAlign: "center", marginBottom: 4 }} numberOfLines={1} ellipsizeMode="tail">{item.name}</Text>
                    {item.theirVehicle?.coverImage ? (
                      <Image source={{ uri: item.theirVehicle.coverImage }} style={{ width: 120, height: 90, borderRadius: 8 }} />
                    ) : (
                      <View style={{ width: 120, height: 90, borderRadius: 8, backgroundColor: theme.card }} />
                    )}
                    <Text style={{ color: theme.title, fontSize: 12, fontWeight: "700", marginTop: 4 }}>
                      {(item.theirVehicle?.brand ?? "")} {(item.theirVehicle?.model ?? "")}
                    </Text>
                    <Text style={{ color: theme.price, fontSize: 12, fontWeight: "700" }}>
                      {item.theirVehicle?.price != null && item.theirVehicle?.currency ? `${item.theirVehicle.currency} ${Number(item.theirVehicle.price).toLocaleString()}` : "Consultar"}
                    </Text>
                    {profile?.buyerPreferences && item.theirVehicle && (() => {
                      const { score } = calcMatchScore(item.theirVehicle, profile.buyerPreferences!);
                      return score > 0 ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3 }}>
                          <Ionicons name="sparkles" size={9} color={theme.accent} />
                          <Text style={{ color: theme.accent, fontSize: 10, fontWeight: "700" }}>{score}% match</Text>
                        </View>
                      ) : null;
                    })()}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
