// components/CarCard.tsx
import { useTheme } from "@/contexts/ThemeContext";
import type { Vehicle } from "@/types/vehicle";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, TouchableOpacity, View } from "react-native";

type Props = { vehicle: Vehicle; liked?: boolean; likeDisabled?: boolean; onToggleLike?: () => void; hideLike?: boolean; showEdit?: boolean; onEdit?: () => void; compact?: boolean; horizontal?: boolean; onMessage?: () => void };

export function CarCard({ vehicle, liked = false, likeDisabled = false, onToggleLike, hideLike = false, showEdit = false, onEdit, compact = false, horizontal = false, onMessage }: Props) {
  const router = useRouter();
  const { theme } = useTheme();

  if (!vehicle) return null;

  const imageUrl = vehicle.coverImage || (vehicle as any)?.images?.cover || (vehicle as any)?.images?.gallery?.[0] || "https://placehold.co/800x600?text=Auto";

  return (
    <Pressable
      style={{
        marginBottom: compact ? 10 : 16,
        borderRadius: 14,
        overflow: "hidden",
        backgroundColor: theme.card,
      }}
      onPress={() => router.push(`/car/${vehicle.id}`)}
    >
      {horizontal ? (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Image
            source={{ uri: imageUrl }}
            style={{ width: compact ? 120 : 150, height: compact ? 90 : 110 }}
            contentFit="cover"
            transition={200}
            onError={(e) => console.log("Error loading image:", imageUrl, e.error)}
          />
          <View style={{ flex: 1, padding: compact ? 10 : 12 }}>
            <Text style={{ color: theme.title, fontSize: compact ? 16 : 18, fontWeight: "700" }}>
              {(vehicle.brand ?? "")} {(vehicle.model ?? "")}
            </Text>
            <Text style={{ color: theme.textMuted, marginTop: compact ? 2 : 4, fontSize: compact ? 12 : 14 }}>
              {vehicle.year ?? ""} • {(vehicle.km != null ? vehicle.km.toLocaleString() : "0")} km
            </Text>
            <Text style={{ color: theme.subtext, marginTop: compact ? 2 : 4, fontSize: compact ? 12 : 14 }}>
              {vehicle.location?.province || vehicle.province || "Ubicación no disponible"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: compact ? 6 : 8 }}>
              <Text style={{ color: theme.price, fontSize: compact ? 14 : 16, fontWeight: "700" }}>
                {vehicle.price != null && vehicle.currency ? `${vehicle.currency} ${vehicle.price.toLocaleString()}` : "Consultar"}
              </Text>
              {onMessage && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={(e) => { e.stopPropagation(); onMessage(); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: theme.likeBoxBackground, backgroundColor: theme.inputBackground, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}
                >
                  <Ionicons name={"paper-plane-outline" as any} size={18} color={theme.text} />
                  <Text style={{ color: theme.text, fontWeight: "700" }}>Mensaje</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      ) : (
        <>
          <Image
            source={{ uri: imageUrl }}
            style={{ width: "100%", height: compact ? 130 : 200 }}
            contentFit="cover"
            transition={200}
            onError={(e) => console.log("Error loading image:", imageUrl, e.error)}
          />
          <View style={{ padding: compact ? 10 : 12 }}>
            <Text style={{ color: theme.title, fontSize: compact ? 16 : 18, fontWeight: "700" }}>
              {(vehicle.brand ?? "")} {(vehicle.model ?? "")} {(vehicle.version ?? "")}
            </Text>
            <Text style={{ color: theme.textMuted, marginTop: compact ? 2 : 4, fontSize: compact ? 12 : 14 }}>
              {vehicle.year ?? ""} • {(vehicle.km != null ? vehicle.km.toLocaleString() : "0")} km
            </Text>
            <Text style={{ color: theme.subtext, marginTop: compact ? 2 : 4, fontSize: compact ? 12 : 14 }}>
              {vehicle.location?.province || vehicle.province || "Ubicación no disponible"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: compact ? 6 : 8 }}>
              <Text style={{ color: theme.price, fontSize: compact ? 14 : 16, fontWeight: "700" }}>
                {vehicle.price != null && vehicle.currency ? `${vehicle.currency} ${vehicle.price.toLocaleString()}` : "Consultar"}
              </Text>
              {onMessage && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={(e) => { e.stopPropagation(); onMessage(); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: theme.likeBoxBackground, backgroundColor: theme.inputBackground, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}
                >
                  <Ionicons name={"paper-plane-outline" as any} size={18} color={theme.text} />
                  <Text style={{ color: theme.text, fontWeight: "700" }}>Mensaje</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </>
      )}
      {showEdit ? (
        <View style={{ position: "absolute", top: 12, right: 12 }}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={(e) => {
              e.stopPropagation();
              if (onEdit) {
                onEdit();
              } else {
                router.push(`/car/${vehicle.id}?tab=ficha`);
              }
            }}
            style={{
              backgroundColor: "#00000066",
              borderRadius: 999,
              padding: 6,
            }}
          >
            <Ionicons name={"create-outline" as any} size={22} color={"#FFFFFF"} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ position: "absolute", top: 12, right: 12, flexDirection: "row", gap: 8 }}>
          {!hideLike && (
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={likeDisabled}
              onPress={(e) => {
                e.stopPropagation();
                onToggleLike && onToggleLike();
              }}
              style={{
                backgroundColor: "#00000066",
                borderRadius: 999,
                padding: 6,
                opacity: likeDisabled ? 0.5 : 1,
              }}
            >
            <Ionicons
              name={(liked ? "heart" : "heart-outline") as any}
              size={22}
              color={liked ? theme.favoriteButton : likeDisabled ? theme.textMuted : "#FFFFFF"}
            />
          </TouchableOpacity>
          )}
        </View>
      )}
      
      
    </Pressable>
  );
}
