import { CustomAlert } from "@/components/CustomAlert";
import { DownloadAppBanner } from "@/components/DownloadAppBanner";
import { Header } from "@/components/Header";
import { WebContainer } from "@/components/WebContainer";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Timestamp, arrayUnion, collection, doc, getDoc, onSnapshot, query, updateDoc, where, writeBatch } from "firebase/firestore";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Platform, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

export default function MessagesTab() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(false);
  const [chats, setChats] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkModalVisible, setBulkModalVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ 
    visible: false, 
    title: "", 
    message: "", 
    type: "info" as "success" | "error" | "info" | "warning",
    onClose: () => {}
  });

  const formatLastSeenLabel = (ts: any | undefined, isOwnLastMessage: boolean) => {
    if (!ts) return "";
    let date: Date | null = null;
    if (ts instanceof Timestamp) {
      date = ts.toDate();
    } else if (ts?.toDate) {
      date = ts.toDate();
    } else if (typeof ts === "object" && typeof ts.seconds === "number") {
      date = new Date(ts.seconds * 1000);
    } else if (ts instanceof Date) {
      date = ts;
    }
    if (!date) return "";
    const now = new Date().getTime();
    const diffMs = now - date.getTime();
    if (diffMs < 0) return "";
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffMinutes < 1) {
      return isOwnLastMessage ? "Vio tu mensaje recién" : "Activo recién";
    }
    if (diffHours < 1) {
      return isOwnLastMessage ? `Vio tu mensaje hace ${diffMinutes} min` : `Activo hace ${diffMinutes} min`;
    }
    if (diffHours < 24) {
      return isOwnLastMessage ? `Vio tu mensaje hace ${diffHours} h` : `Activo hace ${diffHours} h`;
    }
    if (diffDays === 1) {
      return isOwnLastMessage ? "Vio tu mensaje hace 1 día" : "No abre la conversación hace 1 día";
    }
    return isOwnLastMessage ? `Vio tu mensaje hace ${diffDays} días` : `No abre la conversación hace ${diffDays} días`;
  };

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
    
    setNetworkError(false);
    setChats(list);
    setLoading(false);
  }, (error) => {
    console.error("Error fetching conversations:", error);
    setNetworkError(true);
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
            logger.log("Error fetching user profile", uid, e);
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

  // Auto-fetch missing vehicle data for chats that have vehicleId but no vehicleData
  useEffect(() => {
    const missingVehicles = chats.filter(c => c.vehicleId && !c.vehicleData);
    if (missingVehicles.length === 0) return;

    const fetchVehicles = async () => {
      await Promise.all(missingVehicles.map(async (chat) => {
        try {
          const vRef = doc(db, "vehicles", chat.vehicleId);
          const vSnap = await getDoc(vRef);
          if (vSnap.exists()) {
            const v = vSnap.data() as any;
            const vData = {
                id: v.id,
                brand: v.brand,
                model: v.model,
                year: v.year,
                price: v.price,
                currency: v.currency,
                cover: v.coverImage ?? v.images?.cover ?? v.images?.gallery?.[0] ?? v.cover ?? ""
            };
            // Update conversation to cache this data
            const cRef = doc(db, "conversations", chat.id);
            await updateDoc(cRef, { vehicleData: vData });
          }
        } catch (e) {
          logger.log("Error fetching vehicle for chat", chat.id, e);
        }
      }));
    };
    
    fetchVehicles();
  }, [chats]);


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

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  const toggleSelectionMode = () => {
    setSelectionMode((prev) => !prev);
    setSelectedIds([]);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      return [...prev, id];
    });
  };

  const selectAll = () => {
    setSelectedIds(chats.map((c) => c.id));
  };

  const confirmBulkDelete = async () => {
    if (!user || selectedIds.length === 0) return;
    try {
      const batch = writeBatch(db);
      selectedIds.forEach((id) => {
        const ref = doc(db, "conversations", id);
        batch.update(ref, { deletedBy: arrayUnion(user.uid) });
      });
      await batch.commit();
      setSelectedIds([]);
      setSelectionMode(false);
      setBulkModalVisible(false);
      showAlert("Éxito", "Los chats seleccionados fueron eliminados.", "success");
    } catch (e) {
      setBulkModalVisible(false);
      showAlert("Error", "No se pudieron eliminar los chats seleccionados.", "error");
    }
  };

    const renderItem = useCallback(({ item }: { item: any }) => {
    const otherProfile = profiles.get(item.otherUid) || {};
    const displayName = otherProfile.firstName ? `${otherProfile.firstName} ${otherProfile.lastName || ""}` : (otherProfile.name || otherProfile.displayName || "Usuario");
    const avatar = otherProfile.photoURL || otherProfile.avatar || null;
    const initials = otherProfile.initials || (displayName ? displayName.slice(0, 2).toUpperCase() : "MC");
    const avatarColor = otherProfile.avatarColor || theme.accent;

    // Handle vehicle context
    const vehicleName = item.vehicleData ? `${item.vehicleData.brand} ${item.vehicleData.model}` : null;
    const vehicleCover = item.vehicleData?.cover || null;
    
      const isUnread = user && item.lastSenderId !== user.uid && (!item.readBy || !Array.isArray(item.readBy) || !item.readBy.includes(user.uid));
      const lastSeenMap = item.lastSeen || {};
      const myId = user?.uid || "";
      const peerId = item.otherUid;
      const peerLastSeen = peerId ? lastSeenMap[peerId] : undefined;
      const isOwnLastMessage = !!myId && item.lastSenderId === myId;
      const lastSeenLabel = peerLastSeen ? formatLastSeenLabel(peerLastSeen, isOwnLastMessage) : "";

    if (selectionMode) {
      const checked = selectedIds.includes(item.id);
      return (
        <TouchableOpacity
          onPress={() => toggleSelect(item.id)}
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
          <Ionicons
            name={checked ? "checkmark-circle" : "ellipse-outline"}
            size={22}
            color={checked ? theme.accent : theme.textMuted}
            style={{ marginRight: 12 }}
          />
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
                  cachePolicy="memory-disk"
                  transition={200}
                  placeholder={{ color: avatarColor }}
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
            </View>

            {vehicleName && (
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                    {vehicleCover ? (
                      <Image
                        source={{ uri: vehicleCover }}
                        style={{ width: 24, height: 24, borderRadius: 4, marginRight: 6 }}
                        cachePolicy="memory-disk"
                        transition={150}
                      />
                    ) : (
                      <Ionicons name="car-sport-outline" size={12} color={theme.accent} style={{ marginRight: 4 }} />
                    )}
                    <Text style={{ color: theme.accent, fontSize: 12, fontWeight: "600", marginRight: 8 }}>{vehicleName}</Text>
                    {item.vehicleId && (
                      <TouchableOpacity
                        onPress={() => router.push(`/car/${item.vehicleId}` as any)}
                        style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border }}
                      >
                        <Text style={{ color: theme.text, fontSize: 11, fontWeight: "600" }}>Ver</Text>
                      </TouchableOpacity>
                    )}
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
        </TouchableOpacity>
      );
    }

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
                  conversationId: item.id,
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
                  cachePolicy="memory-disk"
                  transition={200}
                  placeholder={{ color: avatarColor }}
                />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 18 }}>
                  {initials}
                </Text>
              )}
            </View>
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4, alignItems: "center" }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ color: theme.text, fontWeight: isUnread ? "800" : "600", fontSize: 16 }} numberOfLines={1}>
                  {displayName}
                </Text>
                {lastSeenLabel !== "" && (
                  <Text style={{ color: theme.textMuted, fontSize: 11 }} numberOfLines={1}>
                    {lastSeenLabel}
                  </Text>
                )}
              </View>
              {isUnread && (
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: theme.accent + "20", borderWidth: 1, borderColor: theme.accent }}>
                  <Text style={{ color: theme.accent, fontSize: 11, fontWeight: "700" }}>Nuevo</Text>
                </View>
              )}
              {item.updatedAt && (
                <Text style={{ color: theme.textMuted, fontSize: 12, marginLeft: 8 }}>
                  {new Date(item.updatedAt.seconds * 1000).toLocaleDateString()}
                </Text>
              )}
            </View>

            {vehicleName && (
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                    {vehicleCover ? (
                      <Image
                        source={{ uri: vehicleCover }}
                        style={{ width: 24, height: 24, borderRadius: 4, marginRight: 6 }}
                        cachePolicy="memory-disk"
                        transition={150}
                      />
                    ) : (
                      <Ionicons name="car-sport-outline" size={12} color={theme.accent} style={{ marginRight: 4 }} />
                    )}
                    <Text style={{ color: theme.accent, fontSize: 12, fontWeight: "600", marginRight: 8 }}>{vehicleName}</Text>
                    {item.vehicleId && (
                      <TouchableOpacity
                        onPress={() => router.push(`/car/${item.vehicleId}` as any)}
                        style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border }}
                      >
                        <Text style={{ color: theme.text, fontSize: 11, fontWeight: "600" }}>Ver</Text>
                      </TouchableOpacity>
                    )}
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

          
        </TouchableOpacity>
      </Swipeable>
    );
  }, [profiles, selectionMode, selectedIds, user, theme, router]);

  if (Platform.OS === "web") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Header title="Mensajes" />
        <WebContainer>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Ionicons name="chatbubbles-outline" size={56} color={theme.textMuted} style={{ opacity: 0.4, marginBottom: 12 }} />
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 8 }}>
              Mensajes disponibles en la App
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: "center", marginBottom: 24, maxWidth: 340, lineHeight: 22 }}>
              Descargá la app de Matchcars para chatear con vendedores y compradores en tiempo real.
            </Text>
            <DownloadAppBanner message="Descargá la App para ver tus mensajes" compact />
          </View>
        </WebContainer>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, marginTop: 16, marginBottom: 8 }}>
            <Text style={{ fontSize: 24, fontWeight: "700", color: theme.text }}>
              Mensajes
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              {chats.some(item => user && item.lastSenderId !== user.uid && (!item.readBy || !Array.isArray(item.readBy) || !item.readBy.includes(user.uid))) && (
                  <TouchableOpacity onPress={handleMarkAllAsRead} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="checkmark-done-outline" size={20} color={theme.accent} />
                      <Text style={{ color: theme.accent, fontSize: 14, fontWeight: "600" }}>Marcar leídos</Text>
                  </TouchableOpacity>
              )}
              <TouchableOpacity onPress={toggleSelectionMode} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name={selectionMode ? "close-circle-outline" : "checkmark-circle-outline"} size={20} color={theme.text} />
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>{selectionMode ? "Cancelar" : "Seleccionar"}</Text>
              </TouchableOpacity>
            </View>
        </View>
        {chats.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 6 }}>
              Seguí chateando
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 2 }}
            >
              {chats.slice(0, 8).map((item) => {
                const otherProfile = profiles.get(item.otherUid) || {};
                const displayName =
                  otherProfile.firstName
                    ? `${otherProfile.firstName} ${otherProfile.lastName || ""}`
                    : (otherProfile.name || otherProfile.displayName || "Usuario");
                const avatar = otherProfile.photoURL || otherProfile.avatar || null;
                const initials = otherProfile.initials || (displayName ? displayName.slice(0, 2).toUpperCase() : "MC");
                const avatarColor = otherProfile.avatarColor || theme.accent;
                const isUnread =
                  user &&
                  item.lastSenderId !== user.uid &&
                  (!item.readBy || !Array.isArray(item.readBy) || !item.readBy.includes(user.uid));

                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() =>
                      router.push({
                        pathname: "/(screens)/chat/[uid]",
                        params: {
                          uid: item.otherUid,
                          name: displayName,
                          conversationId: item.id,
                          vehicleId: item.vehicleId,
                          vehicleData: item.vehicleData ? JSON.stringify(item.vehicleData) : undefined,
                        },
                      })
                    }
                    style={{
                      marginRight: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: theme.card,
                      borderWidth: isUnread ? 1.5 : 1,
                      borderColor: isUnread ? theme.accent : theme.likeBoxBackground,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                    activeOpacity={0.85}
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: avatarColor,
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                      }}
                    >
                      {avatar ? (
                        <Image
                          source={{ uri: avatar }}
                          style={{ width: 28, height: 28, borderRadius: 14 }}
                          cachePolicy="memory-disk"
                          transition={200}
                          placeholder={{ color: avatarColor }}
                        />
                      ) : (
                        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
                          {initials}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={{
                        color: theme.text,
                        fontSize: 12,
                        fontWeight: isUnread ? "700" : "500",
                        maxWidth: 120,
                      }}
                      numberOfLines={1}
                    >
                      {displayName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
        {selectionMode && (
          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>{selectedIds.length} seleccionados</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <TouchableOpacity onPress={selectAll} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: theme.background }}>
                <Ionicons name="list-outline" size={18} color={theme.text} />
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>Seleccionar todos</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setBulkModalVisible(true)} disabled={selectedIds.length === 0} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: theme.background, opacity: selectedIds.length === 0 ? 0.5 : 1 }}>
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
                <Text style={{ color: "#ef4444", fontSize: 13, fontWeight: "600" }}>Eliminar seleccionados</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : networkError ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
            <Ionicons name="cloud-offline-outline" size={48} color={theme.textMuted} style={{ marginBottom: 12, opacity: 0.6 }} />
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600", textAlign: "center", marginBottom: 8 }}>
              Sin conexión
            </Text>
            <Text style={{ color: theme.textMuted, textAlign: "center", fontSize: 14 }}>
              No se pudieron cargar los mensajes. Verificá tu conexión y volvé a intentar.
            </Text>
          </View>
        ) : chats.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
            <Ionicons name="chatbubbles-outline" size={64} color={theme.textMuted} style={{ marginBottom: 16, opacity: 0.5 }} />
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: "600", marginBottom: 8, textAlign: "center" }}>
              No tenés conversaciones
            </Text>
            <Text style={{ color: theme.textMuted, textAlign: "center", marginBottom: 24, fontSize: 14, lineHeight: 20 }}>
              Cuando te interese un auto, contactá al vendedor y tus chats aparecerán acá.
            </Text>
            <TouchableOpacity 
              onPress={() => router.push("/")}
              style={{ 
                backgroundColor: theme.accent, 
                paddingVertical: 12, 
                paddingHorizontal: 24, 
                borderRadius: 999 
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>
                Buscar autos
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={chats}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            windowSize={5}
            maxToRenderPerBatch={10}
            initialNumToRender={15}
            removeClippedSubviews={true}
          />
        )}

        <Modal
          animationType="fade"
          transparent={true}
          visible={bulkModalVisible}
          onRequestClose={() => setBulkModalVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}>
            <View style={{ width: "80%", maxWidth: 320, backgroundColor: theme.card, borderRadius: 20, padding: 24, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.background, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <Ionicons name="trash-outline" size={24} color="#ef4444" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text, marginBottom: 8, textAlign: "center" }}>
                Eliminar chats seleccionados
              </Text>
              <Text style={{ fontSize: 14, color: theme.textMuted, textAlign: "center", marginBottom: 24, lineHeight: 20 }}>
                ¿Querés eliminar {selectedIds.length} conversaciones?{"\n"}Se ocultarán de tu lista.
              </Text>
              <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
                <TouchableOpacity
                  onPress={() => setBulkModalVisible(false)}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.background, alignItems: "center" }}
                >
                  <Text style={{ color: theme.text, fontWeight: "600" }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={confirmBulkDelete}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#ef4444", alignItems: "center" }}
                >
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

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
