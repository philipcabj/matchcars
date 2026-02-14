import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, doc, getDoc, onSnapshot, orderBy, query, setDoc, where } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ConversationItem = { id: string; peerId: string; peerName: string; lastMessage?: string; updatedAt?: any; vehicleData?: any; vehicleId?: string; lastSenderId?: string; readBy?: string[] };
type LikeItem = { userId: string; count: number; name: string; initials: string; avatarColor: string; photoUrl?: string };
type MatchItem = { userId: string; name: string; initials: string; avatarColor: string; photoUrl?: string };

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { markNotificationsAsRead, clearNotifications, lastSeenAt, clearedAt } = useNotifications();
  const { filter } = useLocalSearchParams<{ filter?: string }>();

  const [activeTab, setActiveTab] = useState<"messages" | "likes" | "matches" | "alerts">("messages");
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [priceAlerts, setPriceAlerts] = useState<any[]>([]); // New state for price alerts
  const [likesReceived, setLikesReceived] = useState<Map<string, number>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, { name: string; initials: string; avatarColor: string; photoUrl?: string }>>(new Map());
  const [likersOfMine, setLikersOfMine] = useState<Map<string, Set<string>>>(new Map());
  const [ownersILiked, setOwnersILiked] = useState<Map<string, Set<string>>>(new Map());

  // Filter notifications based on clearedAt
  const filteredConversations = useMemo(() => {
    if (!clearedAt) return conversations;
    const clearedMillis = typeof clearedAt.toMillis === 'function' ? clearedAt.toMillis() : clearedAt.seconds * 1000;
    
    return conversations.filter(c => {
        const updatedAtMillis = c.updatedAt?.seconds * 1000 || 0;
        // Show if updated AFTER clearedAt
        return updatedAtMillis > clearedMillis;
    });
  }, [conversations, clearedAt]);

  useEffect(() => {
    // Removed auto-mark as seen to allow manual clearing
  }, []);

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
    const q = query(
      collection(db, "conversations"), 
      where("members", "array-contains", user.uid),
      orderBy("updatedAt", "desc")
    );
    const unsub = onSnapshot(q, async (snap) => {
      const items: ConversationItem[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        
        // Skip if deleted by current user
        if (data.deletedBy && Array.isArray(data.deletedBy) && data.deletedBy.includes(user?.uid)) {
          return;
        }

        const members: string[] = Array.isArray(data?.members) ? data.members : [];
        const peerId = members.find((m) => m !== user.uid) || "";
        const lastMessage = data?.lastMessage;
        const updatedAt = data?.updatedAt;
        const name = "Usuario"; // Will be resolved by render via profiles map
        
        items.push({ 
          id: d.id, 
          peerId, 
          peerName: name, 
          lastMessage, 
          updatedAt,
          vehicleData: data.vehicleData,
          vehicleId: data.vehicleId,
          lastSenderId: data.lastSenderId,
          readBy: data.readBy
        });
      });

      setConversations(items);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [user]);

  const handlePriceAlertPress = async (item: any) => {
    if (!user) return;
    try {
        if (!item.read) {
             await setDoc(doc(db, "users", user.uid, "price_alert_notifications", item.id), { read: true }, { merge: true });
        }
    } catch (e) {
        console.error("Error marking alert as read", e);
    }
    router.push(`/car/${item.vehicleId}`);
  };

  // Listen for Price Alerts
  useEffect(() => {
      if (!user) return;
      const q = query(
          collection(db, "users", user.uid, "price_alert_notifications")
      );
      const unsub = onSnapshot(q, (snap) => {
          const alerts: any[] = [];
          snap.forEach(d => alerts.push({ id: d.id, ...d.data() }));
          // Sort in memory to avoid index issues
          alerts.sort((a, b) => {
              const tA = a.createdAt?.seconds || 0;
              const tB = b.createdAt?.seconds || 0;
              return tB - tA;
          });
          setPriceAlerts(alerts);
      });
      return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "likes"), where("ownerId", "==", user.uid));
    const unsubOwn = onSnapshot(q, (snap) => {
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
    conversations.forEach((c) => { if (c.peerId && !profiles.has(c.peerId) && !missing.includes(c.peerId)) missing.push(c.peerId); });
    
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
        const photoUrl = data?.photoURL || null;
        setProfiles((prev) => new Map(prev).set(uid, { name, initials, avatarColor, photoUrl }));
      } catch {
        setProfiles((prev) => new Map(prev).set(uid, { name: "Usuario", initials: String(uid).slice(0, 2).toUpperCase(), avatarColor: theme.accent }));
      }
    })).catch(() => {});
  }, [likesReceived, likersOfMine, ownersILiked, conversations, profiles, theme.accent]);

  const likesList = useMemo<LikeItem[]>(() => {
    const arr: LikeItem[] = [];
    likesReceived.forEach((count, uid) => {
      if (user && uid === user.uid) return;
      const prof = profiles.get(uid);
      arr.push({ userId: uid, count, name: prof?.name || "Usuario", initials: prof?.initials || String(uid).slice(0, 2).toUpperCase(), avatarColor: prof?.avatarColor || theme.accent, photoUrl: prof?.photoUrl });
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
      arr.push({ userId: uid, name: prof?.name || "Usuario", initials: prof?.initials || String(uid).slice(0, 2).toUpperCase(), avatarColor: prof?.avatarColor || theme.accent, photoUrl: prof?.photoUrl });
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
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.card }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: "700", color: theme.text }}>Notificaciones</Text>
        </View>
        <TouchableOpacity onPress={() => router.push("/(tabs)")}>
          <Ionicons name="home-outline" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>
      
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 16, padding: 16, paddingBottom: 0 }}>
        <TouchableOpacity onPress={markNotificationsAsRead} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
           <Ionicons name="checkmark-done-outline" size={20} color={theme.accent} />
           <Text style={{ color: theme.accent, fontWeight: "600", fontSize: 14 }}>Marcar leídos</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={clearNotifications} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
           <Ionicons name="trash-outline" size={20} color={theme.textMuted} />
           <Text style={{ color: theme.textMuted, fontWeight: "600", fontSize: 14 }}>Limpiar</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        {/* Custom Tabs */}
        <View style={{ flexDirection: "row", backgroundColor: theme.card, padding: 4, margin: 16, borderRadius: 12 }}>
          {(["messages", "likes", "matches", "alerts"] as const).map((tab) => {
             const labels = { messages: "Mensajes", likes: "Likes", matches: "Matches", alerts: "Alertas" };
             const isActive = activeTab === tab;
             return (
               <TouchableOpacity
                 key={tab}
                 onPress={() => setActiveTab(tab)}
                 style={{
                   flex: 1,
                   paddingVertical: 8,
                   alignItems: "center",
                   borderRadius: 8,
                   backgroundColor: isActive ? theme.background : "transparent",
                 }}
               >
                 <Text style={{ 
                   color: isActive ? theme.text : theme.textMuted, 
                   fontWeight: isActive ? "700" : "500",
                   fontSize: 14
                 }}>
                   {labels[tab]}
                 </Text>
                 {tab === "alerts" && priceAlerts.some((a) => !a.read) && (
                   <View style={{ position: "absolute", top: 6, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" }} />
                 )}
               </TouchableOpacity>
             );
          })}
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          <View style={{ flex: 1, paddingHorizontal: 16 }}>
            {activeTab === "alerts" && (
              <FlatList
                data={priceAlerts}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    onPress={() => handlePriceAlertPress(item)}
                    style={{ 
                      backgroundColor: theme.card, 
                      padding: 16, 
                      marginBottom: 1, 
                      flexDirection: 'row', 
                      alignItems: 'center',
                      opacity: item.read ? 0.7 : 1
                    }}
                  >
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Ionicons name="pricetag" size={24} color={theme.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: '600', fontSize: 16 }}>¡Bajó de precio!</Text>
                      <Text style={{ color: theme.textMuted, fontSize: 14 }}>
                         {item.brand} {item.model} bajó a {item.newPrice}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
                        {new Date(item.createdAt?.seconds * 1000).toLocaleDateString()}
                      </Text>
                    </View>
                    {!item.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.accent }} />}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={{ padding: 32, alignItems: 'center' }}>
                    <Ionicons name="notifications-off-outline" size={48} color={theme.textMuted} />
                    <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 16 }}>
                      No tienes alertas de precio por ahora.
                    </Text>
                  </View>
                }
              />
            )}

            {activeTab === "messages" && (
              <>
                {filteredConversations.length === 0 ? (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="chatbubble-ellipses-outline" size={48} color={theme.textMuted} style={{ marginBottom: 12, opacity: 0.5 }} />
                    <Text style={{ color: theme.textMuted }}>No tenés notificaciones nuevas.</Text>
                  </View>
                ) : (
                  <FlatList
                    data={filteredConversations.slice(0, 6)}
                    keyExtractor={(item) => item.id}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => {
                        const originalIsUnread = !item.readBy?.includes(user?.uid || "") && item.lastSenderId !== user?.uid;
                        // It is visually unread if it is technically unread AND updated after lastSeenAt
                        const isUnread = originalIsUnread && (!lastSeenAt || (item.updatedAt?.seconds * 1000 > (typeof lastSeenAt.toMillis === 'function' ? lastSeenAt.toMillis() : lastSeenAt.seconds * 1000)));
                        
                        const handlePress = () => {
                            const params: any = { uid: item.peerId, name: profiles.get(item.peerId)?.name || item.peerName || "Usuario" };
                            if (item.vehicleData) {
                                params.vehicleId = item.vehicleId;
                                params.vehicleData = JSON.stringify(item.vehicleData);
                            }
                            router.push({ pathname: "/(screens)/chat/[uid]", params });
                        };

                        return (
                      <TouchableOpacity onPress={handlePress} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.likeBoxBackground, flexDirection: "row", alignItems: "center", gap: 12 }}>
                        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: profiles.get(item.peerId)?.avatarColor || theme.accent, alignItems: "center", justifyContent: "center", overflow: 'hidden' }}>
                          {profiles.get(item.peerId)?.photoUrl ? (
                            <Image source={{ uri: profiles.get(item.peerId)?.photoUrl }} style={{ width: 48, height: 48 }} />
                          ) : (
                            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 18 }}>{profiles.get(item.peerId)?.initials || item.peerId.slice(0, 2).toUpperCase()}</Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                             <Text style={{ color: theme.text, fontWeight: isUnread ? "800" : "700", fontSize: 16 }}>{profiles.get(item.peerId)?.name || item.peerName || "Usuario"}</Text>
                             {item.updatedAt && (
                               <Text style={{ color: isUnread ? theme.accent : theme.textMuted, fontSize: 12, fontWeight: isUnread ? "700" : "400" }}>
                                 {new Date(item.updatedAt.seconds * 1000).toLocaleDateString()}
                               </Text>
                             )}
                          </View>
                          {item.vehicleData && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                                <Ionicons name="car-sport" size={12} color={theme.accent} style={{ marginRight: 4 }} />
                                <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '600' }}>
                                    {item.vehicleData.brand} {item.vehicleData.model}
                                </Text>
                            </View>
                          )}
                          {!!item.lastMessage && (
                            <Text style={{ color: isUnread ? theme.text : theme.textMuted, fontSize: 14, fontWeight: isUnread ? "600" : "400" }} numberOfLines={1} ellipsizeMode="tail">{item.lastMessage}</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    )}}
                  />
                )}
              </>
            )}

            {activeTab === "likes" && (
              <>
                {likesList.length === 0 ? (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="heart-outline" size={48} color={theme.textMuted} style={{ marginBottom: 12, opacity: 0.5 }} />
                    <Text style={{ color: theme.textMuted }}>Todavía no recibiste likes.</Text>
                  </View>
                ) : (
                  <FlatList
                    data={likesList}
                    keyExtractor={(item) => item.userId}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (
                      <TouchableOpacity onPress={() => router.push("/(tabs)/interesados")} 
                        style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.likeBoxBackground, flexDirection: "row", alignItems: "center", gap: 12 }}
                      >
                        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: item.avatarColor, alignItems: "center", justifyContent: "center", overflow: 'hidden' }}>
                          {item.photoUrl ? (
                            <Image source={{ uri: item.photoUrl }} style={{ width: 48, height: 48 }} />
                          ) : (
                            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 18 }}>{item.initials}</Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}>Tenés nuevos likes</Text>
                          <Text style={{ color: theme.textMuted, marginTop: 2 }}>A {item.name} le gustaron {item.count} de tus publicaciones</Text>
                        </View>
                        <View style={{ backgroundColor: theme.inputBackground, padding: 8, borderRadius: 999 }}>
                            <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
                        </View>
                      </TouchableOpacity>
                    )}
                  />
                )}
              </>
            )}

            {activeTab === "matches" && (
              <>
                {matchesList.length === 0 ? (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="git-network-outline" size={48} color={theme.textMuted} style={{ marginBottom: 12, opacity: 0.5 }} />
                    <Text style={{ color: theme.textMuted }}>Todavía no tenés matches.</Text>
                  </View>
                ) : (
                  <FlatList
                    data={matchesList}
                    keyExtractor={(item) => item.userId}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (
                      <TouchableOpacity onPress={() => router.push("/(tabs)/matches")} 
                        style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.likeBoxBackground, flexDirection: "row", alignItems: "center", gap: 12 }}
                      >
                        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: item.avatarColor, alignItems: "center", justifyContent: "center", overflow: 'hidden' }}>
                          {item.photoUrl ? (
                            <Image source={{ uri: item.photoUrl }} style={{ width: 48, height: 48 }} />
                          ) : (
                            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 18 }}>{item.initials}</Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}>Hiciste un match</Text>
                          <Text style={{ color: theme.textMuted, marginTop: 2 }}>¡Match! Tocá para ver más detalles.</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
                      </TouchableOpacity>
                    )}
                  />
                )}
              </>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
