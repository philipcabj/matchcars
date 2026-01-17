import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { useRouter } from "expo-router";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function MatchesTab() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [likersOfMine, setLikersOfMine] = useState<Map<string, Set<string>>>(new Map());
  const [ownersILiked, setOwnersILiked] = useState<Map<string, Set<string>>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, { name: string; initials: string; avatarColor: string }>>(new Map());
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
        mine.set(d.id, { id: d.id, ...data, coverImage: data?.coverImage ?? data?.images?.cover ?? (data?.images?.gallery?.[0] ?? undefined) });
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
            next.set(vid, { id: snap.id, ...data, coverImage: data?.coverImage ?? data?.images?.cover ?? (data?.images?.gallery?.[0] ?? undefined) });
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
        setProfiles((prev) => new Map(prev).set(uid, { name, initials, avatarColor }));
      } catch {
        setProfiles((prev) => new Map(prev).set(uid, { name: uid, initials: String(uid).slice(0, 2).toUpperCase(), avatarColor: theme.accent }));
      }
    })).catch(() => {});
  }, [likersOfMine, ownersILiked, profiles, theme.accent]);

  const matchesList = useMemo(() => {
    const arr: { userId: string; mineCount: number; theirCount: number; name: string; initials: string; avatarColor: string }[] = [];
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
      arr.push({ userId: uid, mineCount: mine.size, theirCount: theirs.size, name, initials, avatarColor });
    });
    arr.sort((a, b) => (b.mineCount + b.theirCount) - (a.mineCount + a.theirCount));
    return arr;
  }, [likersOfMine, ownersILiked, profiles, theme.accent, user]);

  const matchPairs = useMemo(() => {
    const arr: { userId: string; myVehicle?: any; theirVehicle?: any; name: string; initials: string; avatarColor: string }[] = [];
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
      const name = prof?.name || uid;
      const initials = prof?.initials || String(uid).slice(0, 2).toUpperCase();
      const avatarColor = prof?.avatarColor || theme.accent;
      arr.push({ userId: uid, myVehicle, theirVehicle, name, initials, avatarColor });
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header />
      <View style={{ padding: 16, flex: 1 }}>
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : matchPairs.length === 0 ? (
          <Text style={{ color: theme.textMuted }}>Todavía no tenés matches.</Text>
        ) : (
          <FlatList
            data={matchPairs}
            keyExtractor={(item) => item.userId}
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
                  <TouchableOpacity onPress={() => router.push({ pathname: "/(screens)/chat/[uid]", params: { uid: item.userId } })} style={{ width: 60, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                    <Text style={{ color: theme.accent, fontWeight: "800", textAlign: "center", fontSize: 14 }}>Match!</Text>
                  </TouchableOpacity>
                  <View style={{ width: 120 }}>
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
                  </View>
                </View>
              </View>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
