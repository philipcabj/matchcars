import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function MessagesTab() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<any[]>([]);

  useEffect(() => {
    if (!user) {
      setChats([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Query conversations (standardized on "conversations" collection)
    // Removed orderBy to avoid index issues. Sorting client-side.
    const q = query(
      collection(db, "conversations"),
      where("members", "array-contains", user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        // members array contains user IDs
        const members = data.members || [];
        const otherUid = members.find((p: string) => p !== user.uid);
        
        // We might not have user data embedded in conversation doc.
        // We rely on what we have or fetch it? 
        // For now, let's try to use data if available, or just ID.
        // In ChatWithUserScreen, we fetch user data.
        // Here we might need to fetch profiles if not present.
        // But let's assume for now we just show what we have.
        // Ideally we should fetch user profiles here too.
        
        list.push({
          id: doc.id,
          otherUid,
          ...data,
        });
      });
      
      // Sort client-side
      list.sort((a, b) => {
        const tA = a.updatedAt?.seconds ?? 0;
        const tB = b.updatedAt?.seconds ?? 0;
        return tB - tA;
      });
      
      setChats(list);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  // We need to fetch profiles for these users to display names/avatars
  const [profiles, setProfiles] = useState<Map<string, any>>(new Map());
  
  useEffect(() => {
    if (chats.length === 0) return;
    const missing = chats
      .filter((c) => c.otherUid && !profiles.has(c.otherUid))
      .map((c) => c.otherUid);
    if (missing.length === 0) return;

    // De-duplicate
    const uniqueMissing = [...new Set(missing)];

    const fetchProfiles = async () => {
      const newProfiles = new Map<string, any>();
      // const { doc, getDoc } = require("firebase/firestore");

      await Promise.all(
        uniqueMissing.map(async (uid) => {
          try {
            const d = await getDoc(doc(db, "users", uid));
            if (d.exists()) {
              newProfiles.set(uid, d.data());
            }
          } catch (e) {
            console.log("Error fetching user profile", uid, e);
          }
        })
      );

      if (newProfiles.size > 0) {
        setProfiles((prev) => {
          const updated = new Map(prev);
          newProfiles.forEach((value, key) => updated.set(key, value));
          return updated;
        });
      }
    };

    fetchProfiles();
  }, [chats]);


  const renderItem = ({ item }: { item: any }) => {
    const otherProfile = profiles.get(item.otherUid) || {};
    const displayName = otherProfile.firstName ? `${otherProfile.firstName} ${otherProfile.lastName || ""}` : (otherProfile.name || otherProfile.displayName || "Usuario");
    const avatar = otherProfile.avatar || otherProfile.photoURL || null;
    const initials = otherProfile.initials || (displayName ? displayName.slice(0, 2).toUpperCase() : "MC");
    const avatarColor = otherProfile.avatarColor || theme.accent;

    return (
      <TouchableOpacity
        onPress={() => router.push({ pathname: "/chat/[uid]", params: { uid: item.otherUid, name: displayName } })}
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 16,
          backgroundColor: theme.card,
          marginBottom: 1,
          borderBottomWidth: 1,
          borderBottomColor: theme.background,
        }}
      >
        <View
          style={{
            width: 50,
            height: 50,
            borderRadius: 25,
            backgroundColor: avatarColor,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 16,
          }}
        >
          {avatar ? (
            <Image
              source={{ uri: avatar }}
              style={{ width: 50, height: 50, borderRadius: 25 }}
            />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 18 }}>
              {initials}
            </Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}>
              {displayName}
            </Text>
            {item.updatedAt && (
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                    {new Date(item.updatedAt.seconds * 1000).toLocaleDateString()}
                </Text>
            )}
          </View>
          <Text
            style={{ color: theme.textMuted, marginTop: 4 }}
            numberOfLines={1}
          >
            {item.lastMessage || "Sin mensajes"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 24, fontWeight: "700", color: theme.text, margin: 16 }}>
          Mensajes
        </Text>
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : chats.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
            <Ionicons name="chatbubbles-outline" size={64} color={theme.textMuted} />
            <Text style={{ color: theme.textMuted, marginTop: 16, textAlign: "center" }}>
              No tenés conversaciones activas.
            </Text>
          </View>
        ) : (
          <FlatList
            data={chats}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
