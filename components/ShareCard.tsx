import React, { forwardRef } from "react";
import { Image, Text, View } from "react-native";

const CARD_WIDTH = 360;
const CARD_HEIGHT = 640;

interface ShareCardVehicle {
  id: string;
  brand?: string;
  model?: string;
  price?: number;
  currency?: string;
  coverImage?: string;
}

interface ShareCardProps {
  agencyName: string;
  logoUrl?: string | null;
  city?: string;
  province?: string;
  rating?: number | null;
  reviewCount?: number;
  vehicles: ShareCardVehicle[];
  qrDataUrl?: string | null;
}

function formatPrice(price?: number, currency?: string) {
  if (!price) return "";
  const symbol = currency === "USD" ? "US$" : "$";
  return `${symbol} ${Math.round(price).toLocaleString("es-AR")}`;
}

// Captured with react-native-view-shot (captureRef) — only RN-core <Image>/<Text>/<View>
// here, matching the one existing captureRef precedent in this repo (app/(screens)/add-car.tsx).
export const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard(
  { agencyName, logoUrl, city, province, rating, reviewCount, vehicles, qrDataUrl },
  ref
) {
  const location = [city, province].filter(Boolean).join(", ");

  return (
    <View
      ref={ref}
      collapsable={false}
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: "#0F172A",
        padding: 28,
        justifyContent: "space-between",
      }}
    >
      {/* Header: logo + agency name */}
      <View style={{ alignItems: "center", marginTop: 12 }}>
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            backgroundColor: "#1E293B",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            borderWidth: 2,
            borderColor: "#F59E0B",
          }}
        >
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          ) : (
            <Text style={{ color: "#FFFFFF", fontSize: 28, fontWeight: "900" }}>
              {agencyName.slice(0, 2).toUpperCase()}
            </Text>
          )}
        </View>

        <Text
          style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginTop: 12, textAlign: "center" }}
          numberOfLines={2}
        >
          {agencyName}
        </Text>

        {!!location && (
          <Text style={{ color: "#94A3B8", fontSize: 13, marginTop: 4 }}>{location}</Text>
        )}

        {typeof rating === "number" && rating > 0 && (
          <Text style={{ color: "#F59E0B", fontSize: 14, fontWeight: "700", marginTop: 6 }}>
            {"★".repeat(Math.round(rating))} {rating.toFixed(1)}
            {reviewCount ? ` (${reviewCount} opiniones)` : ""}
          </Text>
        )}
      </View>

      {/* Vehicles */}
      <View style={{ gap: 10 }}>
        {vehicles.slice(0, 3).map((v) => (
          <View
            key={v.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#1E293B",
              borderRadius: 12,
              overflow: "hidden",
              height: 64,
            }}
          >
            {v.coverImage ? (
              <Image source={{ uri: v.coverImage }} style={{ width: 84, height: 64 }} resizeMode="cover" />
            ) : (
              <View style={{ width: 84, height: 64, backgroundColor: "#334155" }} />
            )}
            <View style={{ flex: 1, paddingHorizontal: 12 }}>
              <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }} numberOfLines={1}>
                {[v.brand, v.model].filter(Boolean).join(" ")}
              </Text>
              <Text style={{ color: "#F59E0B", fontSize: 13, fontWeight: "800" }}>
                {formatPrice(v.price, v.currency)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Footer: QR + wordmark */}
      <View style={{ alignItems: "center" }}>
        {qrDataUrl && (
          <View
            style={{
              width: 96,
              height: 96,
              borderRadius: 12,
              backgroundColor: "#FFFFFF",
              padding: 8,
              marginBottom: 8,
            }}
          >
            <Image source={{ uri: qrDataUrl }} style={{ width: "100%", height: "100%" }} />
          </View>
        )}
        <Text style={{ color: "#94A3B8", fontSize: 11 }}>Escaneá para ver todo el stock</Text>
        <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "800", marginTop: 4 }}>
          matchcars.app
        </Text>
      </View>
    </View>
  );
});
