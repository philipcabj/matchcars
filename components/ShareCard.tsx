import React, { forwardRef } from "react";
import { Image, Text, View } from "react-native";

let QRCode: any = null;
try {
  QRCode = require("react-native-qrcode-svg").default;
} catch {}

// Natural (design-time) size — actual on-screen/captured size is driven by the
// `width` prop and scaled proportionally, so the card always fits the sheet
// on any screen instead of overflowing narrow phones.
export const CARD_WIDTH = 360;
export const CARD_HEIGHT = 640;

export interface ShareCardVehicle {
  id: string;
  brand?: string;
  model?: string;
  price?: number;
  currency?: string;
  coverImage?: string;
}

export interface ShareCardData {
  agencyName: string;
  logoUrl?: string | null;
  city?: string;
  province?: string;
  rating?: number | null;
  reviewCount?: number;
  vehicles: ShareCardVehicle[];
}

interface ShareCardProps extends ShareCardData {
  qrValue: string;
  width?: number;
}

function formatPrice(price?: number, currency?: string) {
  if (!price) return "";
  const symbol = currency === "USD" ? "US$" : "$";
  return `${symbol} ${Math.round(price).toLocaleString("es-AR")}`;
}

// Captured with react-native-view-shot (captureRef) — RN-core <Image>/<Text>/<View> plus
// a live <QRCode> (SVG), captured as part of the same screenshot instead of being
// pre-rendered separately — that separate toDataURL step proved unreliable in practice.
export const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard(
  { agencyName, logoUrl, city, province, rating, reviewCount, vehicles, qrValue, width = CARD_WIDTH },
  ref
) {
  const location = [city, province].filter(Boolean).join(", ");
  const scale = width / CARD_WIDTH;
  const height = Math.round(CARD_HEIGHT * scale);
  const s = (n: number) => Math.round(n * scale);

  return (
    <View
      ref={ref}
      collapsable={false}
      style={{
        width,
        height,
        backgroundColor: "#0F172A",
        padding: s(28),
        justifyContent: "space-between",
      }}
    >
      {/* Header: logo + agency name */}
      <View style={{ alignItems: "center", marginTop: s(12) }}>
        <View
          style={{
            width: s(76),
            height: s(76),
            borderRadius: s(38),
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
            <Text style={{ color: "#FFFFFF", fontSize: s(28), fontWeight: "900" }}>
              {agencyName.slice(0, 2).toUpperCase()}
            </Text>
          )}
        </View>

        <Text
          style={{ color: "#FFFFFF", fontSize: s(22), fontWeight: "900", marginTop: s(12), textAlign: "center" }}
          numberOfLines={2}
        >
          {agencyName}
        </Text>

        {!!location && (
          <Text style={{ color: "#94A3B8", fontSize: s(13), marginTop: s(4) }}>{location}</Text>
        )}

        {typeof rating === "number" && rating > 0 && (
          <Text style={{ color: "#F59E0B", fontSize: s(14), fontWeight: "700", marginTop: s(6) }}>
            {"★".repeat(Math.round(rating))} {rating.toFixed(1)}
            {reviewCount ? ` (${reviewCount} opiniones)` : ""}
          </Text>
        )}
      </View>

      {/* Vehicles */}
      <View style={{ gap: s(10) }}>
        {vehicles.slice(0, 3).map((v) => (
          <View
            key={v.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#1E293B",
              borderRadius: s(12),
              overflow: "hidden",
              height: s(64),
            }}
          >
            {v.coverImage ? (
              <Image source={{ uri: v.coverImage }} style={{ width: s(84), height: s(64) }} resizeMode="cover" />
            ) : (
              <View style={{ width: s(84), height: s(64), backgroundColor: "#334155" }} />
            )}
            <View style={{ flex: 1, paddingHorizontal: s(12) }}>
              <Text style={{ color: "#FFFFFF", fontSize: s(13), fontWeight: "700" }} numberOfLines={1}>
                {[v.brand, v.model].filter(Boolean).join(" ")}
              </Text>
              <Text style={{ color: "#F59E0B", fontSize: s(13), fontWeight: "800" }}>
                {formatPrice(v.price, v.currency)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Footer: QR + wordmark */}
      <View style={{ alignItems: "center" }}>
        {QRCode && (
          <View
            style={{
              width: s(96),
              height: s(96),
              borderRadius: s(12),
              backgroundColor: "#FFFFFF",
              padding: s(8),
              marginBottom: s(8),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <QRCode value={qrValue} size={s(80)} color="#0F172A" backgroundColor="#FFFFFF" />
          </View>
        )}
        <Text style={{ color: "#94A3B8", fontSize: s(11) }}>Escaneá para ver todo el stock</Text>
        <Text style={{ color: "#FFFFFF", fontSize: s(14), fontWeight: "800", marginTop: s(4) }}>
          matchcars.app
        </Text>
      </View>
    </View>
  );
});
