import { DownloadAppBanner } from "@/components/DownloadAppBanner";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useDebounce } from "@/hooks/useDebounce";
import { analyzeMarketPrice, getAvailableYears, MarketAnalysis } from "@/lib/pricing";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as CarModelsAr from "../../config/carModelsAr";

type CarArItem = { make: string; model: string };

export default function TasadorScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const RAW_CATALOG = (CarModelsAr as any)?.CAR_MODELS_AR;
  const MODELS_AR: CarArItem[] = Array.isArray(RAW_CATALOG) ? (RAW_CATALOG as CarArItem[]) : [];
  const MAKES: string[] = MODELS_AR.length ? Array.from(new Set(MODELS_AR.map((x) => x.make))).sort() : [
    "Toyota", "Volkswagen", "Ford", "Chevrolet", "Peugeot", "Renault", "Fiat", "Honda", "Hyundai", "Nissan"
  ];
  const MODELS_BY_MAKE: Record<string, string[]> = MODELS_AR.length ? MODELS_AR.reduce((acc, item) => {
    const list = acc[item.make] || [];
    if (!list.includes(item.model)) list.push(item.model);
    acc[item.make] = list;
    return acc;
  }, {} as Record<string, string[]>) : {};
  const CURRENT_YEAR = new Date().getFullYear();
  const FALLBACK_YEAR_OPTIONS: number[] = Array.from({ length: 40 }, (_, i) => CURRENT_YEAR - i);

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [currency, setCurrency] = useState<"ARS" | "USD">("ARS");

  const [brandOpen, setBrandOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [yearOpen, setYearOpen] = useState(false);
  const [brandQuery, setBrandQuery] = useState("");
  const [modelQuery, setModelQuery] = useState("");
  const debouncedBrandQuery = useDebounce(brandQuery, 300);
  const debouncedModelQuery = useDebounce(modelQuery, 300);

  // Years the selected model actually has data for (MatchCars listings + reference guide).
  // Falls back to a generic 40-year range if we can't determine specific years (rare models
  // with no data in either source) so the tool never becomes unusable.
  const [yearOptions, setYearOptions] = useState<number[]>(FALLBACK_YEAR_OPTIONS);
  const [yearsLoading, setYearsLoading] = useState(false);

  const handleSelectModel = async (mo: string) => {
    setModel(mo);
    setModelOpen(false);
    setModelQuery("");
    setYear("");
    setResult(null);
    setSearched(false);
    setYearsLoading(true);
    try {
      const years = await getAvailableYears(brand, mo);
      setYearOptions(years.length > 0 ? years : FALLBACK_YEAR_OPTIONS);
    } catch (e) {
      console.error("Error loading available years:", e);
      setYearOptions(FALLBACK_YEAR_OPTIONS);
    } finally {
      setYearsLoading(false);
    }
  };

  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState<MarketAnalysis | null>(null);

  // On web, "Publicá tu auto" should never show the login screen — it's meant to funnel
  // anonymous visitors toward the mobile app instead (mobile web -> store link,
  // desktop web -> inline download prompt).
  const [isMobileWeb, setIsMobileWeb] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showDownloadPrompt, setShowDownloadPrompt] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    if (/iphone|ipad|ipod/i.test(userAgent)) {
      setIsMobileWeb(true);
      setIsIOS(true);
    } else if (/android/i.test(userAgent)) {
      setIsMobileWeb(true);
    }
  }, []);

  const handlePublishPress = () => {
    if (Platform.OS === "web") {
      if (isMobileWeb) {
        const storeUrl = isIOS
          ? "https://apps.apple.com/ar/app/matchcars/id6757968664"
          : "https://play.google.com/store/apps/details?id=com.matchcars.app";
        Linking.openURL(storeUrl);
      } else {
        setShowDownloadPrompt(true);
      }
      return;
    }
    router.push(user ? "/(screens)/add-car" as any : "/login" as any);
  };

  const canCalculate = !!brand && !!model && !!year && !loading;

  const handleCalculate = async () => {
    if (!canCalculate) return;
    setLoading(true);
    setSearched(true);
    try {
      const analysis = await analyzeMarketPrice(brand, model, Number(year), currency);
      setResult(analysis);
    } catch (e) {
      console.error("Error calculando estimación de precio:", e);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number) => `${currency} ${Math.round(n).toLocaleString("es-AR")}`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: theme.badgeBorder }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>¿Cuánto vale tu auto?</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 16, lineHeight: 19 }}>
          Elegí marca, modelo y año para ver un rango de precio estimado, basado en una guía de precios de mercado y en publicaciones de MatchCars.
        </Text>

        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={() => { setBrandOpen((p) => !p); setModelOpen(false); setYearOpen(false); }}
              style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, backgroundColor: theme.inputBackground }}
            >
              <Text style={{ color: theme.inputText, fontWeight: brand ? "700" : "400", fontSize: 13 }}>{brand || "Marca"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={!brand}
              onPress={() => { setModelOpen((p) => !p); setBrandOpen(false); setYearOpen(false); }}
              style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, backgroundColor: theme.inputBackground, opacity: brand ? 1 : 0.6 }}
            >
              <Text style={{ color: theme.inputText, fontWeight: model ? "700" : "400", fontSize: 13 }}>{model || (brand ? "Modelo" : "Elegí primero Marca")}</Text>
            </TouchableOpacity>
          </View>

          {brandOpen && (
            <View style={{ borderWidth: 1, borderColor: theme.likeBoxBackground, backgroundColor: theme.card, borderRadius: 10, height: 220 }}>
              <TextInput value={brandQuery} onChangeText={setBrandQuery} placeholder="Buscar marca" placeholderTextColor={theme.textMuted} style={{ paddingHorizontal: 12, paddingVertical: 10, color: theme.text }} />
              <ScrollView keyboardShouldPersistTaps="handled" style={{ height: 176 }}>
                {MAKES
                  .filter((m) => m.toLowerCase().includes(debouncedBrandQuery.toLowerCase()))
                  .map((m) => (
                    <TouchableOpacity
                      key={m}
                      onPress={() => { setBrand(m); setModel(""); setYear(""); setYearOptions(FALLBACK_YEAR_OPTIONS); setBrandOpen(false); setBrandQuery(""); setResult(null); setSearched(false); }}
                      style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: m === brand ? `${theme.accent}22` : undefined }}
                    >
                      <Text style={{ color: m === brand ? theme.accent : theme.text }}>{m}</Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </View>
          )}

          {modelOpen && (
            <View style={{ borderWidth: 1, borderColor: theme.likeBoxBackground, backgroundColor: theme.card, borderRadius: 10, height: 220 }}>
              <TextInput value={modelQuery} onChangeText={setModelQuery} placeholder="Buscar modelo" placeholderTextColor={theme.textMuted} style={{ paddingHorizontal: 12, paddingVertical: 10, color: theme.text }} />
              <ScrollView keyboardShouldPersistTaps="handled" style={{ height: 176 }}>
                {(MODELS_BY_MAKE[brand] || [])
                  .filter((mo) => mo.toLowerCase().includes(debouncedModelQuery.toLowerCase()))
                  .map((mo) => (
                    <TouchableOpacity
                      key={mo}
                      onPress={() => handleSelectModel(mo)}
                      style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: mo === model ? `${theme.accent}22` : undefined }}
                    >
                      <Text style={{ color: mo === model ? theme.accent : theme.text }}>{mo}</Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </View>
          )}

          <TouchableOpacity
            disabled={!model}
            onPress={() => { setYearOpen((p) => !p); setBrandOpen(false); setModelOpen(false); }}
            style={{ borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, backgroundColor: theme.inputBackground, opacity: model ? 1 : 0.6 }}
          >
            <Text style={{ color: theme.inputText, fontWeight: year ? "700" : "400", fontSize: 13 }}>
              {year || (yearsLoading ? "Buscando años disponibles…" : (model ? "Año" : "Elegí primero Modelo"))}
            </Text>
          </TouchableOpacity>

          {yearOpen && (
            <View style={{ borderWidth: 1, borderColor: theme.likeBoxBackground, backgroundColor: theme.card, borderRadius: 10, height: 220 }}>
              {yearsLoading ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <ActivityIndicator color={theme.accent} />
                </View>
              ) : yearOptions.length === 0 ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
                  <Text style={{ color: theme.textMuted, fontSize: 12, textAlign: "center" }}>
                    No encontramos años disponibles para este modelo.
                  </Text>
                </View>
              ) : (
                <ScrollView keyboardShouldPersistTaps="handled">
                  {yearOptions.map((yo) => (
                    <TouchableOpacity
                      key={yo}
                      onPress={() => { setYear(String(yo)); setYearOpen(false); setResult(null); setSearched(false); }}
                      style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: String(yo) === year ? `${theme.accent}22` : undefined }}
                    >
                      <Text style={{ color: String(yo) === year ? theme.accent : theme.text }}>{yo}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["ARS", "USD"] as const).map((cur) => {
              const active = currency === cur;
              return (
                <TouchableOpacity
                  key={cur}
                  onPress={() => { setCurrency(cur); setResult(null); setSearched(false); }}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: active ? theme.accent : theme.likeBoxBackground, backgroundColor: active ? `${theme.accent}11` : theme.inputBackground, alignItems: "center" }}
                >
                  <Text style={{ color: active ? theme.accent : theme.text, fontWeight: "600", fontSize: 13 }}>{cur}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            onPress={handleCalculate}
            disabled={!canCalculate}
            style={{ marginTop: 8, backgroundColor: canCalculate ? theme.accent : theme.textMuted, borderRadius: 10, paddingVertical: 14, alignItems: "center", opacity: canCalculate ? 1 : 0.6 }}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 15 }}>Calcular estimación</Text>
            )}
          </TouchableOpacity>
        </View>

        {searched && !loading && result && (
          result.count > 0 ? (
            <View style={{ marginTop: 24 }}>
              <Text style={{ color: theme.text, fontWeight: "700", fontSize: 15, marginBottom: 12 }}>
                {brand} {model} {year}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.badgeBorder, padding: 12, alignItems: "center" }}>
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>Mínimo</Text>
                  <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14, marginTop: 4 }}>{fmt(result.min)}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: `${theme.accent}12`, borderRadius: 12, borderWidth: 1, borderColor: theme.accent, padding: 12, alignItems: "center" }}>
                  <Text style={{ color: theme.accent, fontSize: 11, fontWeight: "700" }}>Promedio</Text>
                  <Text style={{ color: theme.text, fontWeight: "800", fontSize: 16, marginTop: 4 }}>{fmt(result.avg)}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.badgeBorder, padding: 12, alignItems: "center" }}>
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>Máximo</Text>
                  <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14, marginTop: 4 }}>{fmt(result.max)}</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 10 }}>
                <Ionicons name={result.source === "reference" ? "shield-checkmark-outline" : "car-sport-outline"} size={12} color={theme.textMuted} />
                <Text style={{ color: theme.textMuted, fontSize: 11, textAlign: "center" }}>
                  {result.source === "reference"
                    ? `Basado en guía de precios de mercado (${result.count} versi${result.count === 1 ? "ón" : "ones"}).`
                    : `Basado en ${result.count} publicaci${result.count === 1 ? "ón" : "ones"} actual${result.count === 1 ? "" : "es"} en MatchCars.`}
                </Text>
              </View>
              <Text style={{ color: theme.textMuted, fontSize: 10, textAlign: "center", marginTop: 2 }}>
                Es una estimación, no una tasación oficial.
              </Text>
              {result.exchangeRate ? (
                <Text style={{ color: theme.textMuted, fontSize: 10, textAlign: "center", marginTop: 6 }}>
                  Cotización usada: USD 1 = ARS {Math.round(result.exchangeRate).toLocaleString("es-AR")} ({result.exchangeRateSource})
                </Text>
              ) : null}

              <TouchableOpacity
                onPress={handlePublishPress}
                style={{ marginTop: 20, borderWidth: 1, borderColor: theme.accent, borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
              >
                <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 14 }}>Publicá tu auto gratis</Text>
              </TouchableOpacity>
              {showDownloadPrompt && (
                <DownloadAppBanner message="Descargá la app para publicar tu auto" />
              )}
            </View>
          ) : (
            <View style={{ marginTop: 24, alignItems: "center", padding: 16 }}>
              <Ionicons name="search-outline" size={40} color={theme.textMuted} />
              <Text style={{ color: theme.text, fontWeight: "600", fontSize: 14, marginTop: 12, textAlign: "center" }}>
                Todavía no tenemos suficientes publicaciones de {brand} {model} {year} para estimar un precio.
              </Text>
              <TouchableOpacity
                onPress={handlePublishPress}
                style={{ marginTop: 16, backgroundColor: theme.accent, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20, alignItems: "center" }}
              >
                <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 14 }}>Publicá el primero</Text>
              </TouchableOpacity>
              {showDownloadPrompt && (
                <DownloadAppBanner message="Descargá la app para publicar tu auto" />
              )}
            </View>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
