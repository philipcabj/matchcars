import { CustomAlert } from "@/components/CustomAlert";
import { DownloadAppBanner } from "@/components/DownloadAppBanner";
import { Header } from "@/components/Header";
import { WebContainer } from "@/components/WebContainer";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { sendNotificationEmail } from "@/lib/mail";
import { sendPushNotification } from "@/lib/notifications";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { addDoc, arrayUnion, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ChatWithUserScreen() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
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

  const [activeVehicleData, setActiveVehicleData] = useState<any>(null);
  const [currentVehicleId, setCurrentVehicleId] = useState<string | null>(vehicleId || null);

  useEffect(() => {
    if (vehicleId) setCurrentVehicleId(vehicleId);
  }, [vehicleId]);

  // Initial load from params
  useEffect(() => {
    if (vehicleDataParam) {
        try {
            const parsed = JSON.parse(vehicleDataParam);
            const normalized = {
                ...parsed,
                cover: parsed.coverImage ?? parsed.images?.cover ?? parsed.images?.gallery?.[0] ?? parsed.cover ?? ""
            };
            setActiveVehicleData(normalized);
        } catch {}
    }
  }, [vehicleDataParam]);

  // Real-time listener for vehicle data (if vehicleId exists)
  useEffect(() => {
    if (!currentVehicleId) return;
    
    // Si ya tenemos una cover válida de los params, quizás no sea urgente, 
    // pero igual escuchamos cambios para precio/estado, etc.
    // La prioridad es que si NO hay cover, esto la traiga.

    const unsub = onSnapshot(doc(db, "vehicles", currentVehicleId), (snap) => {
        if (snap.exists()) {
            const v = snap.data() as any;
            const cover = v.coverImage ?? v.images?.cover ?? v.images?.gallery?.[0] ?? v.cover ?? "";
            
            // Actualizamos activeVehicleData con la data fresca
            setActiveVehicleData((prev: any) => ({
                ...(prev || {}),
                id: snap.id,
                brand: v.brand,
                model: v.model,
                year: v.year,
                price: v.price,
                currency: v.currency,
                cover: cover || (prev?.cover || "") // Prefer fresh cover, fallback to existing if empty (rare)
            }));
        }
    });

    return () => unsub();
  }, [currentVehicleId]);

  const convId = useMemo(() => {
    const a = String(user?.uid || "");
    const b = String(peerUid || "");
    const arr = [a, b].sort();
    return arr.join("_");
  }, [user?.uid, peerUid]);

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
          if (activeVehicleData) {
            commonData.vehicleData = activeVehicleData;
          } else if (!activeVehicleData) {
             try {
                const vRef = doc(db, "vehicles", vehicleId);
                const vSnap = await getDoc(vRef);
                if (vSnap.exists()) {
                     const v = vSnap.data() as any;
                     const vData = {
                         id: vSnap.id,
                         brand: v.brand,
                         model: v.model,
                         year: v.year,
                         price: v.price,
                         currency: v.currency,
                         cover: v.coverImage ?? v.images?.cover ?? v.images?.gallery?.[0] ?? v.cover ?? ""
                     };
                     setActiveVehicleData(vData);
                     commonData.vehicleData = vData;
                }
             } catch {}
          }
        } else if (cSnap.exists()) {
            // Try to recover vehicleId from conversation if not in params
            const d = cSnap.data() as any;

            if (d.vehicleId && !currentVehicleId) {
                setCurrentVehicleId(d.vehicleId);
            }

            if (d.vehicleId && !activeVehicleData) {
                // Fetch vehicle data if missing
                try {
                    const vRef = doc(db, "vehicles", d.vehicleId);
                    const vSnap = await getDoc(vRef);
                    if (vSnap.exists()) {
                        const v = vSnap.data() as any;
                        const vData = {
                            id: vSnap.id,
                            brand: v.brand,
                            model: v.model,
                            year: v.year,
                            price: v.price,
                            currency: v.currency,
                            cover: v.coverImage ?? v.images?.cover ?? v.images?.gallery?.[0] ?? v.cover ?? ""
                        };
                        setActiveVehicleData(vData);
                        // Update conversation with vehicleData for future
                        await updateDoc(cRef, { vehicleData: vData });
                    }
                } catch {}
            } else if (d.vehicleData && !activeVehicleData) {
                setActiveVehicleData(d.vehicleData);
            }
        }
        
        // Mark as read by current user when entering
        commonData.readBy = arrayUnion(user.uid);

        if (cSnap.exists()) {
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
      const myName = (profile?.firstName && profile?.lastName) 
        ? `${profile.firstName} ${profile.lastName}`.trim()
        : (profile?.firstName || user.displayName || (user.email?.split('@')[0] ?? "Usuario")).trim();
      
      let carModel = "";
      // Try from local params
      if (activeVehicleData) {
        carModel = `${activeVehicleData.brand} ${activeVehicleData.model}`.trim();
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

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <WebContainer>
          <Header title={peerName || "Chat"} showBack />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <Ionicons name="chatbubbles-outline" size={64} color={theme.textMuted} style={{ marginBottom: 20 }} />
              <Text style={{ color: theme.text, fontSize: 18, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' }}>
                  Chat disponible en la App
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 14, marginBottom: 30, textAlign: 'center', maxWidth: 400 }}>
                  Para chatear con {peerName || "el vendedor"}, por favor descargá nuestra aplicación móvil.
              </Text>
              <View style={{ width: '100%', maxWidth: 400 }}>
                <DownloadAppBanner message="Descargá la App para chatear" />
              </View>
          </View>
        </WebContainer>
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
                  <ExpoImage source={{ uri: peerPhotoUrl }} style={{ width: 36, height: 36, borderRadius: 18 }} contentFit="cover" />
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
        {activeVehicleData && (
          <TouchableOpacity 
            onPress={() => router.push(`/car/${activeVehicleData.id || currentVehicleId}` as any)}
            activeOpacity={0.8}
            style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.card, padding: 10, marginHorizontal: 16, marginTop: 10, borderRadius: 12, gap: 12, borderWidth: 1, borderColor: theme.badgeBorder }}
          >
            {activeVehicleData.cover ? (
              <ExpoImage
                source={{ uri: activeVehicleData.cover }}
                style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: theme.background }}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: theme.background, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="car-sport-outline" size={24} color={theme.textMuted} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: "700", fontSize: 15 }} numberOfLines={1}>
                {activeVehicleData.brand} {activeVehicleData.model} {activeVehicleData.year}
              </Text>
              <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 13, marginTop: 2 }}>
                {activeVehicleData.currency} {Number(activeVehicleData.price).toLocaleString("es-AR")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
          </TouchableOpacity>
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
                          <ExpoImage source={{ uri: peerPhotoUrl }} style={{ width: 32, height: 32, borderRadius: 16 }} contentFit="cover" />
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
