import { ShareSheet } from "@/components/ShareSheet";
import { WebContainer } from "@/components/WebContainer";
import { CarCard } from "@/components/cards/carcard";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { trackEvent } from "@/lib/analytics";
import { db } from "@/lib/firebase";
import { fetchDealerReportData } from "@/lib/reporting";
import type { Vehicle } from "@/types/vehicle";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Review {
  id: string;
  reviewerName: string;
  reviewerPhotoUrl: string | null;
  rating: number;
  review: string;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  createdAt: any;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StarRating({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 1 }}>
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

function ReviewCard({ item, theme }: { item: Review; theme: any }) {
  const initials = item.reviewerName
    ? item.reviewerName.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "U";
  const dateStr = item.createdAt?.toDate
    ? item.createdAt.toDate().toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
    : "";
  return (
    <View
      style={{
        backgroundColor: theme.background,
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {item.reviewerPhotoUrl ? (
          <Image source={{ uri: item.reviewerPhotoUrl }} style={{ width: 32, height: 32, borderRadius: 16 }} />
        ) : (
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: theme.accent + "25",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 12 }}>{initials}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13 }} numberOfLines={1}>
            {item.reviewerName || "Usuario"}
          </Text>
          {(item.vehicleBrand || item.vehicleModel) && (
            <Text style={{ color: theme.textMuted, fontSize: 11 }} numberOfLines={1}>
              {[item.vehicleBrand, item.vehicleModel].filter(Boolean).join(" ")}
            </Text>
          )}
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <StarRating rating={item.rating} />
          {dateStr ? <Text style={{ color: theme.textMuted, fontSize: 10 }}>{dateStr}</Text> : null}
        </View>
      </View>
      {!!item.review && (
        <Text style={{ color: theme.text, fontSize: 13, lineHeight: 18, fontStyle: "italic" }}>
          "{item.review}"
        </Text>
      )}
    </View>
  );
}

function MapEmbed({
  address,
  coordinates,
}: {
  address?: string;
  coordinates?: { latitude: number; longitude: number };
}) {
  if (Platform.OS !== "web" || (!address && !coordinates)) return null;
  const q = coordinates
    ? `${coordinates.latitude},${coordinates.longitude}`
    : encodeURIComponent(address || "");
  const src = `https://maps.google.com/maps?q=${q}&output=embed&z=15`;
  return (
    <View style={{ marginTop: 10, borderRadius: 12, overflow: "hidden", height: 200 }}>
      {/* @ts-ignore */}
      <iframe
        src={src}
        style={{ border: 0, width: "100%", height: "100%" }}
        loading="lazy"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
      />
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function UserProfileScreen() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const router = useRouter();
  const { uid } = useLocalSearchParams<{ uid: string }>();

  // ── State ──
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeTab, setActiveTab] = useState<"active" | "sold">("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [inventoryY, setInventoryY] = useState(0);
  const scrollViewRef = React.useRef<ScrollView>(null);

  const [profileName, setProfileName] = useState<string>("");
  const [profileInitials, setProfileInitials] = useState<string>("");
  const [profileColor, setProfileColor] = useState<string>(theme.accent);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [dealerReport, setDealerReport] = useState<any>(null);
  const [ratingStats, setRatingStats] = useState<{ avg: number; count: number } | null>(null);
  const [recentReviews, setRecentReviews] = useState<Review[]>([]);

  // ── Derived ──
  const hasUid = typeof uid === "string" && uid.length > 0;
  const isOwnProfile = user?.uid && uid && user.uid === uid;
  const isBlocked = profile?.blockedUsers && uid && profile.blockedUsers.includes(uid);
  const uidString = String(uid ?? "");
  const profileUrl = `https://matchcars.app/user-profile/${uidString}`;

  const isDealerProfile =
    !!profileData?.plan && String(profileData.plan).includes("pro_dealer");
  const isProProfile =
    !isDealerProfile &&
    !!profileData?.plan &&
    profileData.plan !== "free" &&
    profileData.plan !== "";

  const { width: screenWidth } = useWindowDimensions();
  const isWideWeb = Platform.OS === "web" && screenWidth >= 900;
  const isVeryWide = Platform.OS === "web" && screenWidth >= 1200;

  const memberSince = profileData?.createdAt?.seconds
    ? new Date(profileData.createdAt.seconds * 1000).getFullYear()
    : null;

  const computedRating = ratingStats?.avg ?? null;
  const computedReviewCount = ratingStats?.count ?? 0;
  const displayRating =
    computedRating ?? (typeof profileData?.sellerRating === "number" ? profileData.sellerRating : null);
  const displayReviewCount = computedReviewCount || profileData?.sellerReviewCount || 0;
  const hasReviews = displayReviewCount > 0 && displayRating !== null;

  const fullAddress =
    profileData?.businessAddress ||
    [profileData?.address, profileData?.city, profileData?.province].filter(Boolean).join(", ");

  const brandSpecialties: string[] = profileData?.brandSpecialties || [];
  const showroomGallery: string[] = profileData?.showroomGallery || [];
  const foundedYear: number | null = profileData?.foundedYear || null;

  // ── SEO ──
  const pageTitle = profileName
    ? isDealerProfile
      ? `${profileName} | Agencia en Matchcars`
      : `${profileName} | Perfil en Matchcars`
    : "Perfil de vendedor | Matchcars";
  const pageDescription = profileName
    ? isDealerProfile
      ? `Conocé la agencia ${profileName} en Matchcars. Mirá su stock de vehículos, reputación y contacto.`
      : `Mirá el perfil de ${profileName} en Matchcars, conocé su reputación y autos publicados.`
    : "Conocé el perfil de vendedores y agencias en Matchcars.";

  const profileStructuredData =
    uidString && profileName
      ? {
          "@context": "https://schema.org",
          "@type": isDealerProfile ? "AutoDealer" : "Person",
          name: profileName,
          url: profileUrl,
          ...(foundedYear ? { foundingDate: String(foundedYear) } : {}),
          address:
            profileData?.city || profileData?.province
              ? {
                  "@type": "PostalAddress",
                  addressLocality: profileData.city,
                  addressRegion: profileData.province,
                }
              : undefined,
          aggregateRating: hasReviews
            ? {
                "@type": "AggregateRating",
                ratingValue: Number(displayRating ?? 0).toFixed(1),
                reviewCount: displayReviewCount,
              }
            : undefined,
        }
      : null;

  // ── Fetch profile ──
  useEffect(() => {
    if (!hasUid) return;
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, "users", uid!),
      (docSnap) => {
        if (docSnap.exists()) {
          const pd = docSnap.data() as any;
          setProfileData(pd);
          const name =
            pd?.agencyName ||
            (pd?.firstName || pd?.lastName
              ? `${pd?.firstName ?? ""} ${pd?.lastName ?? ""}`.trim()
              : pd?.displayName || pd?.email || "Usuario");
          setProfileName(name);
          let initials = String(pd?.initials || "");
          if (!initials) {
            const dn = String(pd?.displayName || "").trim();
            initials = dn ? dn.slice(0, 2).toUpperCase() : "MC";
          }
          setProfileInitials(initials);
          setProfileColor(pd?.avatarColor || theme.accent);
          setProfilePhotoUrl(pd?.photoURL || pd?.avatar || null);

          const isDealer = !!pd?.plan && String(pd.plan).includes("pro_dealer");
          if (isDealer && pd?.agencyName) {
            (async () => {
              try {
                const vehiclesSnap = await getDocs(
                  query(collection(db, "vehicles"), where("userId", "==", String(uid)))
                );
                for (const v of vehiclesSnap?.docs ?? []) {
                  const data = v.data() as any;
                  if (data.userName === pd.agencyName) continue;
                  await updateDoc(v.ref, { userName: pd.agencyName });
                }
              } catch {}
            })();
          }
        } else {
          setProfileName("Usuario");
          setProfileInitials("MC");
          setProfileColor(theme.accent);
          setProfilePhotoUrl(null);
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [uid, theme.accent, hasUid]);

  // ── Fetch dealer report ──
  useEffect(() => {
    if (!hasUid) return;
    fetchDealerReportData(String(uid)).then(setDealerReport).catch(() => {});
  }, [uid]);

  // ── Fetch rating ──
  useEffect(() => {
    if (!hasUid) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "sales"), where("sellerId", "==", String(uid)))
        );
        const seenVehicles = new Set<string>();
        let total = 0,
          count = 0;
        snap.forEach((d) => {
          const data = d.data() as any;
          const vid = data.vehicleId ?? d.id;
          if (seenVehicles.has(vid)) return;
          seenVehicles.add(vid);
          const r = Number(data.rating);
          if (!isNaN(r) && r > 0) {
            total += r;
            count++;
          }
        });
        const avg = count > 0 ? total / count : 0;
        setRatingStats({ avg, count });
        try {
          await updateDoc(doc(db, "users", String(uid)), {
            sellerRating: count > 0 ? avg : null,
            sellerReviewCount: count,
          });
        } catch {}
      } catch {}
    })();
  }, [uid, hasUid]);

  // ── Fetch recent reviews ──
  useEffect(() => {
    if (!hasUid) return;
    getDocs(
      query(
        collection(db, "reviews"),
        where("sellerId", "==", String(uid)),
        orderBy("createdAt", "desc")
      )
    )
      .then((snap) =>
        setRecentReviews(snap.docs.slice(0, 3).map((d) => ({ id: d.id, ...(d.data() as any) })))
      )
      .catch(() => {});
  }, [uid, hasUid]);

  // ── Fetch vehicles ──
  useEffect(() => {
    if (!hasUid) {
      setVehicles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (isBlocked) {
      setVehicles([]);
      setLoading(false);
      return;
    }
    const ref = query(collection(db, "vehicles"), where("userId", "==", String(uid)));
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const items: Vehicle[] = [];
        snap.forEach((docSnap) => {
          const data: any = docSnap.data();
          if (data.status === "deleted") return;
          if (!data.published && data.status !== "sold") return;
          if (["pending", "pending_review", "rejected", "blocked"].includes(data.status)) return;
          items.push({
            id: docSnap.id,
            brand: data.brand,
            model: data.model,
            year: data.year,
            price: data.price,
            currency: data.currency,
            km: data.km,
            coverImage: data.coverImage ?? data.images?.cover ?? data.images?.[0] ?? undefined,
            additionalImages: data.additionalImages ?? data.images?.gallery ?? undefined,
            city: data.location?.city ?? data.city,
            province: data.location?.province ?? data.province,
            userId: data.userId,
            userName: data.userName,
            createdAt: data.createdAt,
            published: data.published,
            isFeatured: data.isFeatured,
            status: data.status,
            userPlan: data.userPlan,
            sellerRating: data.sellerRating,
            sellerReviewCount: data.sellerReviewCount,
          } as any);
        });
        items.sort((a, b) => {
          if (a.status === "sold" && b.status !== "sold") return 1;
          if (a.status !== "sold" && b.status === "sold") return -1;
          return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
        });
        setVehicles(items);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [uid, hasUid, isBlocked]);

  // ── Computed lists ──
  const activeVehicles = vehicles.filter((v) => v.status !== "sold");
  const soldVehicles = vehicles.filter((v) => v.status === "sold");
  const tabVehicles = activeTab === "active" ? activeVehicles : soldVehicles;

  const highlightedVehicles = useMemo(() => {
    const ids: string[] = profileData?.highlightedVehicleIds || [];
    if (!ids.length) return [];
    return activeVehicles.filter((v) => ids.includes(v.id)).slice(0, 6);
  }, [activeVehicles, profileData?.highlightedVehicleIds]);

  const availableBrands = useMemo(
    () =>
      [...new Set(activeVehicles.map((v) => v.brand).filter((b): b is string => !!b))].sort(),
    [activeVehicles]
  );

  const displayedVehicles = useMemo(() => {
    let list = tabVehicles;
    if (brandFilter) list = list.filter((v) => v.brand === brandFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((v) =>
        [v.brand, v.model, String(v.year)].filter(Boolean).join(" ").toLowerCase().includes(q)
      );
    }
    return list;
  }, [tabVehicles, brandFilter, searchQuery]);

  // ── Handlers ──
  const openWhatsApp = (phone: string) => {
    if (!phone) return;
    const clean = phone.replace(/\D/g, "");
    trackEvent("contact_click", { channel: "whatsapp", profileId: uidString, location: "profile" });
    Linking.openURL(`https://wa.me/${clean}`).catch(() => {});
  };

  const openInstagram = (username: string) => {
    if (!username) return;
    const clean = username.replace("@", "");
    trackEvent("contact_click", { channel: "instagram", profileId: uidString, location: "profile" });
    Linking.openURL(`https://instagram.com/${clean}`).catch(() => {});
  };

  const openMaps = (address: string) => {
    const q = encodeURIComponent(address);
    const url = Platform.select({
      ios: `maps:0,0?q=${q}`,
      android: `geo:0,0?q=${q}`,
      web: `https://www.google.com/maps/search/?api=1&query=${q}`,
    });
    if (url) Linking.openURL(url).catch(() => {});
  };

  const openPhone = (phone: string) => {
    if (!phone) return;
    const clean = phone.replace(/\D/g, "");
    Linking.openURL(`tel:+${clean}`).catch(() => {});
  };

  // ── Sub-components ────────────────────────────────────────────────────────

  // ── Dealer hero (banner + logo overlay + badges + stats quick row) ──
  const DealerHero = () => {
    const bannerHeight = isWideWeb ? 260 : 180;
    const logoSize = isWideWeb ? 96 : 80;
    const yearsInBusiness = foundedYear ? new Date().getFullYear() - foundedYear : null;

    return (
      <View>
        {/* Banner */}
        <View
          style={{
            height: bannerHeight,
            backgroundColor: theme.accent + "22",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {(profileData?.coverImage || profileData?.bannerUrl) ? (
            <Image
              source={{ uri: profileData.coverImage || profileData.bannerUrl }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                opacity: 0.15,
              }}
            >
              <Ionicons name="business" size={80} color={theme.accent} />
            </View>
          )}
          {/* Gradient overlay at bottom — web only */}
          {Platform.OS === "web" && (
            <View
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 80,
                background: "linear-gradient(transparent, rgba(0,0,0,0.55))",
              } as any}
            />
          )}
        </View>

        {/* Logo + Name row */}
        <View style={{ paddingHorizontal: 20, paddingTop: 0 }}>
          {/* Logo overlapping banner */}
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 14, marginTop: -logoSize / 2 }}>
            <View
              style={{
                width: logoSize,
                height: logoSize,
                borderRadius: 16,
                backgroundColor: profileColor,
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                borderWidth: 3,
                borderColor: theme.card,
                shadowColor: "#000",
                shadowOpacity: 0.18,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
              }}
            >
              {profilePhotoUrl ? (
                <Image
                  source={{ uri: profilePhotoUrl }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                />
              ) : (
                <Text style={{ fontSize: logoSize * 0.38, fontWeight: "900", color: "#FFF" }}>
                  {profileInitials}
                </Text>
              )}
            </View>

            {/* Action buttons top-right */}
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={() => setShareSheetVisible(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: theme.accent,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                marginBottom: 4,
              }}
            >
              <Ionicons name="share-social-outline" size={15} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Compartir</Text>
            </TouchableOpacity>
          </View>

          {/* Name + badges */}
          <View style={{ marginTop: 12, gap: 6 }}>
            <Text style={{ color: theme.text, fontWeight: "900", fontSize: isWideWeb ? 26 : 22 }}>
              {profileName}
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {/* Dealer badge */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  backgroundColor: theme.accent + "18",
                  borderWidth: 1,
                  borderColor: theme.accent,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 6,
                }}
              >
                <Ionicons name="business" size={11} color={theme.accent} />
                <Text style={{ color: theme.accent, fontSize: 11, fontWeight: "800" }}>
                  AGENCIA VERIFICADA
                </Text>
              </View>

              {/* KYC */}
              {profileData?.kycStatus === "verified" && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    backgroundColor: "#10B98118",
                    borderWidth: 1,
                    borderColor: "#10B981",
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6,
                  }}
                >
                  <Ionicons name="shield-checkmark" size={11} color="#10B981" />
                  <Text style={{ color: "#10B981", fontSize: 11, fontWeight: "700" }}>
                    IDENTIDAD VERIFICADA
                  </Text>
                </View>
              )}
            </View>

            {/* Meta row: fundación, años, ciudad */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 2 }}>
              {foundedYear && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="calendar-outline" size={13} color={theme.textMuted} />
                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                    Desde {foundedYear}
                    {yearsInBusiness && yearsInBusiness > 0
                      ? ` · ${yearsInBusiness} años en el mercado`
                      : ""}
                  </Text>
                </View>
              )}
              {(profileData?.city || profileData?.province) && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="location-outline" size={13} color={theme.textMuted} />
                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                    {[profileData.city, profileData.province].filter(Boolean).join(", ")}
                  </Text>
                </View>
              )}
              {memberSince && !foundedYear && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="calendar-outline" size={13} color={theme.textMuted} />
                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                    Miembro desde {memberSince}
                  </Text>
                </View>
              )}
            </View>

            {/* Rating */}
            {hasReviews && (
              <TouchableOpacity
                onPress={() =>
                  router.push({ pathname: "/(screens)/reviews/[uid]", params: { uid: uidString } })
                }
                style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}
              >
                <Ionicons name="star" size={15} color="#F59E0B" />
                <Text style={{ color: theme.text, fontWeight: "800", fontSize: 15 }}>
                  {Number(displayRating ?? 0).toFixed(1)}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                  ({displayReviewCount} opiniones)
                </Text>
                <Ionicons name="chevron-forward" size={13} color={theme.textMuted} />
              </TouchableOpacity>
            )}

            {/* Brand specialties */}
            {brandSpecialties.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                <Text style={{ color: theme.textMuted, fontSize: 12, alignSelf: "center" }}>
                  Especialistas en:
                </Text>
                {brandSpecialties.map((brand) => (
                  <View
                    key={brand}
                    style={{
                      backgroundColor: theme.card,
                      borderWidth: 1,
                      borderColor: theme.border,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 6,
                    }}
                  >
                    <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>
                      {brand}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  // ── Pro/Free compact header ──
  const CompactHeader = () => (
    <View style={{ padding: 20 }}>
      {/* Banner for pro only */}
      {isProProfile && (profileData?.coverImage || profileData?.bannerUrl) && (
        <View
          style={{
            height: 120,
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 16,
          }}
        >
          <Image
            source={{ uri: profileData.coverImage || profileData.bannerUrl }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        </View>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View
          style={{
            width: isWideWeb ? 72 : 64,
            height: isWideWeb ? 72 : 64,
            borderRadius: isWideWeb ? 36 : 32,
            backgroundColor: profileColor,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {profilePhotoUrl ? (
            <Image
              source={{ uri: profilePhotoUrl }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
          ) : (
            <Text style={{ fontSize: 26, fontWeight: "bold", color: "#FFF" }}>
              {profileInitials}
            </Text>
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: isWideWeb ? 20 : 18, fontWeight: "800", color: theme.text }}>
            {profileName}
          </Text>

          {/* Pro badges */}
          {isProProfile && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
              <View
                style={{
                  backgroundColor: theme.accent + "18",
                  borderWidth: 1,
                  borderColor: theme.accent,
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 5,
                }}
              >
                <Text style={{ color: theme.accent, fontSize: 10, fontWeight: "700" }}>
                  PRO
                </Text>
              </View>
              {profileData?.kycStatus === "verified" && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 3,
                    backgroundColor: "#10B98118",
                    borderWidth: 1,
                    borderColor: "#10B981",
                    paddingHorizontal: 7,
                    paddingVertical: 2,
                    borderRadius: 5,
                  }}
                >
                  <Ionicons name="shield-checkmark" size={10} color="#10B981" />
                  <Text style={{ color: "#10B981", fontSize: 10, fontWeight: "700" }}>
                    VERIFICADO
                  </Text>
                </View>
              )}
            </View>
          )}

          {hasReviews && (
            <TouchableOpacity
              onPress={() =>
                router.push({ pathname: "/(screens)/reviews/[uid]", params: { uid: uidString } })
              }
              style={{ flexDirection: "row", alignItems: "center", marginTop: 5, gap: 4 }}
            >
              <Ionicons name="star" size={14} color="#F59E0B" />
              <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13 }}>
                {Number(displayRating ?? 0).toFixed(1)}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                ({displayReviewCount} opiniones)
              </Text>
              <Ionicons name="chevron-forward" size={12} color={theme.textMuted} />
            </TouchableOpacity>
          )}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {memberSince && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Ionicons name="calendar-outline" size={11} color={theme.textMuted} />
                <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                  Miembro desde {memberSince}
                </Text>
              </View>
            )}
            {activeVehicles.length > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Ionicons name="car-outline" size={11} color={theme.textMuted} />
                <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                  {activeVehicles.length} en venta
                </Text>
              </View>
            )}
            {soldVehicles.length > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Ionicons name="checkmark-circle-outline" size={11} color={theme.textMuted} />
                <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                  {soldVehicles.length} vendidos
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );

  // ── Contact buttons ──
  const ContactButtons = () => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14, paddingHorizontal: isDealerProfile ? 20 : 0 }}>
      {!isOwnProfile && user && !isBlocked && Platform.OS !== "web" && (
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/(screens)/chat/[uid]",
              params: { uid: uidString, name: profileName },
            } as any)
          }
          style={{
            flex: 1,
            minWidth: 100,
            backgroundColor: theme.accent,
            paddingVertical: 10,
            borderRadius: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={16} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Mensaje</Text>
        </TouchableOpacity>
      )}
      {profileData?.whatsapp && (
        <TouchableOpacity
          onPress={() => openWhatsApp(profileData.whatsapp)}
          style={{
            flex: 1,
            minWidth: 100,
            backgroundColor: "#25D366",
            paddingVertical: 10,
            borderRadius: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Ionicons name="logo-whatsapp" size={16} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>WhatsApp</Text>
        </TouchableOpacity>
      )}
      {profileData?.phone && (
        <TouchableOpacity
          onPress={() => openPhone(profileData.phone)}
          style={{
            flex: 1,
            minWidth: 100,
            backgroundColor: theme.card,
            paddingVertical: 10,
            borderRadius: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Ionicons name="call-outline" size={16} color={theme.text} />
          <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13 }}>Llamar</Text>
        </TouchableOpacity>
      )}
      {profileData?.instagram && (
        <TouchableOpacity
          onPress={() => openInstagram(profileData.instagram)}
          style={{
            flex: 1,
            minWidth: 100,
            backgroundColor: "#E1306C",
            paddingVertical: 10,
            borderRadius: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Ionicons name="logo-instagram" size={16} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Instagram</Text>
        </TouchableOpacity>
      )}
      {profileData?.website && (
        <TouchableOpacity
          onPress={() =>
            Linking.openURL(
              profileData.website.startsWith("http")
                ? profileData.website
                : `https://${profileData.website}`
            )
          }
          style={{
            flex: 1,
            minWidth: 100,
            backgroundColor: theme.card,
            paddingVertical: 10,
            borderRadius: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Ionicons name="globe-outline" size={16} color={theme.accent} />
          <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 13 }}>Web</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ── Info section (dealer) ──
  const InfoSection = () => (
    <View style={{ gap: 10, marginTop: 16, paddingHorizontal: isDealerProfile ? 20 : 0 }}>
      {!!fullAddress && (
        <View>
          <TouchableOpacity
            onPress={() => openMaps(fullAddress)}
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}
          >
            <Ionicons name="location-outline" size={18} color={theme.accent} style={{ marginTop: 2 }} />
            <Text
              style={{
                color: theme.accent,
                flex: 1,
                fontSize: 14,
                lineHeight: 20,
                textDecorationLine: "underline",
              }}
            >
              {fullAddress}
            </Text>
          </TouchableOpacity>
          {Platform.OS === "web" && (
            <MapEmbed address={fullAddress} coordinates={profileData?.businessCoordinates} />
          )}
          {Platform.OS !== "web" && (
            <TouchableOpacity onPress={() => openMaps(fullAddress)} style={{ marginLeft: 26, marginTop: 4 }}>
              <Text style={{ color: theme.accent, fontSize: 12, fontWeight: "700" }}>
                Ver en Mapa
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {(profileData?.businessHours || profileData?.schedule) && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <Ionicons name="time-outline" size={18} color={theme.textMuted} style={{ marginTop: 2 }} />
          <Text style={{ color: theme.textMuted, flex: 1, fontSize: 14, lineHeight: 20 }}>
            {profileData.businessHours || profileData.schedule}
          </Text>
        </View>
      )}
      {profileData?.description && (
        <Text style={{ color: theme.text, fontSize: 14, lineHeight: 22, marginTop: 4 }}>
          {profileData.description}
        </Text>
      )}
    </View>
  );

  // ── Dealer stats ──
  const DealerStats = () => {
    if (!dealerReport) return null;
    const stats = [
      { value: dealerReport.publishedCars, label: "En venta", icon: "car-sport-outline", color: theme.accent },
      { value: dealerReport.soldCars, label: "Vendidos", icon: "checkmark-circle-outline", color: "#10B981" },
      { value: dealerReport.totalInterests, label: "Intereses", icon: "heart-outline", color: "#F59E0B" },
      { value: `${dealerReport.avgDaysToSell}d`, label: "Días promedio", icon: "timer-outline", color: "#8B5CF6" },
    ];
    return (
      <View style={{ marginTop: 16, paddingHorizontal: isDealerProfile ? 20 : 0 }}>
        <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14, marginBottom: 10 }}>
          Estadísticas
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {stats.map((s, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                backgroundColor: s.color + "12",
                borderRadius: 12,
                padding: 10,
                borderWidth: 1,
                borderColor: s.color + "30",
                alignItems: "center",
                gap: 3,
              }}
            >
              <Ionicons name={s.icon as any} size={18} color={s.color} />
              <Text style={{ color: theme.text, fontSize: 18, fontWeight: "800" }}>{s.value}</Text>
              <Text style={{ color: theme.textMuted, fontSize: 10, textAlign: "center" }}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  // ── Showroom gallery ──
  const ShowroomGallery = () => {
    if (showroomGallery.length === 0) return null;
    return (
      <View style={{ marginTop: 20 }}>
        <Text
          style={{
            color: theme.text,
            fontWeight: "700",
            fontSize: 14,
            marginBottom: 10,
            paddingHorizontal: isDealerProfile ? 20 : 0,
          }}
        >
          Galería del local
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingHorizontal: isDealerProfile ? 20 : 0 }}
        >
          {showroomGallery.map((uri, i) => (
            <View
              key={i}
              style={{
                width: 160,
                height: 110,
                borderRadius: 12,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Image source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  // ── Highlighted vehicles ──
  const HighlightedVehicles = () => {
    if (highlightedVehicles.length === 0) return null;
    const cols = isVeryWide ? 3 : isWideWeb ? 2 : 2;
    return (
      <View style={{ marginTop: 20, paddingHorizontal: 16 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginBottom: 12,
          }}
        >
          <Ionicons name="star" size={16} color="#F59E0B" />
          <Text style={{ color: theme.text, fontWeight: "800", fontSize: 15 }}>
            Vehículos destacados
          </Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {highlightedVehicles.map((item) => (
            <View
              key={item.id}
              style={{ width: `calc(${100 / cols}% - ${((cols - 1) * 12) / cols}px)` as any }}
            >
              <CarCard vehicle={item} />
            </View>
          ))}
        </View>
      </View>
    );
  };

  // ── Reviews preview ──
  const ReviewsPreview = () => {
    const reviewsWithText = recentReviews.filter((r) => r.review);
    if (reviewsWithText.length === 0) return null;
    return (
      <View style={{ marginTop: 16, paddingHorizontal: isDealerProfile ? 20 : 0 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14 }}>Opiniones</Text>
          {displayReviewCount > 3 && (
            <TouchableOpacity
              onPress={() =>
                router.push({ pathname: "/(screens)/reviews/[uid]", params: { uid: uidString } })
              }
            >
              <Text style={{ color: theme.accent, fontSize: 13, fontWeight: "600" }}>
                Ver todas ({displayReviewCount})
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {reviewsWithText.map((r) => (
          <ReviewCard key={r.id} item={r} theme={theme} />
        ))}
      </View>
    );
  };

  // ── Share CTA (visible dentro del perfil dealer) ──
  const ShareCTA = () => (
    <TouchableOpacity
      onPress={() => setShareSheetVisible(true)}
      style={{
        marginTop: 20,
        marginHorizontal: isDealerProfile ? 20 : 0,
        backgroundColor: theme.accent + "15",
        borderWidth: 1,
        borderColor: theme.accent + "40",
        borderRadius: 14,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: theme.accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="qr-code-outline" size={20} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14 }}>
          Compartir perfil de agencia
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
          Compartí tu link o QR por WhatsApp, redes o tarjeta
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.accent} />
    </TouchableOpacity>
  );

  // ── Inventory search input (rendered directly in JSX, never as inline component) ──
  const inventorySearchInput = (
    <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: theme.card,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.border,
          paddingHorizontal: 10,
          height: 38,
        }}
      >
        <Ionicons name="search-outline" size={16} color={theme.textMuted} style={{ marginRight: 6 }} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar por marca, modelo, año..."
          placeholderTextColor={theme.textMuted}
          style={{ flex: 1, color: theme.text, fontSize: 14, outlineStyle: "none" } as any}
          onFocus={() => {
            if (!isWideWeb) {
              scrollViewRef.current?.scrollTo({ y: Math.max(0, inventoryY - 8), animated: true });
            }
          }}
        />
        {!!searchQuery && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // ── Brand filter chips ──
  const InventoryFilters = () => {
    if (activeVehicles.length === 0) return null;
    if (availableBrands.length <= 1) return null;
    return (
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        {availableBrands.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6 }}
          >
            <TouchableOpacity
              onPress={() => setBrandFilter("")}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: !brandFilter ? theme.accent : theme.card,
                borderWidth: 1,
                borderColor: !brandFilter ? theme.accent : theme.border,
              }}
            >
              <Text style={{ color: !brandFilter ? "#fff" : theme.text, fontSize: 13, fontWeight: "600" }}>
                Todas
              </Text>
            </TouchableOpacity>
            {availableBrands.map((brand) => (
              <TouchableOpacity
                key={brand}
                onPress={() => setBrandFilter(brand === brandFilter ? "" : brand)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: brand === brandFilter ? theme.accent : theme.card,
                  borderWidth: 1,
                  borderColor: brand === brandFilter ? theme.accent : theme.border,
                }}
              >
                <Text
                  style={{
                    color: brand === brandFilter ? "#fff" : theme.text,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {brand}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    );
  };

  const InventoryTabs = () => (
    <View
      style={{
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
      }}
    >
      <TouchableOpacity
        onPress={() => {
          setActiveTab("active");
          setBrandFilter("");
          setSearchQuery("");
        }}
        style={{
          flex: 1,
          paddingVertical: 12,
          alignItems: "center",
          borderBottomWidth: activeTab === "active" ? 2 : 0,
          borderBottomColor: theme.accent,
        }}
      >
        <Text
          style={{ color: activeTab === "active" ? theme.text : theme.textMuted, fontWeight: "700" }}
        >
          En Venta ({activeVehicles.length})
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => {
          setActiveTab("sold");
          setBrandFilter("");
          setSearchQuery("");
        }}
        style={{
          flex: 1,
          paddingVertical: 12,
          alignItems: "center",
          borderBottomWidth: activeTab === "sold" ? 2 : 0,
          borderBottomColor: theme.accent,
        }}
      >
        <Text
          style={{ color: activeTab === "sold" ? theme.text : theme.textMuted, fontWeight: "700" }}
        >
          Vendidos ({soldVehicles.length})
        </Text>
      </TouchableOpacity>
    </View>
  );

  const carGridCols = isVeryWide ? 3 : isWideWeb ? 2 : 1;

  const CarGrid = () => (
    <View
      style={
        carGridCols > 1
          ? { padding: 16, flexDirection: "row", flexWrap: "wrap", gap: 16 }
          : { padding: 16, gap: 16 }
      }
    >
      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 20 }} />
      ) : displayedVehicles.length === 0 ? (
        <View style={{ width: "100%", alignItems: "center", paddingTop: 30 }}>
          <Ionicons
            name="car-outline"
            size={40}
            color={theme.textMuted}
            style={{ opacity: 0.4, marginBottom: 8 }}
          />
          <Text style={{ textAlign: "center", color: theme.textMuted }}>
            {searchQuery || brandFilter
              ? "Sin resultados para ese filtro."
              : activeTab === "active"
              ? "No hay vehículos en venta."
              : "No hay vehículos vendidos."}
          </Text>
          {(searchQuery || brandFilter) && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery("");
                setBrandFilter("");
              }}
              style={{ marginTop: 10 }}
            >
              <Text style={{ color: theme.accent, fontWeight: "600" }}>Limpiar filtros</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        displayedVehicles.map((item) => (
          <View
            key={item.id}
            style={
              carGridCols > 1
                ? {
                    width: `calc(${100 / carGridCols}% - ${((carGridCols - 1) * 16) / carGridCols}px)` as any,
                  }
                : { width: "100%" }
            }
          >
            <CarCard vehicle={item} />
          </View>
        ))
      )}
    </View>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={profileUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="profile" />
        <meta property="og:url" content={profileUrl} />
        {(profilePhotoUrl || profileData?.bannerUrl) && (
          <meta property="og:image" content={profilePhotoUrl || profileData.bannerUrl} />
        )}
        <meta
          name="twitter:card"
          content={profilePhotoUrl || profileData?.bannerUrl ? "summary_large_image" : "summary"}
        />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        {profileStructuredData && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(profileStructuredData) }}
          />
        )}
      </Head>

      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <WebContainer style={isWideWeb ? { maxWidth: 1280 } : undefined}>
          {/* Top nav bar */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }}>
              <Ionicons name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text
              style={{ fontSize: 17, fontWeight: "700", color: theme.text, flex: 1 }}
              numberOfLines={1}
            >
              {profileName}
            </Text>
            <View style={{ flexDirection: "row", gap: 14 }}>
              <TouchableOpacity onPress={() => router.push("/(tabs)")}>
                <Ionicons name="home-outline" size={24} color={theme.text} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShareSheetVisible(true)}>
                <Ionicons name="share-outline" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView ref={scrollViewRef} contentContainerStyle={{ paddingBottom: 40 }}>
            {isWideWeb ? (
              // ── DESKTOP ──────────────────────────────────────────────────
              <View>
                {/* Dealer banner goes full width above the 2-col */}
                {isDealerProfile && (
                  <View
                    style={{
                      height: 260,
                      backgroundColor: theme.accent + "22",
                      overflow: "hidden",
                    }}
                  >
                    {(profileData?.coverImage || profileData?.bannerUrl) ? (
                      <Image
                        source={{ uri: profileData.coverImage || profileData.bannerUrl }}
                        style={{ width: "100%", height: "100%" }}
                        contentFit="cover"
                      />
                    ) : (
                      <View
                        style={{ flex: 1, alignItems: "center", justifyContent: "center", opacity: 0.12 }}
                      >
                        <Ionicons name="business" size={100} color={theme.accent} />
                      </View>
                    )}
                  </View>
                )}

                <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                  {/* Left panel */}
                  <View
                    style={{
                      width: isDealerProfile ? 380 : 340,
                      borderRightWidth: 1,
                      borderRightColor: theme.border,
                      paddingBottom: 24,
                    }}
                  >
                    {isDealerProfile ? (
                      <>
                        {/* Logo + name for dealer desktop (banner is above) */}
                        <View style={{ padding: 20, paddingTop: 0, marginTop: -40 }}>
                          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
                            <View
                              style={{
                                width: 88,
                                height: 88,
                                borderRadius: 16,
                                backgroundColor: profileColor,
                                alignItems: "center",
                                justifyContent: "center",
                                overflow: "hidden",
                                borderWidth: 3,
                                borderColor: theme.card,
                                shadowColor: "#000",
                                shadowOpacity: 0.18,
                                shadowRadius: 12,
                                shadowOffset: { width: 0, height: 4 },
                              }}
                            >
                              {profilePhotoUrl ? (
                                <Image
                                  source={{ uri: profilePhotoUrl }}
                                  style={{ width: "100%", height: "100%" }}
                                  contentFit="cover"
                                />
                              ) : (
                                <Text style={{ fontSize: 34, fontWeight: "900", color: "#FFF" }}>
                                  {profileInitials}
                                </Text>
                              )}
                            </View>
                            <TouchableOpacity
                              onPress={() => setShareSheetVisible(true)}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                backgroundColor: theme.accent,
                                paddingHorizontal: 14,
                                paddingVertical: 8,
                                borderRadius: 999,
                                marginBottom: 4,
                              }}
                            >
                              <Ionicons name="share-social-outline" size={14} color="#fff" />
                              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
                                Compartir
                              </Text>
                            </TouchableOpacity>
                          </View>

                          <View style={{ marginTop: 12, gap: 6 }}>
                            <Text style={{ color: theme.text, fontWeight: "900", fontSize: 22 }}>
                              {profileName}
                            </Text>
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 4,
                                  backgroundColor: theme.accent + "18",
                                  borderWidth: 1,
                                  borderColor: theme.accent,
                                  paddingHorizontal: 8,
                                  paddingVertical: 3,
                                  borderRadius: 6,
                                }}
                              >
                                <Ionicons name="business" size={11} color={theme.accent} />
                                <Text style={{ color: theme.accent, fontSize: 11, fontWeight: "800" }}>
                                  AGENCIA VERIFICADA
                                </Text>
                              </View>
                              {profileData?.kycStatus === "verified" && (
                                <View
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 4,
                                    backgroundColor: "#10B98118",
                                    borderWidth: 1,
                                    borderColor: "#10B981",
                                    paddingHorizontal: 8,
                                    paddingVertical: 3,
                                    borderRadius: 6,
                                  }}
                                >
                                  <Ionicons name="shield-checkmark" size={11} color="#10B981" />
                                  <Text style={{ color: "#10B981", fontSize: 11, fontWeight: "700" }}>
                                    VERIFICADO
                                  </Text>
                                </View>
                              )}
                            </View>
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 2 }}>
                              {foundedYear && (
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                  <Ionicons name="calendar-outline" size={13} color={theme.textMuted} />
                                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                                    Desde {foundedYear}
                                  </Text>
                                </View>
                              )}
                              {(profileData?.city || profileData?.province) && (
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                  <Ionicons name="location-outline" size={13} color={theme.textMuted} />
                                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                                    {[profileData.city, profileData.province].filter(Boolean).join(", ")}
                                  </Text>
                                </View>
                              )}
                            </View>
                            {hasReviews && (
                              <TouchableOpacity
                                onPress={() =>
                                  router.push({
                                    pathname: "/(screens)/reviews/[uid]",
                                    params: { uid: uidString },
                                  })
                                }
                                style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
                              >
                                <Ionicons name="star" size={15} color="#F59E0B" />
                                <Text style={{ color: theme.text, fontWeight: "800", fontSize: 15 }}>
                                  {Number(displayRating ?? 0).toFixed(1)}
                                </Text>
                                <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                                  ({displayReviewCount} opiniones)
                                </Text>
                              </TouchableOpacity>
                            )}
                            {brandSpecialties.length > 0 && (
                              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 2 }}>
                                <Text style={{ color: theme.textMuted, fontSize: 12, alignSelf: "center" }}>
                                  Especialistas en:
                                </Text>
                                {brandSpecialties.map((b) => (
                                  <View
                                    key={b}
                                    style={{
                                      backgroundColor: theme.card,
                                      borderWidth: 1,
                                      borderColor: theme.border,
                                      paddingHorizontal: 7,
                                      paddingVertical: 2,
                                      borderRadius: 5,
                                    }}
                                  >
                                    <Text style={{ color: theme.text, fontSize: 11, fontWeight: "600" }}>
                                      {b}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        </View>

                        {/* Contact buttons */}
                        <View style={{ paddingHorizontal: 20 }}>
                          <ContactButtons />
                        </View>

                        {/* Info */}
                        <View style={{ paddingHorizontal: 20 }}>
                          <InfoSection />
                        </View>

                        <DealerStats />
                        <ShowroomGallery />
                        <ReviewsPreview />
                        <ShareCTA />
                      </>
                    ) : (
                      <>
                        <CompactHeader />
                        <View style={{ paddingHorizontal: 20 }}>
                          <ContactButtons />
                        </View>
                        {(isProProfile || isDealerProfile) && (
                          <View style={{ paddingHorizontal: 20 }}>
                            <InfoSection />
                          </View>
                        )}
                        {isProProfile && <DealerStats />}
                        <ReviewsPreview />
                      </>
                    )}
                  </View>

                  {/* Right panel: inventory */}
                  <View style={{ flex: 1 }}>
                    <HighlightedVehicles />
                    {highlightedVehicles.length > 0 && (
                      <View style={{ borderTopWidth: 1, borderTopColor: theme.border, marginTop: 8 }}>
                        <Text
                          style={{
                            color: theme.textMuted,
                            fontSize: 12,
                            fontWeight: "600",
                            padding: 12,
                            paddingBottom: 0,
                          }}
                        >
                          INVENTARIO COMPLETO
                        </Text>
                      </View>
                    )}
                    <View onLayout={(e) => setInventoryY(e.nativeEvent.layout.y)}>
                      <InventoryTabs />
                      {inventorySearchInput}
                      <InventoryFilters />
                      <CarGrid />
                    </View>
                    <TouchableOpacity
                      onPress={() => router.push("/(tabs)")}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 16,
                        marginTop: 8,
                        borderTopWidth: 1,
                        borderTopColor: theme.border,
                      }}
                    >
                      <Ionicons
                        name="car-sport-outline"
                        size={18}
                        color={theme.textMuted}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={{ color: theme.textMuted, fontSize: 14 }}>Ver todos los autos</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              // ── MOBILE ────────────────────────────────────────────────────
              <View>
                {isDealerProfile ? (
                  <>
                    <DealerHero />
                    <ContactButtons />
                    <View style={{ height: 1, backgroundColor: theme.border, marginTop: 16, marginHorizontal: 20 }} />
                    <InfoSection />
                    <DealerStats />
                    <ShowroomGallery />
                    <View style={{ height: 1, backgroundColor: theme.border, marginTop: 20 }} />
                    <HighlightedVehicles />
                    {highlightedVehicles.length > 0 && (
                      <Text
                        style={{
                          color: theme.textMuted,
                          fontSize: 12,
                          fontWeight: "600",
                          paddingHorizontal: 16,
                          paddingTop: 12,
                        }}
                      >
                        INVENTARIO COMPLETO
                      </Text>
                    )}
                    <View
                      style={{ marginTop: 12 }}
                      onLayout={(e) => setInventoryY(e.nativeEvent.layout.y)}
                    >
                      <InventoryTabs />
                      {inventorySearchInput}
                      <InventoryFilters />
                      <CarGrid />
                    </View>
                    <ReviewsPreview />
                    <ShareCTA />
                  </>
                ) : (
                  <View style={{ padding: 16 }}>
                    <CompactHeader />
                    <ContactButtons />
                    {isProProfile && (
                      <>
                        <InfoSection />
                        <DealerStats />
                      </>
                    )}
                    <View
                      style={{ marginTop: 20, marginHorizontal: -16 }}
                      onLayout={(e) => setInventoryY(e.nativeEvent.layout.y)}
                    >
                      <InventoryTabs />
                      {inventorySearchInput}
                      <InventoryFilters />
                      <CarGrid />
                    </View>
                    <ReviewsPreview />
                  </View>
                )}

                <TouchableOpacity
                  onPress={() => router.push("/(tabs)")}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 16,
                    marginTop: 8,
                    borderTopWidth: 1,
                    borderTopColor: theme.border,
                  }}
                >
                  <Ionicons
                    name="car-sport-outline"
                    size={18}
                    color={theme.textMuted}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={{ color: theme.textMuted, fontSize: 14 }}>Ver todos los autos</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </WebContainer>
      </SafeAreaView>

      <ShareSheet
        visible={shareSheetVisible}
        onClose={() => setShareSheetVisible(false)}
        url={profileUrl}
        title={
          isDealerProfile
            ? `Conocé la agencia ${profileName} en Matchcars`
            : `Mirá el perfil de ${profileName} en Matchcars`
        }
        theme={theme}
      />
    </>
  );
}
