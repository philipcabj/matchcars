import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { app } from "@/lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { getFunctions, httpsCallable } from "firebase/functions";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ─── Types ───────────────────────────────────────────────────────────────────

interface VehicleMiniCard {
  id: string;
  brand: string;
  model: string;
  year: number;
  price: number;
  currency: string;
  km: number;
  province: string;
  coverImage?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  vehicles?: VehicleMiniCard[];
  loading?: boolean;
}

interface AdvisorResponse {
  message: string;
  vehicles: VehicleMiniCard[];
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function LoadingDots({ color }: { color: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % 4), 420);
    return () => clearInterval(t);
  }, []);
  const dots = ["·", "· ·", "· · ·", "· ·"][frame];
  return (
    <Text style={{ color, fontSize: 22, letterSpacing: 6, lineHeight: 28 }}>
      {dots}
    </Text>
  );
}

function VehicleCard({
  vehicle,
  theme,
  onPress,
}: {
  vehicle: VehicleMiniCard;
  theme: any;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.vehicleCard, { backgroundColor: theme.card, borderColor: theme.likeBoxBackground }]}
    >
      {vehicle.coverImage ? (
        <Image
          source={{ uri: vehicle.coverImage }}
          style={styles.vehicleImage}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.vehicleImage, { backgroundColor: theme.likeBoxBackground, alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="car-outline" size={28} color={theme.textMuted} />
        </View>
      )}
      <View style={{ padding: 8 }}>
        <Text style={{ color: theme.title, fontWeight: "700", fontSize: 12 }} numberOfLines={1}>
          {vehicle.brand} {vehicle.model}
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
          {vehicle.year} · {Number(vehicle.km).toLocaleString("es-AR")} km
        </Text>
        <Text style={{ color: theme.price, fontWeight: "700", fontSize: 12, marginTop: 3 }}>
          {vehicle.currency} {Number(vehicle.price).toLocaleString("es-AR")}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 3 }}>
          <Ionicons name="location-outline" size={10} color={theme.textMuted} />
          <Text style={{ color: theme.textMuted, fontSize: 10 }} numberOfLines={1}>
            {vehicle.province}
          </Text>
        </View>
      </View>
      <View style={{ paddingHorizontal: 8, paddingBottom: 8 }}>
        <Text style={{ color: theme.accent, fontSize: 11, fontWeight: "600" }}>
          Ver auto →
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function MessageBubble({
  item,
  theme,
  onVehiclePress,
}: {
  item: ChatMessage;
  theme: any;
  onVehiclePress: (id: string) => void;
}) {
  const isUser = item.role === "user";

  if (item.loading) {
    return (
      <View style={[styles.row, { justifyContent: "flex-start" }]}>
        <View style={[styles.aiAvatar, { backgroundColor: theme.accent }]}>
          <Ionicons name="sparkles" size={13} color="#fff" />
        </View>
        <View style={[styles.bubble, { backgroundColor: theme.card, minWidth: 56 }]}>
          <LoadingDots color={theme.textMuted} />
        </View>
      </View>
    );
  }

  if (isUser) {
    return (
      <View style={[styles.row, { justifyContent: "flex-end" }]}>
        <View style={[styles.bubble, { backgroundColor: theme.accent, maxWidth: "78%" }]}>
          <Text style={{ color: "#fff", fontSize: 14, lineHeight: 20 }}>{item.content}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, { justifyContent: "flex-start", alignItems: "flex-start" }]}>
      <View style={[styles.aiAvatar, { backgroundColor: theme.accent }]}>
        <Ionicons name="sparkles" size={13} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <View style={[styles.bubble, { backgroundColor: theme.card, alignSelf: "flex-start", maxWidth: "92%" }]}>
          <Text style={{ color: theme.text, fontSize: 14, lineHeight: 20 }}>{item.content}</Text>
        </View>
        {item.vehicles && item.vehicles.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 8 }}
            contentContainerStyle={{ paddingRight: 8 }}
          >
            {item.vehicles.map((v) => (
              <VehicleCard
                key={v.id}
                vehicle={v}
                theme={theme}
                onPress={() => onVehiclePress(v.id)}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

// ─── Suggestion chips ────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Busco SUV familiar hasta $20M",
  "Auto para la ciudad, poco consumo",
  "Sedan con financiamiento, GNC",
  "Pickup 4x4 menos de 100.000 km",
];

// Cap conversation history sent to the Cloud Function so cost/latency don't
// grow unbounded on long chats.
const MAX_HISTORY_MESSAGES = 12;

// ─── Main screen ─────────────────────────────────────────────────────────────

const WELCOME_MSG: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "¡Hola! Soy tu asesor de compra de MatchCars.\n\nContame qué auto estás buscando: presupuesto, tipo de uso, provincia... y yo encuentro las mejores opciones del catálogo real.",
};

export default function AIAdvisorScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const functions = getFunctions(app);
  const callAdvisor = httpsCallable<
    { messages: { role: string; content: string }[] },
    AdvisorResponse
  >(functions, "chatWithAdvisor");

  useEffect(() => {
    const timeout = setTimeout(
      () => flatListRef.current?.scrollToEnd({ animated: true }),
      120
    );
    return () => clearTimeout(timeout);
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || sending) return;

      if (!user) {
        router.push("/login");
        return;
      }

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content,
      };
      const loadingId = `l-${Date.now()}`;
      const loadingMsg: ChatMessage = {
        id: loadingId,
        role: "assistant",
        content: "",
        loading: true,
      };

      const nextMessages = [...messages, userMsg];
      setMessages([...nextMessages, loadingMsg]);
      setInput("");
      setSending(true);

      try {
        const history = nextMessages
          .filter((m) => !m.loading && m.id !== "welcome")
          .slice(-MAX_HISTORY_MESSAGES)
          .map((m) => ({ role: m.role, content: m.content }));

        const result = await callAdvisor({ messages: history });

        const aiMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: result.data.message,
          vehicles:
            result.data.vehicles?.length > 0
              ? result.data.vehicles
              : undefined,
        };

        setMessages((prev) => [
          ...prev.filter((m) => m.id !== loadingId),
          aiMsg,
        ]);
      } catch {
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== loadingId),
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            content:
              "Ups, tuve un problema al consultar el catálogo. ¿Podés intentarlo de nuevo?",
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [messages, sending, user, router, callAdvisor]
  );

  const handleSend = useCallback(
    () => sendMessage(input),
    [input, sendMessage]
  );

  const handleSuggestion = useCallback(
    (text: string) => sendMessage(text),
    [sendMessage]
  );

  const handleVehiclePress = useCallback(
    (id: string) => router.push(`/car/${id}`),
    [router]
  );

  const canSend = input.trim().length > 0 && !sending;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header />

      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.likeBoxBackground }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 2 }}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Ionicons name="sparkles" size={16} color={theme.accent} style={{ marginRight: 6 }} />
        <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16, flex: 1 }}>Asesor IA</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* Message list */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 12 }}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
          renderItem={({ item }) => (
            <MessageBubble
              item={item}
              theme={theme}
              onVehiclePress={handleVehiclePress}
            />
          )}
          ListFooterComponent={
            messages.length === 1 ? (
              <View style={{ marginTop: 20 }}>
                <Text
                  style={{
                    color: theme.textMuted,
                    fontSize: 12,
                    marginBottom: 10,
                    textAlign: "center",
                  }}
                >
                  Probá con alguna de estas búsquedas:
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                  {SUGGESTIONS.map((s) => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => handleSuggestion(s)}
                      style={[
                        styles.chip,
                        { backgroundColor: theme.card, borderColor: theme.accent },
                      ]}
                    >
                      <Text style={{ color: theme.accent, fontSize: 12, fontWeight: "600" }}>
                        {s}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null
          }
        />

        {/* Input bar */}
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: theme.card,
              borderTopColor: theme.likeBoxBackground,
            },
          ]}
        >
          <TextInput
            ref={inputRef}
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.background },
            ]}
            placeholder={
              user
                ? "Describí el auto que buscás..."
                : "Iniciá sesión para usar el asesor"
            }
            placeholderTextColor={theme.textMuted}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            multiline
            maxLength={500}
            editable={!sending}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!canSend}
            style={[
              styles.sendBtn,
              {
                backgroundColor: theme.accent,
                opacity: canSend ? 1 : 0.4,
              },
            ]}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={17} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 14,
    gap: 8,
  },
  aiAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bubble: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 18,
  },
  vehicleCard: {
    width: 148,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginRight: 10,
  },
  vehicleImage: {
    width: "100%",
    height: 88,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 15,
    paddingVertical: 9,
    fontSize: 14,
    maxHeight: 110,
    textAlignVertical: "top",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
});
