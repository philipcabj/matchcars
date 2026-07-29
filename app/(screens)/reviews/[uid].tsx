import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Review {
  id: string;
  reviewerId: string;
  reviewerName: string;
  reviewerPhotoUrl: string | null;
  rating: number;
  review: string;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  createdAt: any;
}

function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= Math.round(rating) ? "star" : "star-outline"}
          size={size}
          color="#F59E0B"
        />
      ))}
    </View>
  );
}

function ReviewItem({ item, theme }: { item: Review; theme: any }) {
  const initials = item.reviewerName
    ? item.reviewerName
        .split(" ")
        .filter(Boolean)
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U";

  const dateStr = item.createdAt?.toDate
    ? item.createdAt.toDate().toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
    : "";

  return (
    <View
      style={{
        backgroundColor: theme.card,
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
        {item.reviewerPhotoUrl ? (
          <Image
            source={{ uri: item.reviewerPhotoUrl }}
            style={{ width: 38, height: 38, borderRadius: 19 }}
          />
        ) : (
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: theme.accent + "30",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 14 }}>{initials}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14 }}>{item.reviewerName || "Usuario"}</Text>
          {(item.vehicleBrand || item.vehicleModel) && (
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
              {[item.vehicleBrand, item.vehicleModel].filter(Boolean).join(" ")}
            </Text>
          )}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <StarRating rating={item.rating} />
          {dateStr ? (
            <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>{dateStr}</Text>
          ) : null}
        </View>
      </View>
      {!!item.review && (
        <Text style={{ color: theme.text, fontSize: 14, lineHeight: 20 }}>"{item.review}"</Text>
      )}
    </View>
  );
}

export default function ReviewsScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [avgRating, setAvgRating] = useState<number | null>(null);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    const q = query(
      collection(db, "reviews"),
      where("sellerId", "==", uid),
      orderBy("createdAt", "desc")
    );
    getDocs(q)
      .then((snap) => {
        const items: Review[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setReviews(items);
        if (items.length > 0) {
          const sum = items.reduce((acc, r) => acc + (r.rating || 0), 0);
          setAvgRating(sum / items.length);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [uid]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700", flex: 1 }}>Opiniones</Text>
        {avgRating !== null && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="star" size={16} color="#F59E0B" />
            <Text style={{ color: theme.text, fontWeight: "700" }}>{avgRating.toFixed(1)}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>({reviews.length})</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : reviews.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <Ionicons name="chatbubble-outline" size={48} color={theme.textMuted} style={{ opacity: 0.4, marginBottom: 12 }} />
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600", textAlign: "center" }}>
            Sin opiniones todavía
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: "center", marginTop: 4 }}>
            Las opiniones de compradores aparecerán acá.
          </Text>
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => <ReviewItem item={item} theme={theme} />}
        />
      )}
    </SafeAreaView>
  );
}
