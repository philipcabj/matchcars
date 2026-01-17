import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ChatWithUserScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { uid, name: paramName } = useLocalSearchParams<{ uid: string; name?: string }>();
  const peerUid = typeof uid === "string" ? uid : "";
  const [loading, setLoading] = useState(true);
  const [peerName, setPeerName] = useState<string>("");
  const [peerInitials, setPeerInitials] = useState<string>("MC");
  const [peerAvatarColor, setPeerAvatarColor] = useState<string>(theme.accent);
  const [messages, setMessages] = useState<Array<{ id: string; senderId: string; text: string; createdAt: any }>>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<any>>(null);

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
      } catch {
        setPeerName("Usuario");
        setPeerInitials("MC");
        setPeerAvatarColor(theme.accent);
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
        if (!cSnap.exists()) {
          await setDoc(cRef, { members: [user.uid, peerUid], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        } else {
          const data = cSnap.data() as any;
          const members: string[] = Array.isArray(data?.members) ? data.members : [];
          const ensureMembers = Array.from(new Set([...(members || []), user.uid, peerUid]));
          if (ensureMembers.length !== members.length) {
            await updateDoc(cRef, { members: ensureMembers, updatedAt: serverTimestamp() });
          } else {
            await updateDoc(cRef, { updatedAt: serverTimestamp() });
          }
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
      await updateDoc(cRef, { lastMessage: text, lastSenderId: user.uid, updatedAt: serverTimestamp() });
      setInput("");
    } catch (e: any) {
      Alert.alert("No se pudo enviar", String(e?.message || "Revisá tu conexión o intentá nuevamente."));
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
      <Header />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.inputBackground }}>
            <Text style={{ color: theme.text }}>← Volver</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/(tabs)")} style={{ borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.inputBackground }}>
            <Text style={{ color: theme.text }}>Ir al inicio</Text>
          </TouchableOpacity>
        </View>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8, alignItems: "center" }}>
          <View style={{ width: "80%", height: 1, backgroundColor: theme.accent, marginBottom: 8 }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: peerAvatarColor, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>{peerInitials}</Text>
            </View>
            <Text style={{ color: theme.title, fontWeight: "800", fontSize: 18, maxWidth: "60%" }} numberOfLines={1} ellipsizeMode="tail">{peerName || "Chat"}</Text>
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/report/[id]", params: { id: peerUid, type: "user" } })}
              style={{ marginLeft: 4, padding: 4 }}
            >
               <Ionicons name="flag-outline" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={{ width: "80%", height: 1, backgroundColor: theme.accent, marginTop: 8 }} />
        </View>
        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          {loading ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                item.senderId === user.uid ? (
                  <View style={{ alignItems: "flex-end", paddingVertical: 4 }}>
                    <View style={{ maxWidth: "80%", backgroundColor: theme.accent, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12 }}>
                      <Text style={{ color: theme.buttonText }}>{item.text}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={{ alignItems: "flex-start", paddingVertical: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: peerAvatarColor, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 12 }}>{peerInitials}</Text>
                      </View>
                      <View style={{ maxWidth: "75%", backgroundColor: theme.card, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12 }}>
                        <Text style={{ color: theme.text }}>{item.text}</Text>
                      </View>
                    </View>
                  </View>
                )
              )}
              contentContainerStyle={{ paddingVertical: 8 }}
              onContentSizeChange={() => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50)}
            />
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.likeBoxBackground, backgroundColor: theme.headerBackground }}>
          <TextInput value={input} onChangeText={setInput} placeholder="Escribí un mensaje" placeholderTextColor={theme.textMuted} style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10, color: theme.text, backgroundColor: theme.inputBackground, borderRadius: 12, borderWidth: 1, borderColor: theme.likeBoxBackground }} />
          <TouchableOpacity onPress={send} disabled={!input.trim() || sending} style={{ backgroundColor: input.trim() && !sending ? theme.accent : theme.textMuted, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 10 }}>
            <Ionicons name="send" size={18} color={theme.buttonText} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
