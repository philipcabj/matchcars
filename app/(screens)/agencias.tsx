import { Header } from "@/components/Header";
import { WebContainer } from "@/components/WebContainer";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Link, useRouter } from "expo-router";
import Head from "expo-router/head";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Agency = {
  id: string;
  slug?: string | null;
  name: string;
  city?: string;
  province?: string;
  photoURL?: string | null;
  rating?: number | null;
  reviewCount?: number;
  activeCars?: number;
  brandSpecialties?: string[];
  foundedYear?: number | null;
};

const PROVINCES = [
  "Buenos Aires", "CABA", "Córdoba", "Santa Fe", "Mendoza",
  "Tucumán", "Entre Ríos", "Salta", "Misiones", "Chaco",
  "Corrientes", "Santiago del Estero", "San Juan", "Jujuy",
  "Río Negro", "Neuquén", "Formosa", "Chubut", "San Luis",
  "Catamarca", "La Rioja", "La Pampa", "Santa Cruz", "Tierra del Fuego",
];

function StarRating({ rating, size = 12 }: { rating: number; size?: number }) {
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

export default function AgenciesDirectoryScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWideWeb = Platform.OS === "web" && width >= 720;
  const [loading, setLoading] = useState(true);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [provinceFilter, setProvinceFilter] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "rating" | "cars">("name");

  useEffect(() => {
    const fetchAgencies = async () => {
      try {
        const col = collection(db, "users");
        const q = query(
          col,
          where("plan", "in", ["pro_dealer", "pro_dealer_monthly", "pro_dealer_annual"])
        );
        const snap = await getDocs(q);
        const items: Agency[] = [];

        for (const docSnap of snap.docs) {
          const data: any = docSnap.data();
          const name =
            data.agencyName ||
            (data.firstName || data.lastName
              ? `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim()
              : data.displayName || data.email || "Agencia");

          // Fetch active car count
          let activeCars = 0;
          try {
            const vehiclesSnap = await getDocs(
              query(
                collection(db, "vehicles"),
                where("userId", "==", docSnap.id),
                where("published", "==", true)
              )
            );
            activeCars = vehiclesSnap.size;
          } catch {}

          items.push({
            id: docSnap.id,
            slug: data.slug || null,
            name,
            city: data.location?.city ?? data.city ?? undefined,
            province: data.location?.province ?? data.province ?? undefined,
            photoURL: data.photoURL || data.avatar || null,
            rating: typeof data.sellerRating === "number" ? data.sellerRating : null,
            reviewCount: data.sellerReviewCount || 0,
            activeCars,
            brandSpecialties: data.brandSpecialties || [],
            foundedYear: data.foundedYear || null,
          });
        }

        setAgencies(items);
      } catch (e) {
        console.error("Error fetching agencies", e);
        setAgencies([]);
      } finally {
        setLoading(false);
      }
    };
    fetchAgencies();
  }, []);

  // Available provinces from the loaded agencies
  const availableProvinces = useMemo(() => {
    const set = new Set(agencies.map((a) => a.province).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [agencies]);

  // Filtered + sorted
  const displayedAgencies = useMemo(() => {
    let list = [...agencies];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.city?.toLowerCase().includes(q) ||
          a.province?.toLowerCase().includes(q) ||
          (a.brandSpecialties || []).some((b) => b.toLowerCase().includes(q))
      );
    }
    if (provinceFilter) {
      list = list.filter((a) => a.province === provinceFilter);
    }
    switch (sortBy) {
      case "rating":
        list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
      case "cars":
        list.sort((a, b) => (b.activeCars ?? 0) - (a.activeCars ?? 0));
        break;
      default:
        list.sort((a, b) => a.name.localeCompare(b.name, "es"));
    }
    return list;
  }, [agencies, searchQuery, provinceFilter, sortBy]);

  const agenciesStructuredData =
    agencies.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: agencies.map((a, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: a.slug ? `https://matchcars.app/agencia/${a.slug}` : `https://matchcars.app/user-profile/${a.id}`,
            name: a.name,
          })),
        }
      : null;

  const renderItem = ({ item }: { item: Agency }) => {
    const locationLabel = [item.city, item.province].filter(Boolean).join(", ");
    const initials =
      item.name
        .split(" ")
        .filter(Boolean)
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "AG";
    const yearsInBusiness =
      item.foundedYear ? new Date().getFullYear() - item.foundedYear : null;

    return (
      <TouchableOpacity
        onPress={() =>
          router.push(
            (item.slug ? `/(screens)/agencia/${item.slug}` : `/(screens)/user-profile/${item.id}`) as any
          )
        }
        style={{
          padding: 16,
          borderRadius: 16,
          backgroundColor: theme.card,
          borderWidth: 1,
          borderColor: theme.border,
          marginBottom: 12,
          shadowColor: "#000",
          shadowOpacity: 0.05,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
          {/* Logo */}
          <View
            style={{
              width: 58,
              height: 58,
              borderRadius: 14,
              backgroundColor: theme.badgeBackground,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            {item.photoURL ? (
              <Image
                source={{ uri: item.photoURL }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            ) : (
              <Text style={{ color: theme.badgeText, fontWeight: "700", fontSize: 20 }}>
                {initials}
              </Text>
            )}
          </View>

          {/* Info */}
          <View style={{ flex: 1, gap: 3 }}>
            <Text
              style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}
              numberOfLines={1}
            >
              {item.name}
            </Text>

            {locationLabel ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="location-outline" size={12} color={theme.textMuted} />
                <Text style={{ color: theme.textMuted, fontSize: 13 }} numberOfLines={1}>
                  {locationLabel}
                </Text>
              </View>
            ) : null}

            {/* Meta row: años + autos */}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 2 }}>
              {yearsInBusiness && yearsInBusiness > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Ionicons name="calendar-outline" size={11} color={theme.textMuted} />
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                    {yearsInBusiness} años
                  </Text>
                </View>
              )}
              {(item.activeCars ?? 0) > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Ionicons name="car-outline" size={11} color={theme.accent} />
                  <Text style={{ color: theme.accent, fontSize: 12, fontWeight: "600" }}>
                    {item.activeCars} autos
                  </Text>
                </View>
              )}
            </View>

            {/* Rating */}
            {item.rating != null && item.rating > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 }}>
                <StarRating rating={item.rating} />
                <Text style={{ color: theme.text, fontWeight: "700", fontSize: 12 }}>
                  {item.rating.toFixed(1)}
                </Text>
                {(item.reviewCount ?? 0) > 0 && (
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                    ({item.reviewCount} opiniones)
                  </Text>
                )}
              </View>
            )}

            {/* Brand tags */}
            {(item.brandSpecialties || []).length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 5, marginTop: 4 }}
              >
                {(item.brandSpecialties || []).slice(0, 4).map((brand) => (
                  <View
                    key={brand}
                    style={{
                      backgroundColor: theme.badgeBackground,
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderRadius: 5,
                    }}
                  >
                    <Text style={{ color: theme.badgeText, fontSize: 10, fontWeight: "600" }}>
                      {brand}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          <View style={{ alignItems: "flex-end", gap: 8 }}>
            {/* Verified badge */}
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor: theme.accent + "18",
                borderWidth: 1,
                borderColor: theme.accent + "40",
              }}
            >
              <Text style={{ color: theme.accent, fontSize: 9, fontWeight: "800" }}>
                VERIFICADA
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <Head>
        <title>Agencias de autos usados en Argentina | Matchcars</title>
        <meta
          name="description"
          content="Buscá agencias de autos usados en Argentina verificadas en Matchcars, mirá su reputación y autos publicados."
        />
        <link rel="canonical" href="https://matchcars.app/agencias" />
        {agenciesStructuredData && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(agenciesStructuredData) }}
          />
        )}
      </Head>

      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Header title="Agencias" showBack showHome />
        <WebContainer>
          <View style={{ flex: 1 }}>
            {/* Header */}
            {Platform.OS === "web" && (
              <View style={{ padding: 16, paddingBottom: 0 }}>
                <Text style={{ color: theme.text, fontSize: 20, fontWeight: "800", marginBottom: 4 }}>
                  Directorio de agencias verificadas
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 14, lineHeight: 20 }}>
                  Encontrá agencias profesionales con stock de vehículos en Matchcars.
                </Text>
              </View>
            )}

            {/* Search + Filters */}
            <View style={{ padding: 16, gap: 10 }}>
              {/* Search bar */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: theme.card,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: theme.border,
                  paddingHorizontal: 12,
                  height: 42,
                }}
              >
                <Ionicons name="search-outline" size={16} color={theme.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Buscar agencia, ciudad o marca..."
                  placeholderTextColor={theme.textMuted}
                  style={{ flex: 1, color: theme.text, fontSize: 14, outlineStyle: "none" } as any}
                />
                {!!searchQuery && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <Ionicons name="close-circle" size={16} color={theme.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Province filter chips */}
              {availableProvinces.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6 }}
                >
                  <TouchableOpacity
                    onPress={() => setProvinceFilter("")}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: !provinceFilter ? theme.accent : theme.card,
                      borderWidth: 1,
                      borderColor: !provinceFilter ? theme.accent : theme.border,
                    }}
                  >
                    <Text
                      style={{
                        color: !provinceFilter ? "#fff" : theme.text,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      Todas
                    </Text>
                  </TouchableOpacity>
                  {availableProvinces.map((prov) => (
                    <TouchableOpacity
                      key={prov}
                      onPress={() => setProvinceFilter(prov === provinceFilter ? "" : prov)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 5,
                        borderRadius: 999,
                        backgroundColor: prov === provinceFilter ? theme.accent : theme.card,
                        borderWidth: 1,
                        borderColor: prov === provinceFilter ? theme.accent : theme.border,
                      }}
                    >
                      <Text
                        style={{
                          color: prov === provinceFilter ? "#fff" : theme.text,
                          fontSize: 13,
                          fontWeight: "600",
                        }}
                      >
                        {prov}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Sort row */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>Ordenar:</Text>
                {(["name", "rating", "cars"] as const).map((opt) => {
                  const labels = { name: "A–Z", rating: "Mejor valoradas", cars: "Más autos" };
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => setSortBy(opt)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 999,
                        backgroundColor: sortBy === opt ? theme.accent : theme.inputBackground,
                        borderWidth: 1,
                        borderColor: sortBy === opt ? theme.accent : theme.border,
                      }}
                    >
                      <Text
                        style={{
                          color: sortBy === opt ? "#fff" : theme.textMuted,
                          fontSize: 12,
                          fontWeight: "600",
                        }}
                      >
                        {labels[opt]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Results count */}
            {!loading && (
              <Text style={{ color: theme.textMuted, fontSize: 12, paddingHorizontal: 16, marginBottom: 4 }}>
                {displayedAgencies.length} agencia{displayedAgencies.length !== 1 ? "s" : ""} encontrada{displayedAgencies.length !== 1 ? "s" : ""}
              </Text>
            )}

            {/* List */}
            {loading ? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", minHeight: 200 }}>
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : displayedAgencies.length === 0 ? (
              <View style={{ alignItems: "center", justifyContent: "center", padding: 24, minHeight: 200 }}>
                <Ionicons name="business-outline" size={40} color={theme.textMuted} />
                <Text
                  style={{
                    color: theme.text,
                    marginTop: 12,
                    fontSize: 16,
                    textAlign: "center",
                    fontWeight: "600",
                  }}
                >
                  {searchQuery || provinceFilter
                    ? "Sin agencias para ese filtro."
                    : "Todavía no hay agencias publicadas."}
                </Text>
                {(searchQuery || provinceFilter) && (
                  <TouchableOpacity
                    onPress={() => { setSearchQuery(""); setProvinceFilter(""); }}
                    style={{ marginTop: 12 }}
                  >
                    <Text style={{ color: theme.accent, fontWeight: "600" }}>Limpiar filtros</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : isWideWeb ? (
              /* ── Web desktop: 2-column grid ── */
              <ScrollView
                contentContainerStyle={{
                  padding: 16,
                  paddingTop: 4,
                  paddingBottom: 32,
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                {displayedAgencies.map((item) => (
                  <View key={item.id} style={{ width: "calc(50% - 6px)" as any }}>
                    {renderItem({ item })}
                  </View>
                ))}
              </ScrollView>
            ) : (
              /* ── Mobile / narrow web: single column ── */
              <FlatList
                data={displayedAgencies}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 32 }}
              />
            )}

            {/* CTA for dealers */}
            {Platform.OS === "web" && (
              <View
                style={{
                  margin: 16,
                  marginTop: 0,
                  borderTopWidth: 1,
                  borderTopColor: theme.border,
                  paddingTop: 12,
                }}
              >
                <Text style={{ color: theme.textMuted, fontSize: 12, lineHeight: 18 }}>
                  ¿Tenés una agencia y querés aparecer en este listado?{" "}
                  <Link href="/profile" style={{ color: theme.accent }}>
                    Activá el plan Pro Dealer
                  </Link>{" "}
                  y completá los datos de tu agencia.
                </Text>
              </View>
            )}
          </View>
        </WebContainer>
      </SafeAreaView>
    </>
  );
}
