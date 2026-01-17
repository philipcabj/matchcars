import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function InteresadosTab() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [interestedMap, setInterestedMap] = useState<Map<string, Set<string>>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, { name: string; initials: string; avatarColor: string }>>(new Map());

  useEffect(() => {
    if (!user) {
      setInterestedMap(new Map());
      setProfiles(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    const ownRef = query(collection(db, "vehicles"), where("userId", "==", user.uid));
    const unsubOwn = onSnapshot(ownRef, (snap) => {
      const map = new Map<string, Set<string>>();
      snap.forEach((d) => {
        const data: any = d.data();
        const liked: string[] = Array.isArray(data?.likedBy) ? data.likedBy : [];
        liked.forEach((uid: string) => {
          if (user && uid === user.uid) return;
          const current = map.get(uid) || new Set<string>();
          current.add(d.id);
          map.set(uid, current);
        });
      });
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
        setProfiles((prev) => new Map(prev).set(uid, { name, initials, avatarColor }));
      } catch {
        setProfiles((prev) => new Map(prev).set(uid, { name: uid, initials: String(uid).slice(0, 2).toUpperCase(), avatarColor: theme.accent }));
      }
    })).catch(() => {});
  }, [interestedMap, profiles, theme.accent]);

  const interestedList = useMemo(() => {
    const arr: { userId: string; count: number; name: string; initials: string; avatarColor: string }[] = [];
    interestedMap.forEach((set, uid) => {
      if (user && uid === user.uid) return;
      const prof = profiles.get(uid);
      const name = prof?.name || uid;
      const initials = prof?.initials || String(uid).slice(0, 2).toUpperCase();
      const avatarColor = prof?.avatarColor || theme.accent;
      arr.push({ userId: uid, count: set.size, name, initials, avatarColor });
    });
    arr.sort((a, b) => b.count - a.count);
    return arr;
  }, [interestedMap, profiles, theme.accent, user]);

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header />
      <View style={{ padding: 16, flex: 1 }}>
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : interestedList.length === 0 ? (
          <Text style={{ color: theme.textMuted }}>Todavía no hay interesados en tus publicaciones.</Text>
        ) : (
          <FlatList
            data={interestedList}
            keyExtractor={(item) => item.userId}
            renderItem={({ item }) => (
              <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.likeBoxBackground, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: item.avatarColor, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>{item.initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <TouchableOpacity onPress={() => router.push({ pathname: "/user-favorites/[uid]", params: { uid: item.userId } })}>
                    <Text style={{ color: theme.text, fontWeight: "700" }}>{item.name}</Text>
                  </TouchableOpacity>
                  <Text style={{ color: theme.textMuted }}>Le gustaron {item.count} de tus publicaciones</Text>
                </View>
                <TouchableOpacity onPress={() => router.push({ pathname: "/(screens)/chat/[uid]", params: { uid: item.userId } })} style={{ backgroundColor: theme.inputBackground, borderRadius: 999, padding: 8, borderWidth: 1, borderColor: theme.likeBoxBackground }}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.text} />
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
