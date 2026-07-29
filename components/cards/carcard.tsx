// components/CarCard.tsx
import { useCompare } from "@/contexts/CompareContext";
import { useTheme } from "@/contexts/ThemeContext";
import { usePriceSuggestion } from "@/hooks/usePriceSuggestion";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { getPlanBadgeInfo, isDealerPlan } from "@/lib/planChecks";
import { playLikeSound } from "@/lib/sounds";
import type { Vehicle } from "@/types/vehicle";
import { formatTimeAgo } from "@/utils/dateUtils";
import { getOptimizedImageUrl } from "@/utils/imageUtils";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { Platform, Pressable, Image as RNImage, Text, TouchableOpacity, View } from "react-native";

type Props = { vehicle: Vehicle; liked?: boolean; likeDisabled?: boolean; onToggleLike?: () => void; hideLike?: boolean; hideCompare?: boolean; showEdit?: boolean; onEdit?: () => void; compact?: boolean; horizontal?: boolean; onMessage?: () => void; showMetrics?: boolean; showPriceAnalysis?: boolean; matchScore?: number };

export function CarCard({ vehicle, liked = false, likeDisabled = false, onToggleLike, hideLike = false, hideCompare = false, showEdit = false, onEdit, compact = false, horizontal = false, onMessage, showMetrics = false, showPriceAnalysis = false, matchScore }: Props) {
  const router = useRouter();
  const { theme } = useTheme();
  const { toggleVehicle, isSelected } = useCompare();
  
  const selected = isSelected(vehicle.id);
  
  const [sellerName, setSellerName] = useState<string | null>(null);
  
  useEffect(() => {
    const shouldFetch =
      !!vehicle?.userId &&
      isDealerPlan(vehicle?.userPlan) &&
      !sellerName &&
      !vehicle.userName; // Skip if parent already provided the name via userNamesCache
    if (!shouldFetch) return;
    (async () => {
      try {
        const ref = doc(db, "users", String(vehicle.userId));
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data: any = snap.data();
          const name =
            data?.agencyName ||
            (data?.firstName || data?.lastName
              ? `${data?.firstName ?? ""} ${data?.lastName ?? ""}`.trim()
              : data?.displayName || data?.email || "Agencia");
          setSellerName(name);
        }
      } catch {}
    })();
  }, [vehicle?.userId, vehicle?.userPlan, sellerName]);
  
  const handleLikePress = async (e: any) => {
    e.stopPropagation();
    if (likeDisabled) return;
    
    // Play sound and haptics
    playLikeSound().catch(() => {});
    try {
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {}
    
    onToggleLike && onToggleLike();
  };
  
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

  const rawImageUrl = vehicle.coverImage || (vehicle as any)?.images?.cover || (vehicle as any)?.images?.gallery?.[0] || (Array.isArray((vehicle as any)?.images) ? (vehicle as any).images[0] : null);
  const imageUrl = getOptimizedImageUrl(rawImageUrl);

  const timeAgo = formatTimeAgo(vehicle.createdAt);

  // Helper to render financing badge (anticipo only) below price
  const renderFinancingBadges = () => {
    const fin = vehicle.financing;
    if (!fin?.downPayment || fin.downPayment <= 0) return null;
    const sym = vehicle.currency === "USD" ? "U$D" : "$";
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2, backgroundColor: "#FFF4ED", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, alignSelf: "flex-start", maxWidth: "100%" }}>
        <Text style={{ color: "#C2410C", fontSize: 9, fontWeight: "700" }} numberOfLines={1} ellipsizeMode="tail">
          Anticipo {sym} {fin.downPayment.toLocaleString("es-AR")}
        </Text>
      </View>
    );
  };

  // Helper to render Trust Badge
  const renderTrustBadge = () => {
      // Priority: Agency -> Rating -> TrustLevel
      const isAgency = isDealerPlan(vehicle.userPlan);
      const rating = vehicle.sellerRating;
      const reviewCount = vehicle.sellerReviewCount || 0;
      const trustLevel = vehicle.sellerTrustLevel || "new"; 
      
      if (isAgency) {
          return (
             <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                  <Ionicons name="business" size={14} color={theme.textMuted} />
                  <Text style={{ fontSize: 12, color: theme.textMuted, flex: 1 }} numberOfLines={1}>
                      {sellerName || vehicle.userName || "Agencia"}
                  </Text>
                  {compact ? (
                      <Ionicons name="checkmark-circle" size={14} color="#9013FE" />
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "#9013FE20", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Ionicons name="checkmark-circle" size={10} color="#9013FE" />
                        <Text style={{ fontSize: 10, color: "#9013FE", fontWeight: "600" }}>Agencia Verificada</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginLeft: 4 }}>
                      <Ionicons name="star" size={12} color="#F5A623" />
                      <Text style={{ fontSize: 12, color: theme.text, fontWeight: "600" }}>{Number(rating || 0).toFixed(1)}</Text>
                      <Text style={{ fontSize: 10, color: theme.textMuted }}>({reviewCount})</Text>
                  </View>
             </View>
          );
      }

      if (rating !== undefined && rating !== null || reviewCount > 0) {
           return (
             <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                  <Ionicons name="person-circle-outline" size={16} color={theme.textMuted} />
                  <Text style={{ fontSize: 12, color: theme.textMuted, flex: 1 }} numberOfLines={1}>
                      {vehicle.userName || "Usuario"}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                      <Ionicons name="star" size={12} color="#F5A623" />
                      <Text style={{ fontSize: 12, color: theme.text, fontWeight: "600" }}>{Number(rating || 0).toFixed(1)}</Text>
                      <Text style={{ fontSize: 10, color: theme.textMuted }}>({reviewCount})</Text>
                  </View>
             </View>
          );
      }

      // Fallback to Trust Level
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
              <Text style={{ fontSize: 12, color: theme.textMuted, flex: 1 }} numberOfLines={1}>
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
          {Platform.OS === 'web' ? (
            <View style={{ width: compact ? 120 : 150, height: compact ? 90 : 110, backgroundColor: '#f0f0f0', overflow: 'hidden' }}>
              <RNImage
                source={{ uri: imageUrl }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
                onError={(e) => logger.log("Web Image Error (Horizontal):", imageUrl, e.nativeEvent)}
              />
            </View>
          ) : (
            <ExpoImage
              source={{ uri: imageUrl }}
              style={{ width: compact ? 120 : 150, height: compact ? 90 : 110 }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
              onError={(e) => logger.log("Error loading image:", imageUrl, e.error)}
            />
          )}
          <View style={{ flex: 1, padding: compact ? 10 : 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Text style={{ color: theme.title, fontSize: compact ? 16 : 18, fontWeight: "700", flex: 1 }}>
                  {(vehicle.brand ?? "")} {(vehicle.model ?? "")}
                </Text>
                {!showEdit && vehicle.status !== 'sold' && Platform.OS !== 'web' && (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {!hideCompare && (
                    <TouchableOpacity 
                      onPress={(e) => { e.stopPropagation(); toggleVehicle(vehicle); }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="git-compare-outline" size={20} color={selected ? theme.accent : theme.textMuted} />
                    </TouchableOpacity>
                    )}
                    {!hideLike && (
                      <TouchableOpacity
                        disabled={likeDisabled}
                        onPress={handleLikePress}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons
                          name={(liked ? "heart" : "heart-outline") as any}
                          size={20}
                          color={liked ? theme.favoriteButton : likeDisabled ? theme.textMuted : theme.textMuted}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
            </View>
            {/* Seller Info for Horizontal Card */}
            {renderTrustBadge()}
            <Text style={{ color: theme.textMuted, marginTop: compact ? 2 : 4, fontSize: compact ? 12 : 14 }}>
              {vehicle.year ?? ""} • {(vehicle.km != null ? vehicle.km.toLocaleString("es-AR") : "0")} km • {vehicle.fuelType || (vehicle as any).fuel || "Nafta"}
            </Text>
            <Text style={{ color: theme.subtext, marginTop: compact ? 2 : 4, fontSize: compact ? 12 : 14 }}>
              {vehicle.location?.province || vehicle.province || "Ubicación no disponible"}{timeAgo ? ` • ${timeAgo}` : ""}
            </Text>
            {matchScore !== undefined && matchScore > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                <Ionicons name="sparkles" size={10} color={theme.accent} />
                <Text style={{ color: theme.accent, fontSize: 11, fontWeight: "700" }}>{matchScore}% para vos</Text>
              </View>
            )}
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
            {!compact && renderFinancingBadges()}
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
          {Platform.OS === 'web' ? (
            <View style={{ width: "100%", height: compact ? 130 : 200, backgroundColor: '#f0f0f0', overflow: 'hidden' }}>
              <RNImage
                source={{ uri: imageUrl }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
                onError={(e) => logger.log("Web Image Error (Vertical):", imageUrl, e.nativeEvent)}
              />
            </View>
          ) : (
            <ExpoImage
              source={{ uri: imageUrl }}
              style={{ width: "100%", height: compact ? 130 : 200 }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
              onError={(e) => logger.log("Error loading image:", imageUrl, e.error)}
            />
          )}
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
          {(vehicle.status === 'pending' || vehicle.status === 'pending_review') && (
             <View style={{ 
               position: 'absolute', 
               left: 0, 
               top: 0, 
               right: 0,
               height: compact ? 130 : 200, 
               backgroundColor: 'rgba(0,0,0,0.4)', 
               alignItems: 'center', 
               justifyContent: 'center',
               zIndex: 10
             }}>
                <Text style={{ color: '#F59E0B', fontWeight: '800', fontSize: 20, borderWidth: 3, borderColor: '#F59E0B', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.6)' }}>EN REVISIÓN</Text>
             </View>
          )}
          {vehicle.status === 'rejected' && (
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
                <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 20, borderWidth: 3, borderColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.6)' }}>RECHAZADO</Text>
             </View>
          )}
          {vehicle.status === 'blocked' && (
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
                <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 20, borderWidth: 3, borderColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.6)' }}>BLOQUEADO</Text>
             </View>
          )}
          <View style={{ padding: compact ? 10 : 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <Text style={{ color: theme.title, fontSize: compact ? 16 : 18, fontWeight: "700", flex: 1, flexWrap: 'wrap' }}>
                {(vehicle.brand ?? "")} {(vehicle.model ?? "")} {(vehicle.version ?? "")}
              </Text>
               {isDealerPlan(vehicle.userPlan) && (
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
              {vehicle.location?.province || vehicle.province || "Ubicación no disponible"}{timeAgo ? ` • ${timeAgo}` : ""}
            </Text>
            {matchScore !== undefined && matchScore > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                <Ionicons name="sparkles" size={10} color={theme.accent} />
                <Text style={{ color: theme.accent, fontSize: 11, fontWeight: "700" }}>{matchScore}% para vos</Text>
              </View>
            )}
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
            {!compact && renderFinancingBadges()}
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
        {vehicle.userPlan && vehicle.userPlan !== 'free' && (() => {
          const badgeInfo = getPlanBadgeInfo(vehicle.userPlan);
          return badgeInfo ? (
            <View style={{ backgroundColor: badgeInfo.color, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ color: badgeInfo.textColor, fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>
                {badgeInfo.label}
              </Text>
            </View>
          ) : null;
        })()}
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
          {!showEdit && vehicle.status !== 'sold' && !horizontal && Platform.OS !== 'web' && !hideCompare && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={(e) => {
                e.stopPropagation();
                toggleVehicle(vehicle);
              }}
              style={{
                backgroundColor: selected ? theme.accent : "#00000066",
                borderRadius: 999,
                padding: 6,
              }}
            >
              <Ionicons name="git-compare-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          )}
          {!hideLike && !horizontal && Platform.OS !== 'web' && (
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={likeDisabled}
              onPress={handleLikePress}
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

export function CarCardSkeleton() {
  const { theme, themeName } = useTheme();
  const skeletonColor = themeName === 'dark' ? '#1f2937' : '#e5e7eb';
  
  return (
    <View style={{
        backgroundColor: theme.card,
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: theme.badgeBorder,
        height: 280,
    }}>
        <View style={{ height: 180, backgroundColor: skeletonColor }} />
        <View style={{ padding: 12, gap: 8 }}>
            <View style={{ height: 20, width: '70%', backgroundColor: skeletonColor, borderRadius: 4 }} />
            <View style={{ height: 16, width: '40%', backgroundColor: skeletonColor, borderRadius: 4 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                 <View style={{ height: 16, width: '20%', backgroundColor: skeletonColor, borderRadius: 4 }} />
                 <View style={{ height: 16, width: '20%', backgroundColor: skeletonColor, borderRadius: 4 }} />
            </View>
        </View>
    </View>
  );
}
