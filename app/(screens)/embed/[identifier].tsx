import { useAgencyProfile } from "@/hooks/useAgencyProfile";
import { db } from "@/lib/firebase";
import { formatNumber } from "@/utils/format";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

// Standalone, iframe-friendly widget for an agency's own external website.
// Deliberately does NOT reuse app/(screens)/user-profile/[uid].tsx's internal
// components (tightly coupled to ~15 local hooks there) or CarCard (navigates
// via router.push, which would break inside a 3rd-party iframe).

interface EmbedVehicle {
  id: string;
  brand?: string;
  model?: string;
  price?: number;
  currency?: string;
  coverImage?: string;
  createdAtSeconds: number;
}

function openExternal(url: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
  } else {
    Linking.openURL(url).catch(() => {});
  }
}

function formatPrice(price?: number, currency?: string) {
  if (!price) return "";
  const symbol = currency === "USD" ? "US$" : "$";
  return `${symbol} ${formatNumber(price)}`;
}

function EmbedVehicleTile({ vehicle, onPress }: { vehicle: EmbedVehicle; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        width: "100%",
        borderRadius: 10,
        overflow: "hidden",
        backgroundColor: "#1E293B",
      }}
    >
      {vehicle.coverImage ? (
        <Image source={{ uri: vehicle.coverImage }} style={{ width: "100%", height: 90 }} resizeMode="cover" />
      ) : (
        <View style={{ width: "100%", height: 90, alignItems: "center", justifyContent: "center", backgroundColor: "#334155" }}>
          <Ionicons name="car-sport-outline" size={24} color="#64748B" />
        </View>
      )}
      <View style={{ padding: 8 }}>
        <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }} numberOfLines={1}>
          {[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Vehículo"}
        </Text>
        <Text style={{ color: "#F59E0B", fontSize: 12, fontWeight: "800", marginTop: 2 }}>
          {formatPrice(vehicle.price, vehicle.currency)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function EmbedScreen() {
  const { identifier } = useLocalSearchParams<{ identifier: string }>();
  const { uid, profileData, loading: profileLoading, notFound } = useAgencyProfile(identifier);
  const [vehicles, setVehicles] = useState<EmbedVehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const { width } = useWindowDimensions();

  const columns = width >= 720 ? 4 : width >= 480 ? 3 : 2;

  useEffect(() => {
    if (!uid) {
      setVehicles([]);
      setVehiclesLoading(false);
      return;
    }
    let cancelled = false;
    setVehiclesLoading(true);
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "vehicles"), where("userId", "==", uid)));
        const items: EmbedVehicle[] = [];
        snap.forEach((docSnap) => {
          const data: any = docSnap.data();
          if (!data.published || data.status === "sold" || data.status === "deleted") return;
          if (["pending", "pending_review", "rejected", "blocked"].includes(data.status)) return;
          items.push({
            id: docSnap.id,
            brand: data.brand,
            model: data.model,
            price: data.price,
            currency: data.currency,
            coverImage: data.coverImage ?? data.images?.cover ?? data.images?.gallery?.[0] ?? undefined,
            createdAtSeconds: data.createdAt?.seconds || 0,
          });
        });

        const highlightIds: string[] = profileData?.highlightedVehicleIds || [];
        const highlighted = highlightIds.length
          ? items.filter((v) => highlightIds.includes(v.id))
          : [];
        const rest = items
          .filter((v) => !highlighted.some((h) => h.id === v.id))
          .sort((a, b) => b.createdAtSeconds - a.createdAtSeconds);

        if (!cancelled) setVehicles([...highlighted, ...rest].slice(0, 8));
      } catch {
        if (!cancelled) setVehicles([]);
      } finally {
        if (!cancelled) setVehiclesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, profileData?.highlightedVehicleIds]);

  const profileUrl = profileData?.slug
    ? `https://matchcars.app/agencia/${profileData.slug}`
    : uid
    ? `https://matchcars.app/user-profile/${uid}`
    : "https://matchcars.app";

  const agencyName = profileData?.agencyName || "Agencia";
  const logoUrl = profileData?.logoUrl || profileData?.photoURL;
  const rating = typeof profileData?.sellerRating === "number" ? profileData.sellerRating : null;
  const reviewCount = profileData?.sellerReviewCount || 0;

  if ((profileLoading && !profileData) || (notFound && !uid)) {
    return (
      <View style={{ flex: 1, minHeight: 300, alignItems: "center", justifyContent: "center", backgroundColor: "#0F172A" }}>
        {notFound ? (
          <Text style={{ color: "#94A3B8", fontSize: 13 }}>Perfil no disponible.</Text>
        ) : (
          <ActivityIndicator color="#F59E0B" />
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, width: "100%", backgroundColor: "#0F172A", padding: 14 }}>
      {/* Header */}
      <TouchableOpacity
        onPress={() => openExternal(profileUrl)}
        style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "#1E293B",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          ) : (
            <Text style={{ color: "#FFFFFF", fontWeight: "800" }}>{agencyName.slice(0, 2).toUpperCase()}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 14 }} numberOfLines={1}>
            {agencyName}
          </Text>
          {rating !== null && rating > 0 && (
            <Text style={{ color: "#F59E0B", fontSize: 11, fontWeight: "700" }}>
              ★ {rating.toFixed(1)} {reviewCount ? `(${reviewCount})` : ""}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Vehicle grid */}
      {vehiclesLoading ? (
        <ActivityIndicator color="#F59E0B" style={{ marginTop: 20 }} />
      ) : vehicles.length === 0 ? (
        <Text style={{ color: "#94A3B8", fontSize: 12, textAlign: "center", marginTop: 20 }}>
          Sin vehículos publicados por el momento.
        </Text>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {vehicles.map((v) => (
            <View key={v.id} style={{ width: `${100 / columns}%`, paddingRight: 8, paddingBottom: 8 } as any}>
              <EmbedVehicleTile vehicle={v} onPress={() => openExternal(`https://matchcars.app/car/${v.id}`)} />
            </View>
          ))}
        </View>
      )}

      {/* CTA */}
      <TouchableOpacity
        onPress={() => openExternal(profileUrl)}
        style={{
          marginTop: 10,
          backgroundColor: "#F59E0B",
          borderRadius: 8,
          paddingVertical: 10,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#0F172A", fontWeight: "800", fontSize: 13 }}>Ver stock completo en Matchcars</Text>
      </TouchableOpacity>

      {/* Powered by */}
      <TouchableOpacity
        onPress={() => openExternal("https://matchcars.app")}
        style={{ alignItems: "center", marginTop: 8 }}
      >
        <Text style={{ color: "#475569", fontSize: 10 }}>Powered by Matchcars</Text>
      </TouchableOpacity>
    </View>
  );
}
