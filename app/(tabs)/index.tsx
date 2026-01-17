import { CarCard } from "@/components/cards/carcard";
import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import type { Vehicle } from "@/types/vehicle";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as CarModelsAr from "../../config/carModelsAr";

export default function AutosPublicTab() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const owner = (params?.owner as string) || undefined;
  const favOf = (params?.favOf as string) || undefined;
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [likesRemaining, setLikesRemaining] = useState<number>(10);
  const [provinceFilter, setProvinceFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [yearMin, setYearMin] = useState("");
  const [yearMax, setYearMax] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [kmMin, setKmMin] = useState("");
  const [kmMax, setKmMax] = useState("");
  const [financingOnly, setFinancingOnly] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [brandQuery, setBrandQuery] = useState("");
  const [modelQuery, setModelQuery] = useState("");
  const [makesRemote, setMakesRemote] = useState<string[]>([]);
  const [modelsRemote, setModelsRemote] = useState<string[]>([]);
  const [provinceOpen, setProvinceOpen] = useState(false);
  const [provinceQuery, setProvinceQuery] = useState("");
  const [yearMinOpen, setYearMinOpen] = useState(false);
  const [yearMaxOpen, setYearMaxOpen] = useState(false);
  const [priceMinOpen, setPriceMinOpen] = useState(false);
  const [priceMaxOpen, setPriceMaxOpen] = useState(false);
  const [kmMinOpen, setKmMinOpen] = useState(false);
  const [kmMaxOpen, setKmMaxOpen] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [filterCurrency, setFilterCurrency] = useState<"ARS" | "USD" | undefined>(undefined);
  type CarArItem = { make: string; model: string };
  const RAW_CATALOG = (CarModelsAr as any)?.CAR_MODELS_AR;
  const MODELS_AR: CarArItem[] = Array.isArray(RAW_CATALOG) ? (RAW_CATALOG as CarArItem[]) : [];
  const DEFAULT_MAKES: string[] = MODELS_AR.length ? Array.from(new Set(MODELS_AR.map((x) => x.make))).sort() : [
    "Toyota","Volkswagen","Ford","Chevrolet","Peugeot","Renault","Fiat","Honda","Hyundai","Nissan"
  ];
  const DEFAULT_MODELS_BY_MAKE: Record<string, string[]> = MODELS_AR.length ? MODELS_AR.reduce((acc, item) => {
    const list = acc[item.make] || [];
    if (!list.includes(item.model)) list.push(item.model);
    acc[item.make] = list;
    return acc;
  }, {} as Record<string, string[]>) : {};
  const PROVINCES: string[] = [
    "Buenos Aires",
    "CABA",
    "Catamarca",
    "Chaco",
    "Chubut",
    "Córdoba",
    "Corrientes",
    "Entre Ríos",
    "Formosa",
    "Jujuy",
    "La Pampa",
    "La Rioja",
    "Mendoza",
    "Misiones",
    "Neuquén",
    "Río Negro",
    "Salta",
    "San Juan",
    "San Luis",
    "Santa Cruz",
    "Santa Fe",
    "Santiago del Estero",
    "Tierra del Fuego",
    "Tucumán",
  ];
  const CURRENT_YEAR = new Date().getFullYear();
  const YEAR_OPTIONS: number[] = Array.from({ length: 40 }, (_, i) => CURRENT_YEAR - i);
  const PRICE_STEPS_ARS: number[] = [4000000, 6000000, 8000000, 10000000, 15000000, 20000000, 30000000, 50000000, 80000000, 120000000];
  const PRICE_STEPS_USD: number[] = [3000, 5000, 8000, 10000, 15000, 20000, 30000, 50000, 80000];
  const ACTIVE_PRICE_STEPS: number[] = filterCurrency === "ARS" ? PRICE_STEPS_ARS : filterCurrency === "USD" ? PRICE_STEPS_USD : [];
  const KM_STEPS: number[] = [0, 10000, 20000, 50000, 80000, 100000, 150000, 200000, 300000];

  const filteredVehicles = vehicles.filter((v) => {
    const favMatch = !favOf || favoriteIds.has(v.id);
    const ownerMatch = !owner || v.userId === owner;
    const notMineMatch = owner || favOf ? true : (!user || v.userId !== user.uid);
    const brandMatch = (v.brand || "").toLowerCase().includes(brandFilter.toLowerCase());
    const modelMatch = (v.model || "").toLowerCase().includes(modelFilter.toLowerCase());
    const prov = (v.location?.province || v.province || "").toLowerCase();
    const pf = provinceFilter.toLowerCase();
    const provinceMatch = !pf || prov.includes(pf) || (pf === "caba" && (prov.includes("caba") || prov.includes("ciudad autónoma de buenos aires") || prov.includes("capital federal")));
    const y = Number(v.year);
    const yMin = yearMin ? Number(yearMin) : undefined;
    const yMax = yearMax ? Number(yearMax) : undefined;
    const yearMatch = (!yMin || (!isNaN(y) && y >= yMin)) && (!yMax || (!isNaN(y) && y <= yMax));
    const p = Number(v.price);
    const pMin = priceMin ? Number(priceMin) : undefined;
    const pMax = priceMax ? Number(priceMax) : undefined;
    const currencyMatch = !filterCurrency || v.currency === filterCurrency;
    const priceActive = !!filterCurrency && (!!pMin || !!pMax);
    const priceMatch = (!priceActive || (currencyMatch && (!pMin || (!isNaN(p) && p >= pMin)) && (!pMax || (!isNaN(p) && p <= pMax))));
    const k = Number(v.km);
    const kMin = kmMin ? Number(kmMin) : undefined;
    const kMax = kmMax ? Number(kmMax) : undefined;
    const kmMatch = (!kMin || (!isNaN(k) && k >= kMin)) && (!kMax || (!isNaN(k) && k <= kMax));
    const finMatch = !financingOnly || v.acceptsFinancing === true;
    const currencyListMatch = !filterCurrency || v.currency === filterCurrency;
    return favMatch && ownerMatch && notMineMatch && brandMatch && modelMatch && provinceMatch && yearMatch && currencyListMatch && priceMatch && kmMatch && finMatch;
  });

  async function loadMakes() {
    try {
      const snap = await getDocs(collection(db, "catalog", "default", "makes"));
      const arr: string[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        const name = data?.name || d.id;
        if (name) arr.push(name);
      });
      setMakesRemote(arr);
    } catch {
      setMakesRemote([]);
    }
  }

  async function loadModels(make: string) {
    try {
      const snap = await getDocs(collection(db, "catalog", "default", "makes", make, "models"));
      const arr: string[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        const name = data?.name || d.id;
        if (name) arr.push(name);
      });
      setModelsRemote(arr.length ? arr : (DEFAULT_MODELS_BY_MAKE[make] || []));
    } catch {
      setModelsRemote(DEFAULT_MODELS_BY_MAKE[make] || []);
    }
  }

  useEffect(() => {
    const ref = collection(db, "vehicles");
    const unsub = onSnapshot(ref, (snap) => {
      const items: Vehicle[] = [];
      snap.forEach((doc) => {
        const data: any = doc.data();
        const mapped: Vehicle = {
          id: doc.id,
          brand: data.brand,
          model: data.model,
          version: data.version ?? undefined,
          year: data.year,
          price: data.price,
          currency: data.currency,
          km: data.km,
          coverImage: data.coverImage ?? data.images?.cover ?? undefined,
          additionalImages: data.additionalImages ?? data.images?.gallery ?? undefined,
          city: data.location?.city ?? data.city,
          province: data.location?.province ?? data.province,
          location: data.location ? {
            latitude: data.location.latitude ?? undefined,
            longitude: data.location.longitude ?? undefined,
            address: data.location.address ?? undefined,
            city: data.location.city ?? undefined,
            province: data.location.province ?? undefined,
          } : undefined,
          userId: data.userId,
          userName: data.userName,
          createdAt: data.createdAt,
          published: data.published,
        };
        items.push(mapped);
      });
      setVehicles(items);
      setLoading(false);
    }, (error) => {
        console.error("Error fetching vehicles:", error);
        setLoading(false);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    const uid = favOf || user?.uid;
    if (!uid) {
      setFavoriteIds(new Set());
      setLikesRemaining(10);
      return;
    }
    const favRef = collection(db, "users", uid, "favorites");
    const unsub = onSnapshot(favRef, (snap) => {
      const ids = new Set<string>();
      snap.forEach((d) => {
        ids.add(d.id);
      });
      setFavoriteIds(ids);
      if (!favOf) {
        let todayCount = 0;
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        snap.forEach((d) => {
          const data = d.data() as any;
          const ts: Timestamp | undefined = data?.createdAt;
          if (ts && ts.toDate() >= start) {
            todayCount += 1;
          }
        });
        setLikesRemaining(Math.max(0, 10 - todayCount));
      }
    });
    return () => unsub();
  }, [user, favOf]);

  const toggleFavorite = async (vehicleId: string, vehicleOwnerId?: string) => {
    if (!user) {
      router.push("/login");
      return;
    }
    const ref = doc(db, "users", user.uid, "favorites", vehicleId);
    const vRef = doc(db, "vehicles", vehicleId);
    const isFav = favoriteIds.has(vehicleId);
    if (isFav) {
      await deleteDoc(ref);
      try {
        await updateDoc(vRef, { likedBy: arrayRemove(user.uid) });
      } catch (e) {
        Alert.alert("Error", "No se pudo actualizar los likes en la publicación.");
      }
    } else {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const favRef = collection(db, "users", user.uid, "favorites");
      const q = query(favRef, where("createdAt", ">=", Timestamp.fromDate(start)));
      const snap = await getDocs(q);
      if (snap.size >= 10) {
        Alert.alert("Límite diario", "Sólo podés dar hasta 10 likes por día.");
        return;
      }
      await setDoc(ref, { vehicleId, createdAt: serverTimestamp(), userId: user.uid, vehicleOwnerId: vehicleOwnerId ?? null });
      try {
        await updateDoc(vRef, { likedBy: arrayUnion(user.uid) });
      } catch (e) {
        Alert.alert("Error", "No se pudo actualizar los likes en la publicación.");
      }
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header />

      <View style={{ padding: 16, flex: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Publicaciones</Text>
          <TouchableOpacity onPress={() => user && router.push("/(screens)/add-car")} disabled={!user} style={{ backgroundColor: !user ? theme.textMuted : theme.accent, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, opacity: !user ? 0.7 : 1 }}>
            <Text style={{ color: theme.buttonText, fontWeight: "700" }}>Publicar</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Text style={{ color: theme.text, fontWeight: "700" }}>Filtros</Text>
          <TouchableOpacity onPress={() => setFiltersCollapsed((p) => !p)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: theme.likeBoxBackground, backgroundColor: theme.inputBackground, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ color: theme.text }}>{filtersCollapsed ? "Mostrar" : "Ocultar"}</Text>
            <Ionicons name={filtersCollapsed ? "chevron-down" : "chevron-up"} size={16} color={theme.text} />
          </TouchableOpacity>
        </View>
        <View style={{ gap: 8, marginBottom: 8 }}>
          {!filtersCollapsed && (
          <>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity onPress={async () => { await loadMakes(); setBrandOpen((p) => !p); }} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.inputBackground }}>
              <Text style={{ color: theme.inputText, fontWeight: brandFilter ? "700" : "400" }}>{brandFilter || "Marca"}</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={!brandFilter} onPress={async () => { if (!brandFilter) return; await loadModels(brandFilter); setModelOpen((p) => !p); }} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.inputBackground, opacity: brandFilter ? 1 : 0.6 }}>
              <Text style={{ color: theme.inputText, fontWeight: modelFilter ? "700" : "400" }}>{modelFilter || (brandFilter ? "Modelo" : "Elegí primero Marca")}</Text>
            </TouchableOpacity>
          </View>
          {brandOpen && (
            <View style={{ marginTop: 6, borderWidth: 1, borderColor: theme.likeBoxBackground, backgroundColor: theme.card, borderRadius: 10, height: 220, elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, zIndex: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, padding: 8 }}>
                <TouchableOpacity onPress={() => { setBrandFilter(""); setModelFilter(""); setModelsRemote([]); setBrandQuery(""); setBrandOpen(false); }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Limpiar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setBrandOpen(false)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
              <TextInput value={brandQuery} onChangeText={setBrandQuery} placeholder="Buscar marca" placeholderTextColor={theme.textMuted} style={{ paddingHorizontal: 12, paddingVertical: 10, color: theme.text }} />
              <ScrollView keyboardShouldPersistTaps="handled" style={{ height: 220 }}>
                {(makesRemote.length ? makesRemote : DEFAULT_MAKES)
                  .filter((m) => m.toLowerCase().includes(brandQuery.toLowerCase()))
                  .map((m) => (
                    <TouchableOpacity key={m} onPress={async () => { setBrandFilter(m); setModelFilter(""); await loadModels(m); setBrandOpen(false); setBrandQuery(""); }} style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: m === brandFilter ? `${theme.accent}22` : undefined }}>
                      <Text style={{ color: m === brandFilter ? theme.accent : theme.text }}>{m}</Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </View>
          )}
          {modelOpen && (
            <View style={{ marginTop: 6, borderWidth: 1, borderColor: theme.likeBoxBackground, backgroundColor: theme.card, borderRadius: 10, height: 220, elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, zIndex: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, padding: 8 }}>
                <TouchableOpacity onPress={() => { setModelFilter(""); setModelQuery(""); setModelOpen(false); }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Limpiar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setModelOpen(false)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
              <TextInput value={modelQuery} onChangeText={setModelQuery} placeholder="Buscar modelo" placeholderTextColor={theme.textMuted} style={{ paddingHorizontal: 12, paddingVertical: 10, color: theme.text }} />
              <ScrollView keyboardShouldPersistTaps="handled" style={{ height: 220 }}>
                {(modelsRemote.length ? modelsRemote : (DEFAULT_MODELS_BY_MAKE[brandFilter] || []))
                  .filter((mo) => mo.toLowerCase().includes(modelQuery.toLowerCase()))
                  .map((mo) => (
                    <TouchableOpacity key={mo} onPress={() => { setModelFilter(mo); setModelOpen(false); setModelQuery(""); }} style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: mo === modelFilter ? `${theme.accent}22` : undefined }}>
                      <Text style={{ color: mo === modelFilter ? theme.accent : theme.text }}>{mo}</Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity onPress={() => setYearMinOpen((p) => !p)} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.inputBackground }}>
              <Text style={{ color: theme.inputText, fontWeight: yearMin ? "700" : "400" }}>{yearMin ? `Año mín: ${yearMin}` : "Año mín"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setYearMaxOpen((p) => !p)} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.inputBackground }}>
              <Text style={{ color: theme.inputText, fontWeight: yearMax ? "700" : "400" }}>{yearMax ? `Año máx: ${yearMax}` : "Año máx"}</Text>
            </TouchableOpacity>
          </View>
          {yearMinOpen && (
            <View style={{ marginTop: 6, borderWidth: 1, borderColor: theme.likeBoxBackground, backgroundColor: theme.card, borderRadius: 10, height: 220, elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, zIndex: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, padding: 8 }}>
                <TouchableOpacity onPress={() => { setYearMin(""); setYearMinOpen(false); }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Limpiar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setYearMinOpen(false)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">
                {YEAR_OPTIONS.slice().reverse().map((yo) => (
                  <TouchableOpacity key={`ymin-${yo}`} onPress={() => { setYearMin(String(yo)); setYearMinOpen(false); }} style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: String(yo) === yearMin ? `${theme.accent}22` : undefined }}>
                    <Text style={{ color: String(yo) === yearMin ? theme.accent : theme.text }}>{yo}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          {yearMaxOpen && (
            <View style={{ marginTop: 6, borderWidth: 1, borderColor: theme.likeBoxBackground, backgroundColor: theme.card, borderRadius: 10, height: 220, elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, zIndex: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, padding: 8 }}>
                <TouchableOpacity onPress={() => { setYearMax(""); setYearMaxOpen(false); }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Limpiar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setYearMaxOpen(false)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">
                {YEAR_OPTIONS.map((yo) => (
                  <TouchableOpacity key={`ymax-${yo}`} onPress={() => { setYearMax(String(yo)); setYearMaxOpen(false); }} style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: String(yo) === yearMax ? `${theme.accent}22` : undefined }}>
                    <Text style={{ color: String(yo) === yearMax ? theme.accent : theme.text }}>{yo}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["ARS", "USD"] as const).map((cur) => {
              const active = filterCurrency === cur;
              return (
                <TouchableOpacity
                  key={cur}
                  onPress={() => {
                    if (active) { setFilterCurrency(undefined); setPriceMin(""); setPriceMax(""); }
                    else { setFilterCurrency(cur); setPriceMin(""); setPriceMax(""); }
                  }}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: active ? theme.accent : theme.likeBoxBackground, backgroundColor: active ? `${theme.accent}11` : theme.inputBackground, alignItems: "center" }}
                >
                  <Text style={{ color: active ? theme.accent : theme.text, fontWeight: "600" }}>{cur}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity disabled={!filterCurrency} onPress={() => setPriceMinOpen((p) => !p)} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.inputBackground, opacity: !filterCurrency ? 0.6 : 1 }}>
              <Text style={{ color: theme.inputText, fontWeight: priceMin ? "700" : "400" }}>{priceMin ? `Precio mín: ${Number(priceMin).toLocaleString("es-AR")} ${filterCurrency}` : (filterCurrency ? `Precio mín (${filterCurrency})` : "Precio mín (seleccionar moneda)")}</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={!filterCurrency} onPress={() => setPriceMaxOpen((p) => !p)} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.inputBackground, opacity: !filterCurrency ? 0.6 : 1 }}>
              <Text style={{ color: theme.inputText, fontWeight: priceMax ? "700" : "400" }}>{priceMax ? `Precio máx: ${Number(priceMax).toLocaleString("es-AR")} ${filterCurrency}` : (filterCurrency ? `Precio máx (${filterCurrency})` : "Precio máx (seleccionar moneda)")}</Text>
            </TouchableOpacity>
          </View>
          {priceMinOpen && (
            <View style={{ marginTop: 6, borderWidth: 1, borderColor: theme.likeBoxBackground, backgroundColor: theme.card, borderRadius: 10, height: 220, elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, zIndex: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, padding: 8 }}>
                <TouchableOpacity onPress={() => { setPriceMin(""); setPriceMinOpen(false); }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Limpiar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPriceMinOpen(false)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">
                {ACTIVE_PRICE_STEPS.map((ps) => (
                  <TouchableOpacity key={`pmin-${ps}`} onPress={() => { setPriceMin(String(ps)); setPriceMinOpen(false); }} style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: String(ps) === priceMin ? `${theme.accent}22` : undefined }}>
                    <Text style={{ color: String(ps) === priceMin ? theme.accent : theme.text }}>{ps.toLocaleString("es-AR")}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          {priceMaxOpen && (
            <View style={{ marginTop: 6, borderWidth: 1, borderColor: theme.likeBoxBackground, backgroundColor: theme.card, borderRadius: 10, height: 220, elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, zIndex: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, padding: 8 }}>
                <TouchableOpacity onPress={() => { setPriceMax(""); setPriceMaxOpen(false); }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Limpiar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPriceMaxOpen(false)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">
                {ACTIVE_PRICE_STEPS.map((ps) => (
                  <TouchableOpacity key={`pmax-${ps}`} onPress={() => { setPriceMax(String(ps)); setPriceMaxOpen(false); }} style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: String(ps) === priceMax ? `${theme.accent}22` : undefined }}>
                    <Text style={{ color: String(ps) === priceMax ? theme.accent : theme.text }}>{ps.toLocaleString("es-AR")}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity onPress={() => setKmMinOpen((p) => !p)} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.inputBackground }}>
              <Text style={{ color: theme.inputText, fontWeight: kmMin ? "700" : "400" }}>{kmMin ? `KM mín: ${Number(kmMin).toLocaleString("es-AR")}` : "KM mín"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setKmMaxOpen((p) => !p)} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.inputBackground }}>
              <Text style={{ color: theme.inputText, fontWeight: kmMax ? "700" : "400" }}>{kmMax ? `KM máx: ${Number(kmMax).toLocaleString("es-AR")}` : "KM máx"}</Text>
            </TouchableOpacity>
          </View>
          {kmMinOpen && (
            <View style={{ marginTop: 6, borderWidth: 1, borderColor: theme.likeBoxBackground, backgroundColor: theme.card, borderRadius: 10, height: 220, elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, zIndex: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, padding: 8 }}>
                <TouchableOpacity onPress={() => { setKmMin(""); setKmMinOpen(false); }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Limpiar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setKmMinOpen(false)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" style={{ height: 220 }}>
                {KM_STEPS.map((ks) => (
                  <TouchableOpacity key={`kmin-${ks}`} onPress={() => { setKmMin(String(ks)); setKmMinOpen(false); }} style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: String(ks) === kmMin ? `${theme.accent}22` : undefined }}>
                    <Text style={{ color: String(ks) === kmMin ? theme.accent : theme.text }}>{ks.toLocaleString("es-AR")}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          {kmMaxOpen && (
            <View style={{ marginTop: 6, borderWidth: 1, borderColor: theme.likeBoxBackground, backgroundColor: theme.card, borderRadius: 10, height: 220, elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, zIndex: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, padding: 8 }}>
                <TouchableOpacity onPress={() => { setKmMax(""); setKmMaxOpen(false); }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Limpiar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setKmMaxOpen(false)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" style={{ height: 220 }}>
                {KM_STEPS.map((ks) => (
                  <TouchableOpacity key={`kmax-${ks}`} onPress={() => { setKmMax(String(ks)); setKmMaxOpen(false); }} style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: String(ks) === kmMax ? `${theme.accent}22` : undefined }}>
                    <Text style={{ color: String(ks) === kmMax ? theme.accent : theme.text }}>{ks.toLocaleString("es-AR")}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          </>
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setProvinceOpen((p) => !p)}
              style={{
                flex: 1,
                borderWidth: provinceFilter ? 2 : 1,
                borderColor: provinceFilter ? theme.buttonBackground : theme.likeBoxBackground,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor: provinceFilter ? theme.buttonBackground : theme.badgeBackground,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                elevation: 2,
                shadowColor: "#000",
                shadowOpacity: 0.06,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 1 },
              }}
            >
              <Ionicons name="location-outline" size={16} color={provinceFilter ? theme.buttonText : theme.text} />
              <Text style={{ color: provinceFilter ? theme.buttonText : theme.text, fontWeight: "700", fontSize: 13, lineHeight: 16, flex: 1, flexShrink: 1, minWidth: 0 }} numberOfLines={1} ellipsizeMode="tail">{provinceFilter || "Localidad"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setFinancingOnly((p) => !p)}
              style={{
                flex: 1,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: financingOnly ? 2 : 1,
                borderColor: financingOnly ? theme.buttonBackground : theme.likeBoxBackground,
                backgroundColor: financingOnly ? theme.buttonBackground : theme.badgeBackground,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                elevation: 2,
                shadowColor: "#000",
                shadowOpacity: 0.06,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 1 },
              }}
            >
              <Ionicons name="cash-outline" size={16} color={financingOnly ? theme.buttonText : theme.text} />
              <Text style={{ color: financingOnly ? theme.buttonText : theme.text, fontWeight: "700", fontSize: 13, lineHeight: 16, flex: 1, flexShrink: 1, minWidth: 0 }} numberOfLines={1}>{financingOnly ? "Financia" : "No financia"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                setBrandFilter("");
                setModelFilter("");
                setYearMin("");
                setYearMax("");
                setPriceMin("");
                setPriceMax("");
                setKmMin("");
                setKmMax("");
                setProvinceFilter("");
                setFinancingOnly(false);
                setBrandOpen(false);
                setModelOpen(false);
                setProvinceOpen(false);
                setBrandQuery("");
                setModelQuery("");
                setProvinceQuery("");
                setMakesRemote([]);
                setModelsRemote([]);
                setFilterCurrency(undefined);
                setPriceMinOpen(false);
                setPriceMaxOpen(false);
                setYearMinOpen(false);
                setYearMaxOpen(false);
                setKmMinOpen(false);
                setKmMaxOpen(false);
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: theme.buttonBackground,
                borderWidth: 1,
                borderColor: theme.buttonBackground,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                elevation: 2,
                shadowColor: "#000",
                shadowOpacity: 0.06,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 1 },
              }}
            >
              <Ionicons name="refresh-outline" size={16} color={theme.buttonText} />
              <Text style={{ color: theme.buttonText, fontWeight: "700", fontSize: 13, lineHeight: 16 }}>Limpiar</Text>
            </TouchableOpacity>
          </View>
          {provinceOpen && (
            <View style={{ marginTop: 6, borderWidth: 1, borderColor: theme.likeBoxBackground, backgroundColor: theme.card, borderRadius: 10, height: 220, elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, zIndex: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, padding: 8 }}>
                <TouchableOpacity onPress={() => { setProvinceFilter(""); setProvinceQuery(""); setProvinceOpen(false); }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Limpiar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setProvinceOpen(false)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
              <TextInput value={provinceQuery} onChangeText={setProvinceQuery} placeholder="Buscar provincia" placeholderTextColor={theme.textMuted} style={{ paddingHorizontal: 12, paddingVertical: 10, color: theme.text }} />
              <ScrollView keyboardShouldPersistTaps="handled" style={{ height: 220 }}>
                {PROVINCES.filter((p) => p.toLowerCase().includes(provinceQuery.toLowerCase())).map((p) => (
                  <TouchableOpacity key={p} onPress={() => { setProvinceFilter(p); setProvinceOpen(false); setProvinceQuery(""); }} style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: p === provinceFilter ? `${theme.accent}22` : undefined }}>
                    <Text style={{ color: p === provinceFilter ? theme.accent : theme.text }}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
        {!favOf && (
          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 8 }}>
            <Text style={{ color: theme.textMuted }}>Te quedan {likesRemaining} likes hoy</Text>
          </View>
        )}
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          <FlatList data={filteredVehicles} keyExtractor={(item) => item.id} renderItem={({ item }) => (
            <CarCard
              vehicle={item}
              liked={favoriteIds.has(item.id)}
              likeDisabled={!favoriteIds.has(item.id) && likesRemaining <= 0}
              onToggleLike={() => toggleFavorite(item.id, item.userId)}
              onMessage={
                user && item.userId && user.uid === item.userId
                  ? undefined
                  : () => {
                      if (!user) {
                        router.push("/login");
                        return;
                      }
                      if (!item.userId) {
                        Alert.alert("Error", "No se puede contactar a este usuario.");
                        return;
                      }
                      router.push({
                        pathname: "/(screens)/chat/[uid]",
                        params: { uid: String(item.userId), name: item.userName || undefined },
                      });
                    }
              }
            />
          )} />
        )}
      </View>
    </SafeAreaView>
  );
}
