import { CustomAlert } from "@/components/CustomAlert";
import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { arrayUnion, collection, doc, getDoc, onSnapshot, query, updateDoc, where, writeBatch } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, Text, TouchableOpacity, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

export default function MessagesTab() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedChat, setSelectedChat] = useState<any>(null);
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
      const blockedUsers = profile?.blockedUsers || [];

      snap.forEach((doc) => {
        const data = doc.data();
        
        // Skip if deleted by current user
        if (data.deletedBy && Array.isArray(data.deletedBy) && data.deletedBy.includes(user.uid)) {
          return;
        }

        // members array contains user IDs
        const members = data.members || [];
        const otherUid = members.find((p: string) => p !== user.uid);
        
        // Filter blocked users
        if (otherUid && blockedUsers.includes(otherUid)) {
            return;
        }

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
}, [user, profile?.blockedUsers]);

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
  }, [chats, profiles]);


  const handleDeleteChat = (item: any) => {
    setSelectedChat(item);
    setModalVisible(true);
  };

  const confirmDelete = async () => {
    if (!selectedChat) return;
    try {
      const ref = doc(db, "conversations", selectedChat.id);
      await updateDoc(ref, {
        deletedBy: arrayUnion(user?.uid)
      });
      setModalVisible(false);
      setSelectedChat(null);
    } catch (e) {
      setModalVisible(false);
      showAlert("Error", "No se pudo eliminar el chat.", "error");
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    
    const unreadChats = chats.filter(item => {
        return user && item.lastSenderId !== user.uid && (!item.readBy || !Array.isArray(item.readBy) || !item.readBy.includes(user.uid));
    });

    if (unreadChats.length === 0) return;

    try {
        const batch = writeBatch(db);
        unreadChats.forEach(chat => {
            const ref = doc(db, "conversations", chat.id);
            batch.update(ref, {
                readBy: arrayUnion(user.uid)
            });
        });
        await batch.commit();
        showAlert("Éxito", "Todos los mensajes han sido marcados como leídos.", "success");
    } catch (e) {
        console.error(e);
        showAlert("Error", "No se pudieron marcar los mensajes como leídos.", "error");
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const otherProfile = profiles.get(item.otherUid) || {};
    const displayName = otherProfile.firstName ? `${otherProfile.firstName} ${otherProfile.lastName || ""}` : (otherProfile.name || otherProfile.displayName || "Usuario");
    const avatar = otherProfile.photoURL || otherProfile.avatar || null;
    const initials = otherProfile.initials || (displayName ? displayName.slice(0, 2).toUpperCase() : "MC");
    const avatarColor = otherProfile.avatarColor || theme.accent;

    // Handle vehicle context
    const vehicleName = item.vehicleData ? `${item.vehicleData.brand} ${item.vehicleData.model}` : null;
    
    const isUnread = user && item.lastSenderId !== user.uid && (!item.readBy || !Array.isArray(item.readBy) || !item.readBy.includes(user.uid));

    const renderRightActions = () => {
        return (
            <TouchableOpacity
                onPress={() => handleDeleteChat(item)}
                style={{
                    backgroundColor: "#ef4444",
                    justifyContent: "center",
                    alignItems: "center",
                    width: 80,
                    height: "100%",
                }}
            >
                <Ionicons name="trash-outline" size={24} color="white" />
                <Text style={{ color: "white", fontSize: 12, fontWeight: "600", marginTop: 4 }}>
                    Eliminar
                </Text>
            </TouchableOpacity>
        );
    };

    return (
      <Swipeable renderRightActions={renderRightActions}>
        <TouchableOpacity
          onPress={() => router.push({ 
              pathname: "/(screens)/chat/[uid]", 
              params: { 
                  uid: item.otherUid, 
                  name: displayName,
                  vehicleId: item.vehicleId,
                  vehicleData: item.vehicleData ? JSON.stringify(item.vehicleData) : undefined
              } 
          })}
          onLongPress={() => handleDeleteChat(item)}
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
          <TouchableOpacity onPress={() => router.push(`/(screens)/user-profile/${item.otherUid}` as any)}>
            <View
              style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: avatarColor,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 16,
                overflow: "hidden",
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
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={{ color: theme.text, fontWeight: isUnread ? "800" : "600", fontSize: 16 }}>
                {displayName}
              </Text>
              {item.updatedAt && (
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                  {new Date(item.updatedAt.seconds * 1000).toLocaleDateString()}
                </Text>
              )}
            </View>

            {vehicleName && (
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                    <Ionicons name="car-sport-outline" size={12} color={theme.accent} style={{ marginRight: 4 }} />
                    <Text style={{ color: theme.accent, fontSize: 12, fontWeight: "600" }}>{vehicleName}</Text>
                </View>
            )}
            
            <Text
              style={{
                color: isUnread ? theme.text : theme.textMuted,
                fontWeight: isUnread ? "700" : "400",
              }}
              numberOfLines={1}
            >
              {item.lastMessage || "Iniciar conversación..."}
            </Text>
          </View>

          {isUnread && (
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: theme.accent,
                marginLeft: 8,
              }}
            />
          )}
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, marginTop: 16, marginBottom: 8 }}>
            <Text style={{ fontSize: 24, fontWeight: "700", color: theme.text }}>
              Mensajes
            </Text>
            {chats.some(item => user && item.lastSenderId !== user.uid && (!item.readBy || !Array.isArray(item.readBy) || !item.readBy.includes(user.uid))) && (
                <TouchableOpacity onPress={handleMarkAllAsRead} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="checkmark-done-outline" size={20} color={theme.accent} />
                    <Text style={{ color: theme.accent, fontSize: 14, fontWeight: "600" }}>Marcar leídos</Text>
                </TouchableOpacity>
            )}
        </View>
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

        <Modal
          animationType="fade"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}>
            <View style={{ width: "80%", maxWidth: 320, backgroundColor: theme.card, borderRadius: 20, padding: 24, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.background, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <Ionicons name="trash-outline" size={24} color="#ef4444" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text, marginBottom: 8, textAlign: "center" }}>
                Eliminar chat
              </Text>
              <Text style={{ fontSize: 14, color: theme.textMuted, textAlign: "center", marginBottom: 24, lineHeight: 20 }}>
                ¿Querés eliminar esta conversación?{"\n"}Se ocultará de tu lista.
              </Text>
              <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.background, alignItems: "center" }}
                >
                  <Text style={{ color: theme.text, fontWeight: "600" }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={confirmDelete}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#ef4444", alignItems: "center" }}
                >
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
