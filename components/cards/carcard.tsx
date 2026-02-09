// components/CarCard.tsx
import { useTheme } from "@/contexts/ThemeContext";
import { usePriceSuggestion } from "@/hooks/usePriceSuggestion";
import type { Vehicle } from "@/types/vehicle";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, TouchableOpacity, View } from "react-native";
type Props = { vehicle: Vehicle; liked?: boolean; likeDisabled?: boolean; onToggleLike?: () => void; hideLike?: boolean; showEdit?: boolean; onEdit?: () => void; compact?: boolean; horizontal?: boolean; onMessage?: () => void; showMetrics?: boolean; showPriceAnalysis?: boolean };

export function CarCard({ vehicle, liked = false, likeDisabled = false, onToggleLike, hideLike = false, showEdit = false, onEdit, compact = false, horizontal = false, onMessage, showMetrics = false, showPriceAnalysis = false }: Props) {
  const router = useRouter();
  const { theme } = useTheme();
  
  const priceSuggestion = usePriceSuggestion(
    vehicle?.brand || "", 
    vehicle?.model || "", 
    String(vehicle?.year || ""), 
    (vehicle?.currency === "USD" ? "USD" : "ARS")
  );

  if (!vehicle) return null;

  const getPriceQuality = () => {
      if (!vehicle.price || priceSuggestion.loading || priceSuggestion.count === 0) return null;
      const currentPrice = Number(vehicle.price);
      const avg = priceSuggestion.avg;
      const diff = ((currentPrice - avg) / avg) * 100;
      
      if (diff > 5) return { color: "#EF4444", text: "Precio Alto", icon: "caret-up" };
      if (diff < -5) return { color: "#10B981", text: "Buen Precio", icon: "caret-down" };
      return { color: "#3B82F6", text: "En Precio", icon: "checkmark-circle" };
  };

  const priceQuality = showPriceAnalysis ? getPriceQuality() : null;

  const imageUrl = vehicle.coverImage || (vehicle as any)?.images?.cover || (vehicle as any)?.images?.gallery?.[0] || "https://placehold.co/800x600?text=Auto";

  // Helper to render Trust Badge
  const renderTrustBadge = () => {
      // Assuming vehicle has userName and maybe trustLevel (if denormalized)
      // If trustLevel is not on vehicle, we might just show "Usuario" for now
      // Ideally, vehicle documents should be updated to include sellerTrustLevel
      const trustLevel = (vehicle as any).sellerTrustLevel || "new"; 
      
      let badgeColor = "#8E8E93"; // new - gray
      let badgeIcon = "leaf-outline";
      let badgeLabel = "Nuevo";

      if (trustLevel === "active") {
          badgeColor = "#007AFF"; // blue
          badgeIcon = "flash-outline";
          badgeLabel = "Activo";
      } else if (trustLevel === "verified") {
          badgeColor = "#34C759"; // green
          badgeIcon = "checkmark-circle-outline";
          badgeLabel = "Verificado";
      }

      return (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
              <Ionicons name="person-circle-outline" size={16} color={theme.textMuted} />
              <Text style={{ fontSize: 12, color: theme.textMuted }}>
                  {vehicle.userName || "Usuario"}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: badgeColor + "20", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Ionicons name={badgeIcon as any} size={10} color={badgeColor} />
                  <Text style={{ fontSize: 10, color: badgeColor, fontWeight: "600" }}>{badgeLabel}</Text>
              </View>
          </View>
      );
  };

  return (
    <Pressable
      style={{
        marginBottom: compact ? 10 : 16,
        borderRadius: 14,
        overflow: "hidden",
        backgroundColor: theme.card,
        opacity: vehicle.status === 'sold' ? 0.8 : 1, // Slight transparency for sold items
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
            {/* Seller Info for Horizontal Card */}
            {renderTrustBadge()}
            <Text style={{ color: theme.textMuted, marginTop: compact ? 2 : 4, fontSize: compact ? 12 : 14 }}>
              {vehicle.year ?? ""} • {(vehicle.km != null ? vehicle.km.toLocaleString("es-AR") : "0")} km • {vehicle.fuelType || (vehicle as any).fuel || "Nafta"}
            </Text>
            <Text style={{ color: theme.subtext, marginTop: compact ? 2 : 4, fontSize: compact ? 12 : 14 }}>
              {vehicle.location?.province || vehicle.province || "Ubicación no disponible"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: compact ? 6 : 8 }}>
              <Text style={{ color: theme.price, fontSize: compact ? 14 : 16, fontWeight: "700" }}>
                {vehicle.price != null && vehicle.currency ? `${vehicle.currency} ${vehicle.price.toLocaleString("es-AR")}` : "Consultar"}
              </Text>
              
              {showPriceAnalysis && priceQuality && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: priceQuality.color + "20", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                      <Ionicons name={priceQuality.icon as any} size={12} color={priceQuality.color} />
                      <Text style={{ color: priceQuality.color, fontSize: 10, fontWeight: "700" }}>{priceQuality.text}</Text>
                  </View>
              )}

              {onMessage && vehicle.status !== 'sold' && (
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
            {showMetrics && (
              <View style={{ flexDirection: "row", gap: 12, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.likeBoxBackground }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="eye-outline" size={14} color={theme.textMuted} />
                  <Text style={{ fontSize: 12, color: theme.textMuted }}>{vehicle.views || 0} Vistas</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="heart-outline" size={14} color={theme.textMuted} />
                  <Text style={{ fontSize: 12, color: theme.textMuted }}>{vehicle.likesCount || 0} Likes</Text>
                </View>
              </View>
            )}
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
          {vehicle.status === 'sold' && (
             <View style={{ 
               position: 'absolute', 
               left: 0, 
               top: 0, 
               right: 0,
               height: compact ? 130 : 200, 
               backgroundColor: 'rgba(0,0,0,0.5)', 
               alignItems: 'center', 
               justifyContent: 'center',
               zIndex: 10
             }}>
                <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 24, transform: [{ rotate: '-15deg' }], borderWidth: 4, borderColor: '#FFF', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 }}>VENDIDO</Text>
             </View>
          )}
          <View style={{ padding: compact ? 10 : 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <Text style={{ color: theme.title, fontSize: compact ? 16 : 18, fontWeight: "700", flex: 1, flexWrap: 'wrap' }}>
                {(vehicle.brand ?? "")} {(vehicle.model ?? "")} {(vehicle.version ?? "")}
              </Text>
               {vehicle.userPlan === 'pro_dealer' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#9013FE', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4, alignSelf: 'flex-start' }}>
                    <Ionicons name="checkmark-circle" size={10} color="#FFF" />
                    <Text style={{ fontSize: 9, color: '#FFF', fontWeight: '800' }}>AGENCIA</Text>
                  </View>
               )}
            </View>
            {/* Seller Info for Vertical Card */}
            {renderTrustBadge()}
            <Text style={{ color: theme.textMuted, marginTop: compact ? 2 : 4, fontSize: compact ? 12 : 14 }}>
              {vehicle.year ?? ""} • {(vehicle.km != null ? vehicle.km.toLocaleString("es-AR") : "0")} km • {vehicle.fuelType || (vehicle as any).fuel || "Nafta"}
            </Text>
            <Text style={{ color: theme.subtext, marginTop: compact ? 2 : 4, fontSize: compact ? 12 : 14 }}>
              {vehicle.location?.province || vehicle.province || "Ubicación no disponible"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: compact ? 6 : 8 }}>
              <Text style={{ color: theme.price, fontSize: compact ? 14 : 16, fontWeight: "700" }}>
                {vehicle.price != null && vehicle.currency ? `${vehicle.currency} ${vehicle.price.toLocaleString("es-AR")}` : "Consultar"}
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
      {/* Badges Container */}
      <View style={{ position: "absolute", top: 12, left: 12, flexDirection: "row", gap: 6 }}>
        {vehicle.isFeatured && (
          <View style={{ backgroundColor: theme.accent, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>Destacado</Text>
          </View>
        )}
        {vehicle.userPlan && vehicle.userPlan !== 'free' && (
          <View style={{ backgroundColor: vehicle.userPlan === 'pro_dealer' ? '#9013FE' : vehicle.userPlan === 'pro_plus' ? '#50E3C2' : '#4A90E2', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: vehicle.userPlan === 'pro_plus' ? '#000' : '#FFF', fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>PRO</Text>
          </View>
        )}
        {vehicle.singleOwner && (
          <View style={{ backgroundColor: "#27ae60", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>1ra Mano</Text>
          </View>
        )}
        {vehicle.serviceRecords && (
          <View style={{ backgroundColor: "#2980b9", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>Services OK</Text>
          </View>
        )}
      </View>

      {showEdit ? (
        <View style={{ position: "absolute", top: 12, right: 12 }}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={(e) => {
              e.stopPropagation();
              if (onEdit) {
                onEdit();
              } else {
                router.push(`/car/${vehicle.id}?edit=true`);
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
