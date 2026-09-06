import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { usePriceSuggestion } from "@/hooks/usePriceSuggestion";
import { shareVehicle } from "@/lib/share";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function daysSince(ts: any): number {
  const ms = ts?.toDate ? ts.toDate().getTime() : ts ? new Date(ts).getTime() : 0;
  return ms ? Math.floor((Date.now() - ms) / 86400000) : 0;
}

export default function CarStatsScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicleId = typeof id === "string" ? id : "";

  const [vehicle, setVehicle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<{ total: number; unanswered: number }>({ total: 0, unanswered: 0 });

  useEffect(() => {
    if (!vehicleId) return;
    const unsub = onSnapshot(doc(db, "vehicles", vehicleId), (snap) => {
      setVehicle(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    });
    return () => unsub();
  }, [vehicleId]);

  useEffect(() => {
    if (!vehicleId || !user?.uid) return;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "leads"), where("sellerId", "==", user.uid)));
        const mine = snap.docs.map((d) => d.data()).filter((l: any) => l.vehicleId === vehicleId && !l.deletedAt);
        setLeads({
          total: mine.length,
          unanswered: mine.filter((l: any) => l.status === "new").length,
        });
      } catch {
        // silencioso
      }
    })();
  }, [vehicleId, user?.uid]);

  const price = usePriceSuggestion(
    vehicle?.brand || "",
    vehicle?.model || "",
    vehicle?.year ? String(vehicle.year) : "",
    vehicle?.currency === "USD" ? "USD" : "ARS",
    vehicleId
  );

  const days = vehicle ? daysSince(vehicle.createdAt) : 0;
  const views = vehicle?.views || 0;
  const likes = vehicle?.likesCount || 0;
  const photoCount =
    (vehicle?.images?.cover || vehicle?.coverImage ? 1 : 0) +
    (Array.isArray(vehicle?.images?.gallery) ? vehicle.images.gallery.length : Array.isArray(vehicle?.additionalImages) ? vehicle.additionalImages.length : 0);
  const myPrice = Number(vehicle?.price) || 0;
  const market = !price.loading && price.count > 0 ? price.avg : null;

  const nudges = useMemo(() => {
    const out: { icon: any; text: string; action?: () => void; cta?: string }[] = [];
    if (leads.unanswered > 0) {
      out.push({
        icon: "chatbubble-ellipses",
        text: `Tenés ${leads.unanswered} consulta${leads.unanswered === 1 ? "" : "s"} sin responder.`,
        cta: "Responder",
        action: () => router.push("/(tabs)/messages"),
      });
    }
    if (market && myPrice > market * 1.12) {
      const diff = Math.round(((myPrice - market) / market) * 100);
      out.push({
        icon: "trending-down",
        text: `Tu precio está ${diff}% arriba del promedio (${vehicle?.currency || "ARS"} ${Math.round(market).toLocaleString("es-AR")}). Bajarlo suele multiplicar las consultas.`,
        cta: "Editar precio",
        action: () => router.push(`/car/${vehicleId}` as any),
      });
    }
    if (days >= 21 && leads.total === 0) {
      out.push({
        icon: "time",
        text: `Lleva ${days} días publicado sin consultas. Probá bajar el precio o renovar las fotos.`,
      });
    }
    if (photoCount < 5) {
      out.push({
        icon: "images",
        text: `Solo tenés ${photoCount} foto${photoCount === 1 ? "" : "s"}. Las publicaciones con 6+ reciben más consultas.`,
        cta: "Agregar fotos",
        action: () => router.push(`/car/${vehicleId}` as any),
      });
    }
    return out;
  }, [leads, market, myPrice, days, photoCount, vehicle, vehicleId, router]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Header title="Estadísticas" showBack />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!vehicle) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Header title="Estadísticas" showBack />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ color: theme.textMuted }}>No encontramos esta publicación.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const Stat = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
    <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.likeBoxBackground }}>
      <Text style={{ color: theme.text, fontSize: 22, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: theme.textMuted, fontSize: 12 }}>{label}</Text>
      {sub ? <Text style={{ color: theme.textMuted, fontSize: 10, marginTop: 2 }}>{sub}</Text> : null}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header title="Estadísticas" showBack />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View>
          <Text style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}>
            {vehicle.brand} {vehicle.model} {vehicle.year}
          </Text>
          <Text style={{ color: theme.accent, fontWeight: "700", marginTop: 2 }}>
            {vehicle.currency} {Number(vehicle.price).toLocaleString("es-AR")}
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Stat label="Visitas" value={views} />
          <Stat label="Favoritos" value={likes} />
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Stat label="Consultas" value={leads.total} sub={leads.unanswered > 0 ? `${leads.unanswered} sin responder` : undefined} />
          <Stat label="Días publicado" value={days} />
        </View>

        {market != null && (
          <View style={{ backgroundColor: theme.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.likeBoxBackground }}>
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13, marginBottom: 8 }}>Tu precio vs el mercado</Text>
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
              Promedio de {price.count} similares: {vehicle.currency} {Math.round(market).toLocaleString("es-AR")}
              {"  ·  "}
              {myPrice > market
                ? `vos ${Math.round(((myPrice - market) / market) * 100)}% arriba`
                : myPrice < market
                ? `vos ${Math.round(((market - myPrice) / market) * 100)}% abajo`
                : "alineado"}
            </Text>
          </View>
        )}

        {nudges.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13 }}>Para mejorar</Text>
            {nudges.map((n, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: theme.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.likeBoxBackground }}>
                <Ionicons name={n.icon} size={18} color={theme.accent} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 13 }}>{n.text}</Text>
                  {n.cta && n.action && (
                    <TouchableOpacity onPress={n.action} style={{ marginTop: 6 }}>
                      <Text style={{ color: theme.accent, fontSize: 12, fontWeight: "700" }}>{n.cta} →</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
          <TouchableOpacity
            onPress={() => router.push(`/car/${vehicleId}` as any)}
            style={{ flex: 1, backgroundColor: theme.inputBackground, borderRadius: 999, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: theme.badgeBorder }}
          >
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13 }}>Editar publicación</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => shareVehicle(vehicle).catch(() => {})}
            style={{ flex: 1, backgroundColor: theme.accent, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Compartir</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
