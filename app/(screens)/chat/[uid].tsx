import { CustomAlert } from "@/components/CustomAlert";
import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { sendNotificationEmail } from "@/lib/mail";
import { sendPushNotification } from "@/lib/notifications";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { addDoc, arrayUnion, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ChatWithUserScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { uid, name: paramName, vehicleId, vehicleData: vehicleDataParam } = useLocalSearchParams<{ uid: string; name?: string; vehicleId?: string; vehicleData?: string }>();
  const peerUid = typeof uid === "string" ? uid : "";
  const [loading, setLoading] = useState(true);
  const [peerName, setPeerName] = useState<string>("");
  const [peerInitials, setPeerInitials] = useState<string>("MC");
  const [peerAvatarColor, setPeerAvatarColor] = useState<string>(theme.accent);
  const [peerPhotoUrl, setPeerPhotoUrl] = useState<string | null>(null);
  const [peerPushToken, setPeerPushToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ id: string; senderId: string; text: string; createdAt: any }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const listRef = useRef<FlatList<any>>(null);

  // Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ 
    title: "", 
    message: "", 
    type: "info" as "success" | "error" | "info" | "warning" 
  });

  const showAlert = (title: string, message: string, type: "success" | "error" | "info" | "warning" = "info") => {
    setAlertConfig({ title, message, type });
    setAlertVisible(true);
  };

  // Parse vehicle data if available
  const vehicleData = useMemo(() => {
    if (!vehicleDataParam) return null;
    try {
      return JSON.parse(vehicleDataParam);
    } catch {
      return null;
    }
  }, [vehicleDataParam]);

  const convId = useMemo(() => {
    const a = String(user?.uid || "");
    const b = String(peerUid || "");
    const arr = [a, b].sort();
    const baseId = arr.join("_");
    if (vehicleId) return `${baseId}_${vehicleId}`;
    return baseId;
  }, [user?.uid, peerUid, vehicleId]);

  useEffect(() => {
    if (typeof paramName === "string" && paramName.trim()) {
      setPeerName(paramName);
    }
  }, [paramName]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => {
      showSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!user?.uid || !peerUid) return;
    const checkBlocked = async () => {
        try {
            const blockedRef = doc(db, "users", user.uid, "blocked", peerUid);
            const snap = await getDoc(blockedRef);
            if (snap.exists()) {
                setIsBlocked(true);
            }
        } catch {}
    };
    checkBlocked();
  }, [user?.uid, peerUid]);

  useEffect(() => {
    if (!peerUid) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const pSnap = await getDoc(doc(db, "users", peerUid));
        const pd = pSnap.data() as any;
        const name = pd?.firstName || pd?.lastName ? `${pd?.firstName ?? ""} ${pd?.lastName ?? ""}`.trim() : (pd?.displayName || pd?.email || "Usuario");
        setPeerName(name);
        setPeerPushToken(pd?.pushToken || null);
        let initials = String(pd?.initials || "");
        if (!initials) {
          const dn = String(pd?.displayName || "").trim();
          if (dn) {
            const parts = dn.split(/\s+/).filter(Boolean);
            const first = parts[0]?.[0] ?? "";
            const second = parts[1]?.[0] ?? "";
            initials = (first + second) || (parts[0]?.slice(0, 2) ?? "");
          } else {
            const fi = String(pd?.firstName || "").trim()[0] ?? "";
            const li = String(pd?.lastName || "").trim()[0] ?? "";
            initials = (fi + li) || (String(pd?.email || "").slice(0, 2) || "MC");
          }
          initials = initials.toUpperCase();
        }
        setPeerInitials(initials);
        setPeerAvatarColor(pd?.avatarColor || theme.accent);
        setPeerPhotoUrl(pd?.photoURL || pd?.avatar || null);
      } catch {
        setPeerName("Usuario");
        setPeerInitials("MC");
        setPeerAvatarColor(theme.accent);
        setPeerPhotoUrl(null);
      }
    })();
  }, [peerUid, theme.accent]);

  useEffect(() => {
    if (!user?.uid || !peerUid || !convId) {
      setLoading(false);
      return;
    }
    let unsub: (() => void) | undefined;
    let canceled = false;
    (async () => {
      try {
        const cRef = doc(db, "conversations", convId);
        const cSnap = await getDoc(cRef);
        
        const commonData: any = {
          members: [user.uid, peerUid],
          updatedAt: serverTimestamp(),
        };

        if (vehicleId) {
          commonData.vehicleId = vehicleId;
          if (vehicleData) {
            commonData.vehicleData = vehicleData;
          }
        }
        
        // Mark as read by current user when entering
        commonData.readBy = arrayUnion(user.uid);

        if (!cSnap.exists()) {
          await setDoc(cRef, { 
            ...commonData, 
            createdAt: serverTimestamp(),
            // When creating, only I have read it (implicitly)
            readBy: [user.uid]
          });
        } else {
          const data = cSnap.data() as any;
          const members: string[] = Array.isArray(data?.members) ? data.members : [];
          const ensureMembers = Array.from(new Set([...(members || []), user.uid, peerUid]));
          
          await updateDoc(cRef, { 
             ...commonData,
             members: ensureMembers
          });
        }
      } catch {}
      if (canceled) return;
      const ref = query(collection(db, "conversations", convId, "messages"), orderBy("createdAt", "asc"));
      unsub = onSnapshot(ref, (snap) => {
        const arr: { id: string; senderId: string; text: string; createdAt: any }[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          arr.push({ id: d.id, senderId: data.senderId, text: data.text, createdAt: data.createdAt });
        });
        setMessages(arr);
        setLoading(false);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      }, () => setLoading(false));
    })();
    return () => { canceled = true; if (unsub) unsub(); };
  }, [user?.uid, peerUid, convId]);

  const send = async () => {
    const text = input.trim();
    if (!text || !user?.uid || !peerUid || !convId || sending) return;

    if (isBlocked) {
        showAlert("Usuario bloqueado", "No podés enviar mensajes a este usuario.", "error");
        return;
    }

    setSending(true);
    try {
      const cRef = doc(db, "conversations", convId);
      const cSnap = await getDoc(cRef);
      if (!cSnap.exists()) {
        await setDoc(cRef, { members: [user.uid, peerUid], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      } else {
        const data = cSnap.data() as any;
        const members: string[] = Array.isArray(data?.members) ? data.members : [];
        const ensureMembers = Array.from(new Set([...(members || []), user.uid, peerUid]));
        if (ensureMembers.length !== members.length) {
          await updateDoc(cRef, { members: ensureMembers, updatedAt: serverTimestamp() });
        }
      }
      await addDoc(collection(db, "conversations", convId, "messages"), { senderId: user.uid, text, createdAt: serverTimestamp() });
      await updateDoc(cRef, { 
        lastMessage: text, 
        lastSenderId: user.uid, 
        updatedAt: serverTimestamp(),
        readBy: [user.uid], // Reset read status: only I have read this new message
        deletedBy: [] // Revive chat for everyone
      });

      // Send email notification
      const myName = (user.displayName || (user.email?.split('@')[0] ?? "Usuario")).trim();
      
      let carModel = "";
      // Try from local params
      if (vehicleData) {
        carModel = `${vehicleData.brand} ${vehicleData.model}`.trim();
      } 
      // Try from conversation doc if not in params
      else if (cSnap.exists()) {
        const d = cSnap.data() as any;
        if (d?.vehicleData) {
            carModel = `${d.vehicleData.brand} ${d.vehicleData.model}`.trim();
        }
      }

      sendNotificationEmail("message", {
        recipientUid: peerUid,
        recipientName: peerName,
        senderName: myName,
        senderUid: user.uid,
        subject: carModel ? `Consulta por ${carModel}` : `Nuevo mensaje de ${myName}`,
        messagePreview: text.length > 50 ? text.slice(0, 50) + "..." : text,
        carModel: carModel || undefined
      });

      if (peerPushToken) {
        console.log("Sending push notification to:", peerPushToken);
        sendPushNotification(
            peerPushToken,
            myName,
            text,
            { url: `matchcars://chat/${user.uid}` }
        );
      } else {
        console.log("No peer push token found for user:", peerUid);
      }

      setInput("");
    } catch (e: any) {
      showAlert("No se pudo enviar", String(e?.message || "Revisá tu conexión o intentá nuevamente."), "error");
    }
    setSending(false);
  };

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Header />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ color: theme.text, fontSize: 16, textAlign: "center" }}>Para chatear, iniciá sesión o registrate.</Text>
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
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        keyboardVerticalOffset={0}
      >
        <CustomAlert
          visible={alertVisible}
          title={alertConfig.title}
          message={alertConfig.message}
          type={alertConfig.type}
          onClose={() => setAlertVisible(false)}
        />
        <Header
          showBack
          customTitle={
            <TouchableOpacity 
              onPress={() => router.push(`/user-profile/${peerUid}` as any)}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: peerAvatarColor,
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {peerPhotoUrl ? (
                  <Image source={{ uri: peerPhotoUrl }} style={{ width: 36, height: 36 }} />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}>
                    {peerInitials}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, justifyContent: "center" }}>
                <Text
                  style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}
                  numberOfLines={1}
                >
                  {peerName || "Chat"}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                  Ver perfil
                </Text>
              </View>
            </TouchableOpacity>
          }
        />
        {vehicleData && (
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.card, padding: 8, marginHorizontal: 16, marginTop: 8, borderRadius: 12, gap: 10 }}>
              <Image
                source={{ uri: vehicleData.cover }}
                style={{ width: 40, height: 40, borderRadius: 8 }}
                contentFit="cover"
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14 }} numberOfLines={1}>
                  {vehicleData.brand} {vehicleData.model} {vehicleData.year}
                </Text>
                <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 12 }}>
                  {vehicleData.currency} {Number(vehicleData.price).toLocaleString("es-AR")}
                </Text>
              </View>
            </View>
        )}
        <View style={{ flex: 1, paddingHorizontal: 16 }}>
          {loading ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const time = item.createdAt ? (item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt.seconds * 1000)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
                return item.senderId === user.uid ? (
                  <View style={{ alignItems: "flex-end", paddingVertical: 4 }}>
                    <View style={{ maxWidth: "80%", backgroundColor: theme.accent, padding: 12, borderRadius: 16, borderBottomRightRadius: 2 }}>
                      <Text style={{ color: theme.buttonText, fontSize: 16 }}>{item.text}</Text>
                      <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, alignSelf: "flex-end", marginTop: 4 }}>{time}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={{ alignItems: "flex-start", paddingVertical: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: peerAvatarColor, alignItems: "center", justifyContent: "center", marginBottom: 4, overflow: "hidden" }}>
                        {peerPhotoUrl ? (
                          <Image source={{ uri: peerPhotoUrl }} style={{ width: 32, height: 32 }} />
                        ) : (
                          <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 12 }}>{peerInitials}</Text>
                        )}
                      </View>
                      <View style={{ maxWidth: "75%", backgroundColor: theme.card, padding: 12, borderRadius: 16, borderBottomLeftRadius: 2 }}>
                        <Text style={{ color: theme.text, fontSize: 16 }}>{item.text}</Text>
                        <Text style={{ color: theme.textMuted, fontSize: 10, alignSelf: "flex-end", marginTop: 4 }}>{time}</Text>
                      </View>
                    </View>
                  </View>
                );
              }}
              contentContainerStyle={{ paddingVertical: 16, paddingHorizontal: 4 }}
              onContentSizeChange={() => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50)}
            />
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.headerBackground }}>
          <TextInput 
            value={input} 
            onChangeText={setInput} 
            placeholder="Escribí un mensaje..." 
            placeholderTextColor={theme.textMuted} 
            style={{ 
              flex: 1, 
              paddingHorizontal: 16, 
              paddingVertical: 10, 
              color: theme.text, 
              backgroundColor: theme.inputBackground, 
              borderRadius: 24, 
              borderWidth: 1, 
              borderColor: theme.likeBoxBackground,
              fontSize: 16
            }} 
          />
          <TouchableOpacity 
            onPress={send} 
            disabled={!input.trim() || sending || loading} 
            style={{ 
              backgroundColor: input.trim() && !sending && !loading ? theme.accent : theme.textMuted, 
              width: 44,
              height: 44,
              borderRadius: 22, 
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <Ionicons name="send" size={20} color={theme.buttonText} style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
