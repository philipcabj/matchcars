import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ConversationItem = { id: string; peerId: string; peerName: string; lastMessage?: string; updatedAt?: any };
type LikeItem = { userId: string; count: number; name: string; initials: string; avatarColor: string };
type MatchItem = { userId: string; name: string; initials: string; avatarColor: string };

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [likesReceived, setLikesReceived] = useState<Map<string, number>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, { name: string; initials: string; avatarColor: string }>>(new Map());
  const [likersOfMine, setLikersOfMine] = useState<Map<string, Set<string>>>(new Map());
  const [ownersILiked, setOwnersILiked] = useState<Map<string, Set<string>>>(new Map());

  useEffect(() => {
    if (!user) return;
    setDoc(doc(db, "users", user.uid), { notificationsLastSeenAt: serverTimestamp() }, { merge: true }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) {
      setConversations([]);
      setLikesReceived(new Map());
      setLikersOfMine(new Map());
      setOwnersILiked(new Map());
      setProfiles(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, "conversations"), where("members", "array-contains", user.uid));
    const unsub = onSnapshot(q, async (snap) => {
      const items: ConversationItem[] = [];
      const toFetchProfiles: string[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        const members: string[] = Array.isArray(data?.members) ? data.members : [];
        const peerId = members.find((m) => m !== user.uid) || "";
        const lastMessage = data?.lastMessage;
        const updatedAt = data?.updatedAt;
        const name = profiles.get(peerId)?.name || "Usuario";
        items.push({ id: d.id, peerId, peerName: name, lastMessage, updatedAt });
        if (peerId && !profiles.has(peerId)) toFetchProfiles.push(peerId);
      });
      // Sort client-side
      items.sort((a, b) => {
        const tA = a.updatedAt?.seconds ?? 0;
        const tB = b.updatedAt?.seconds ?? 0;
        return tB - tA;
      });
      setConversations(items);
      await Promise.all(toFetchProfiles.map(async (uid) => {
        try {
          const p = await getDoc(doc(db, "users", uid));
          const data = p.data() as any;
          const name = data?.firstName || data?.lastName ? `${data?.firstName ?? ""} ${data?.lastName ?? ""}`.trim() : (data?.displayName || data?.email || "Usuario");
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
          setProfiles((prev) => new Map(prev).set(uid, { name: "Usuario", initials: String(uid).slice(0, 2).toUpperCase(), avatarColor: theme.accent }));
        }
      }));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [user, profiles, theme.accent]);

  useEffect(() => {
    if (!user) return;
    const ownRef = query(collection(db, "vehicles"), where("userId", "==", user.uid));
    const unsubOwn = onSnapshot(ownRef, (snap) => {
      const likers = new Map<string, number>();
      snap.forEach((d) => {
        const data: any = d.data();
        const liked: string[] = Array.isArray(data?.likedBy) ? data.likedBy : [];
        liked.forEach((uid: string) => {
          if (uid === user.uid) return;
          likers.set(uid, (likers.get(uid) || 0) + 1);
        });
      });
      setLikesReceived(likers);
    });
    return () => unsubOwn();
  }, [user]);

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
        if (ownerUid === user.uid) return;
        const set = owners.get(ownerUid) || new Set<string>();
        set.add(String(vid));
        owners.set(ownerUid, set);
      });
      setOwnersILiked(owners);
    });
    return () => unsubFav();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const ownRef = query(collection(db, "vehicles"), where("userId", "==", user.uid));
    const unsubOwn = onSnapshot(ownRef, (snap) => {
      const likers = new Map<string, Set<string>>();
      snap.forEach((d) => {
        const data: any = d.data();
        const likedBy: string[] = Array.isArray(data?.likedBy) ? data.likedBy : [];
        likedBy.forEach((uid: string) => {
          if (uid === user.uid) return;
          const set = likers.get(uid) || new Set<string>();
          set.add(d.id);
          likers.set(uid, set);
        });
      });
      setLikersOfMine(likers);
    });
    return () => unsubOwn();
  }, [user]);

  useEffect(() => {
    const missing: string[] = [];
    likesReceived.forEach((_, uid) => { if (!profiles.has(uid)) missing.push(uid); });
    likersOfMine.forEach((_, uid) => { if (!profiles.has(uid) && !missing.includes(uid)) missing.push(uid); });
    ownersILiked.forEach((_, uid) => { if (!profiles.has(uid) && !missing.includes(uid)) missing.push(uid); });
    if (missing.length === 0) return;
    Promise.all(missing.map(async (uid) => {
      try {
        const p = await getDoc(doc(db, "users", uid));
        const data = p.data() as any;
        const name = data?.firstName || data?.lastName ? `${data?.firstName ?? ""} ${data?.lastName ?? ""}`.trim() : (data?.displayName || data?.email || "Usuario");
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
        setProfiles((prev) => new Map(prev).set(uid, { name: "Usuario", initials: String(uid).slice(0, 2).toUpperCase(), avatarColor: theme.accent }));
      }
    })).catch(() => {});
  }, [likesReceived, likersOfMine, ownersILiked, profiles, theme.accent]);

  const likesList = useMemo<LikeItem[]>(() => {
    const arr: LikeItem[] = [];
    likesReceived.forEach((count, uid) => {
      if (user && uid === user.uid) return;
      const prof = profiles.get(uid);
      arr.push({ userId: uid, count, name: prof?.name || "Usuario", initials: prof?.initials || String(uid).slice(0, 2).toUpperCase(), avatarColor: prof?.avatarColor || theme.accent });
    });
    arr.sort((a, b) => b.count - a.count);
    return arr;
  }, [likesReceived, profiles, theme.accent, user]);

  const matchesList = useMemo<MatchItem[]>(() => {
    const arr: MatchItem[] = [];
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
      arr.push({ userId: uid, name: prof?.name || "Usuario", initials: prof?.initials || String(uid).slice(0, 2).toUpperCase(), avatarColor: prof?.avatarColor || theme.accent });
    });
    return arr;
  }, [likersOfMine, ownersILiked, profiles, theme.accent, user]);

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Header />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ color: theme.text, fontSize: 16, textAlign: "center" }}>
            Para ver notificaciones, iniciá sesión o registrate.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header />
      <View style={{ padding: 16, flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.inputBackground }}>
            <Text style={{ color: theme.text }}>← Volver</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/(tabs)")} style={{ borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.inputBackground }}>
            <Text style={{ color: theme.text }}>Ir al inicio</Text>
          </TouchableOpacity>
        </View>
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          <>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700", marginBottom: 8 }}>Mensajes</Text>
            {conversations.length === 0 ? (
              <Text style={{ color: theme.textMuted, marginBottom: 16 }}>No tenés conversaciones todavía.</Text>
            ) : (
              <FlatList
                data={conversations}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => router.push({ pathname: "/(screens)/chat/[uid]", params: { uid: item.peerId, name: item.peerName || profiles.get(item.peerId)?.name || "Usuario" } })} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.likeBoxBackground, flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: profiles.get(item.peerId)?.avatarColor || theme.accent, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>{profiles.get(item.peerId)?.initials || item.peerId.slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: "700" }}>{item.peerName || "Usuario"}</Text>
                      {!!item.lastMessage && (
                        <Text style={{ color: theme.textMuted }} numberOfLines={1} ellipsizeMode="tail">{item.lastMessage}</Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                  </TouchableOpacity>
                )}
              />
            )}

            <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700", marginTop: 20, marginBottom: 8 }}>Likes</Text>
            {likesList.length === 0 ? (
              <Text style={{ color: theme.textMuted, marginBottom: 16 }}>Todavía no recibiste likes.</Text>
            ) : (
              <FlatList
                data={likesList}
                keyExtractor={(item) => item.userId}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={async () => { const a = String(user?.uid || ""); const b = String(item.userId); const convId = [a,b].sort().join("_"); try { await setDoc(doc(db, "conversations", convId), { members: [a, b], createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true }); } catch {} router.push({ pathname: "/(screens)/chat/[uid]", params: { uid: item.userId, name: item.name } }); }} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.likeBoxBackground, flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: item.avatarColor, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>{item.initials}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: "700" }}>{item.name}</Text>
                      <Text style={{ color: theme.textMuted }}>Le gustaron {item.count} de tus publicaciones</Text>
                    </View>
                    <Ionicons name="paper-plane-outline" size={18} color={theme.textMuted} />
                  </TouchableOpacity>
                )}
              />
            )}

            <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700", marginTop: 20, marginBottom: 8 }}>Matches</Text>
            {matchesList.length === 0 ? (
              <Text style={{ color: theme.textMuted }}>Todavía no tenés matches.</Text>
            ) : (
              <FlatList
                data={matchesList}
                keyExtractor={(item) => item.userId}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => router.push({ pathname: "/(screens)/chat/[uid]", params: { uid: item.userId, name: item.name } })} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.likeBoxBackground, flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: item.avatarColor, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>{item.initials}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: "700" }}>{item.name}</Text>
                      <Text style={{ color: theme.textMuted }}>¡Match! Podés iniciar una conversación.</Text>
                    </View>
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.textMuted} />
                  </TouchableOpacity>
                )}
              />
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
