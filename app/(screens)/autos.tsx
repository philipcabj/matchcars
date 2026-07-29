import { CarCard } from "@/components/cards/carcard";
import { Header } from "@/components/Header";
import { WebContainer } from "@/components/WebContainer";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import type { Vehicle } from "@/types/vehicle";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Head from "expo-router/head";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

export default function AutosDirectoryScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const isWeb = Platform.OS === "web";

  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const col = collection(db, "vehicles");
        const q = query(col, where("published", "==", true));
        const snap = await getDocs(q);
        const items: Vehicle[] = [];
        snap.forEach((docSnap) => {
          const data: any = docSnap.data();
          if (["rejected", "blocked", "deleted"].includes(data.status)) {
            return;
          }
          const mapped: Vehicle = {
            id: docSnap.id,
            brand: data.brand,
            model: data.model,
            version: data.version ?? undefined,
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
            status: data.status,
            published: data.published,
          } as any;
          items.push(mapped);
        });
        items.sort((a, b) => {
          const da = (a as any).createdAt?.seconds ?? 0;
          const dbs = (b as any).createdAt?.seconds ?? 0;
          return dbs - da;
        });
        setVehicles(items.slice(0, 100));
      } catch (e) {
        console.error("Error fetching vehicles", e);
        setVehicles([]);
      } finally {
        setLoading(false);
      }
    };
    fetchVehicles();
  }, []);

  const vehiclesStructuredData =
    vehicles.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: vehicles.map((v, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: `https://matchcars.app/car/${v.id}`,
            name: [v.brand, v.model, v.year].filter(Boolean).join(" "),
          })),
        }
      : null;

  return (
    <>
      <Head>
        <title>Autos usados en venta en Argentina | Matchcars</title>
        <meta
          name="description"
          content="Buscá autos usados en venta en Argentina publicados en Matchcars por particulares y agencias verificadas."
        />
        <link rel="canonical" href="https://matchcars.app/autos" />
        {vehiclesStructuredData && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(vehiclesStructuredData),
            }}
          />
        )}
      </Head>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Header title="Autos en venta" showBack showHome />
        <WebContainer>
          <View style={{ flex: 1, padding: 16 }}>
            {Platform.OS === "web" && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700", marginBottom: 6 }}>
                  Listado de autos usados
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 14, lineHeight: 20 }}>
                  Explorá autos usados publicados en Matchcars. Podés filtrar y buscar más opciones dentro
                  de la app.
                </Text>
              </View>
            )}

            {loading ? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : vehicles.length === 0 ? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
                <Ionicons name="car-sport-outline" size={40} color={theme.textMuted} />
                <Text style={{ color: theme.text, marginTop: 12, fontSize: 16, textAlign: "center" }}>
                  Todavía no hay autos publicados.
                </Text>
              </View>
            ) : (
              isWeb ? (
                <FlatList
                  data={vehicles}
                  keyExtractor={(item) => item.id}
                  numColumns={2}
                  columnWrapperStyle={{ gap: 16, marginBottom: 16 }}
                  renderItem={({ item }) => {
                    const title = [item.brand, item.model, item.version]
                      .filter(Boolean)
                      .join(" ");
                    const subtitleParts = [];
                    if (item.year) subtitleParts.push(String(item.year));
                    if (item.km != null) subtitleParts.push(`${item.km.toLocaleString("es-AR")} km`);
                    const subtitle = subtitleParts.join(" • ");
                    const currencyLabel = item.currency === "USD" ? "USD" : "$";
                    return (
                      <TouchableOpacity
                        onPress={() => router.push(`/car/${item.id}` as any)}
                        style={{
                          flex: 1,
                          backgroundColor: theme.card,
                          borderRadius: 16,
                          overflow: "hidden",
                          borderWidth: 1,
                          borderColor: theme.border,
                          minHeight: 220,
                        }}
                        activeOpacity={0.9}
                      >
                        {item.coverImage && (
                          <Image
                            source={{ uri: item.coverImage }}
                            style={{ width: "100%", height: 150 }}
                            contentFit="cover"
                          />
                        )}
                        <View style={{ padding: 10, gap: 4 }}>
                          <Text
                            style={{ color: theme.text, fontWeight: "700", fontSize: 15 }}
                            numberOfLines={1}
                          >
                            {title}
                          </Text>
                          {subtitle ? (
                            <Text
                              style={{ color: theme.textMuted, fontSize: 12 }}
                              numberOfLines={1}
                            >
                              {subtitle}
                            </Text>
                          ) : null}
                          {item.city || item.province ? (
                            <Text
                              style={{ color: theme.textMuted, fontSize: 12 }}
                              numberOfLines={1}
                            >
                              {[item.city, item.province].filter(Boolean).join(", ")}
                            </Text>
                          ) : null}
                          <Text
                            style={{
                              color: theme.accent,
                              fontWeight: "700",
                              marginTop: 4,
                              fontSize: 15,
                            }}
                            numberOfLines={1}
                          >
                            {currencyLabel}{" "}
                            {item.price != null ? item.price.toLocaleString("es-AR") : ""}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                  contentContainerStyle={{ paddingBottom: 24 }}
                />
              ) : (
                <FlatList
                  data={vehicles}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <View style={{ marginBottom: 12 }}>
                      <CarCard vehicle={item} hideLike />
                    </View>
                  )}
                  contentContainerStyle={{ paddingBottom: 24 }}
                />
              )
            )}
          </View>
        </WebContainer>
      </SafeAreaView>
    </>
  );
}
