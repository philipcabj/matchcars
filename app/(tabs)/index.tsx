import { CarCard } from "@/components/cards/carcard";
import { CustomAlert } from "@/components/CustomAlert";
import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { sendNotificationEmail } from "@/lib/mail";
import type { Vehicle } from "@/types/vehicle";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, increment, onSnapshot, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as CarModelsAr from "../../config/carModelsAr";

export default function AutosPublicTab() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const owner = (params?.owner as string) || undefined;
  const favOf = (params?.favOf as string) || undefined;
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [userNamesCache, setUserNamesCache] = useState<Record<string, string>>({}); // New Cache State
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
  const [financingFilter, setFinancingFilter] = useState<"all" | "financed" | "not_financed">("all");
  const [fuelFilter, setFuelFilter] = useState("");
  const [fuelOpen, setFuelOpen] = useState(false);
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
  const [alertConfig, setAlertConfig] = useState({ 
    visible: false, 
    title: "", 
    message: "", 
    type: "info" as "success" | "error" | "info" | "warning",
    onClose: () => {}
  });

  const showAlert = (title: string, message: string, type: "success" | "error" | "info" | "warning" = "info", onClose = () => {}) => {
    setAlertConfig({ visible: true, title, message, type, onClose });
  };

  const closeAlert = () => {
    setAlertConfig(prev => ({ ...prev, visible: false }));
    if (alertConfig.onClose) alertConfig.onClose();
  };

  type CarArItem = { make: string; model: string };
  const RAW_CATALOG = (CarModelsAr as any)?.CAR_MODELS_AR;
  const MODELS_AR: CarArItem[] = Array.isArray(RAW_CATALOG) ? (RAW_CATALOG as CarArItem[]) : [];
  const DEFAULT_MAKES: string[] = MODELS_AR.length ? Array.from(new Set(MODELS_AR.map((x) => x.make))).sort() : [
    "Toyota","Volkswagen","Ford","Chevrolet","Peugeot","Renault","Fiat","Honda","Hyundai","Nissan"
  ];
  
  const combinedMakes = React.useMemo(() => {
    return Array.from(new Set([...DEFAULT_MAKES, ...makesRemote])).sort();
  }, [DEFAULT_MAKES, makesRemote]);

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
    const finMatch = financingFilter === "all" ? true : financingFilter === "financed" ? v.acceptsFinancing === true : v.acceptsFinancing !== true;
    const fuelMatch = !fuelFilter || (v.fuelType || (v as any).fuel || "").toLowerCase() === fuelFilter.toLowerCase();
    const currencyListMatch = !filterCurrency || v.currency === filterCurrency;
    
    // Exclude sold and unpublished vehicles from the public index
    // Note: If 'owner' or 'favOf' params are present, we might want different behavior, 
    // but generally sold cars shouldn't appear in the main feed.
    const statusMatch = v.status !== 'sold' && v.published !== false;

    return favMatch && ownerMatch && notMineMatch && brandMatch && modelMatch && provinceMatch && yearMatch && currencyListMatch && priceMatch && kmMatch && finMatch && fuelMatch && statusMatch;
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
      const local = DEFAULT_MODELS_BY_MAKE[make] || [];
      const combined = Array.from(new Set([...local, ...arr])).sort();
      setModelsRemote(combined);
    } catch {
      setModelsRemote(DEFAULT_MODELS_BY_MAKE[make] || []);
    }
  }

  useEffect(() => {
    // Solo mostrar vehículos publicados
    const ref = query(collection(db, "vehicles"), where("published", "==", true));
    const unsub = onSnapshot(ref, (snap) => {
      const items: Vehicle[] = [];
      const blockedUsers = profile?.blockedUsers || [];

      snap.forEach((doc) => {
        const data: any = doc.data();

        // Filter blocked users
        if (data.userId && blockedUsers.includes(data.userId)) {
          return;
        }

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
          fuelType: data.fuelType ?? data.fuel,
          acceptsFinancing: data.acceptsFinancing,
          gearbox: data.gearbox,
          isFeatured: data.isFeatured,
          userPlan: data.userPlan,
          status: data.status,
        };

        // Lazy expiration check (7 days) for non-dealers
        if (mapped.isFeatured && data.featuredAt && mapped.userPlan !== 'pro_dealer') {
          try {
             const featDate = data.featuredAt?.toDate ? data.featuredAt.toDate() : new Date(data.featuredAt);
             const now = new Date();
             const diffTime = Math.abs(now.getTime() - featDate.getTime());
             const diffDays = diffTime / (1000 * 60 * 60 * 24);
             
             if (diffDays > 7) {
               mapped.isFeatured = false;
               // Background update to cleanup DB
               updateDoc(doc.ref, { isFeatured: false }).catch(e => console.log("Auto-expire failed", e));
             }
          } catch (e) {
            console.log("Error checking expiration", e);
          }
        }

        items.push(mapped);
      });
      
      // Ordenamiento Avanzado: Boosts y Destacados
      const now = new Date();
      const isWeekend = now.getDay() === 0 || now.getDay() === 6; // 0=Sun, 6=Sat

      const getBoostScore = (v: Vehicle) => {
        let score = 0;
        
        // 1. Dealer siempre arriba (Destacado Ilimitado)
        if (v.userPlan === 'pro_dealer') score += 1000;
        
        // 2. Destacado normal (Pro Monthly / Plus con destacado activo)
        if (v.isFeatured && v.userPlan !== 'pro_dealer') score += 500;

        // 3. Weekend Boost (Pro Plus y Pro Dealer)
        if (isWeekend && (v.userPlan === 'pro_plus' || v.userPlan === 'pro_dealer')) score += 300;

        // 4. Boost Posicionamiento (Pro Plus > Pro Monthly)
        // Pro Plus debe tener mejor base que Monthly
        if (v.userPlan === 'pro_plus') score += 200;
        else if (v.userPlan === 'pro_monthly') score += 100;

        return score;
      };

      items.sort((a, b) => {
        const scoreA = getBoostScore(a);
        const scoreB = getBoostScore(b);

        if (scoreA !== scoreB) {
          return scoreB - scoreA; // Mayor score primero
        }

        // Si hay empate en score, fecha descendente
        const timeA = (a.createdAt as any)?.toMillis ? (a.createdAt as any).toMillis() : 0;
        const timeB = (b.createdAt as any)?.toMillis ? (b.createdAt as any).toMillis() : 0;
        return timeB - timeA;
      });

      setVehicles(items);
      setLoading(false);
    }, (error) => {
        console.error("Error fetching vehicles:", error);
        setLoading(false);
    });

    return () => unsub();
  }, [provinceFilter, brandFilter, modelFilter, yearMin, yearMax, priceMin, priceMax, kmMin, kmMax, financingFilter, fuelFilter, owner, favOf, filterCurrency, profile?.blockedUsers]);

    // Effect to fetch missing user names (if they look like emails)
    useEffect(() => {
        if (vehicles.length === 0) return;

        const idsToFetch = new Set<string>();
        vehicles.forEach(v => {
            // Fetch if userName is missing, contains '@', or is generic "Usuario"
            // Check cache first to avoid re-fetching.
            if ((!v.userName || v.userName.includes('@') || v.userName === 'Usuario') && v.userId && !userNamesCache[v.userId]) {
                idsToFetch.add(v.userId);
            }
        });

        if (idsToFetch.size === 0) return;

        const fetchNames = async () => {
            const newNames: Record<string, string> = {};
            
            const promises = Array.from(idsToFetch).map(async (uid) => {
                try {
                    const userDoc = await getDoc(doc(db, "users", uid));
                    if (userDoc.exists()) {
                        const u = userDoc.data();
                        // Prioritize First+Last Name, then DisplayName. 
                        // AVOID using email as fallback.
                        let fullName = "Usuario MatchCars";
                        
                        if (u.firstName && u.lastName) {
                            fullName = `${u.firstName} ${u.lastName}`.trim();
                        } else if (u.displayName) {
                            fullName = u.displayName;
                        } else if (u.firstName) {
                             fullName = u.firstName;
                        }
                        
                        newNames[uid] = fullName;
                    } else {
                         // User not found
                         newNames[uid] = "Usuario MatchCars";
                    }
                } catch (e) {
                    console.error(`Error fetching user ${uid}`, e);
                }
            });

            await Promise.all(promises);

            if (Object.keys(newNames).length > 0) {
                setUserNamesCache(prev => ({ ...prev, ...newNames }));
            }
        };

        fetchNames();
    }, [vehicles, userNamesCache]);

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
        await updateDoc(vRef, { 
          likedBy: arrayRemove(user.uid),
          likesCount: increment(-1) 
        });
      } catch (e) {
        // Fallback: si falla el decremento (ej. por ser negativo), intentamos solo actualizar la lista
        try {
          await updateDoc(vRef, { likedBy: arrayRemove(user.uid) });
        } catch (e2) {
          console.error("Error removing like from vehicle:", e2);
        }
      }
    } else {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const favRef = collection(db, "users", user.uid, "favorites");
      const q = query(favRef, where("createdAt", ">=", Timestamp.fromDate(start)));
      const snap = await getDocs(q);
      if (snap.size >= 10) {
        showAlert("Límite diario", "Sólo podés dar hasta 10 likes por día.", "warning");
        return;
      }
      await setDoc(ref, { vehicleId, createdAt: serverTimestamp(), userId: user.uid, vehicleOwnerId: vehicleOwnerId ?? null });
      try {
        await updateDoc(vRef, { 
          likedBy: arrayUnion(user.uid),
          likesCount: increment(1)
        });
      } catch (e) {
        // Fallback
        try {
          await updateDoc(vRef, { likedBy: arrayUnion(user.uid) });
        } catch (e2) {
          console.error("Error adding like to vehicle:", e2);
        }
      }

      // Send Notification Email
      if (vehicleOwnerId && vehicleOwnerId !== user.uid) {
        try {
           const vSnap = await getDoc(vRef);
           const vData = vSnap.data() as any;
           const carModel = `${vData?.brand || ""} ${vData?.model || ""}`.trim();
   
           const myVehiclesRef = query(
               collection(db, "vehicles"), 
               where("userId", "==", user.uid), 
               where("likedBy", "array-contains", vehicleOwnerId)
           );
           const matchSnap = await getDocs(myVehiclesRef);
           const isMatch = !matchSnap.empty;
   
           const myName = (user.displayName || (user.email?.split('@')[0] ?? "Usuario")).trim();
           
           await sendNotificationEmail(isMatch ? "match" : "like", {
               recipientUid: vehicleOwnerId,
               senderName: myName,
               senderUid: user.uid,
               subject: isMatch ? `¡Tenés un nuevo Match con ${myName}!` : `¡A ${myName} le gustó tu auto!`,
               carModel: carModel
           });
        } catch (err) {
           console.error("Error sending notification:", err);
        }
      }
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header />

      <View style={{ paddingHorizontal: 16, paddingTop: 4, flex: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>Publicaciones</Text>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TouchableOpacity onPress={() => setFiltersCollapsed((p) => !p)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: theme.likeBoxBackground, backgroundColor: theme.inputBackground, flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ color: theme.text, fontSize: 12 }}>{filtersCollapsed ? "Filtrar" : "Cerrar"}</Text>
              <Ionicons name={filtersCollapsed ? "chevron-down" : "chevron-up"} size={12} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => user && router.push("/(screens)/add-car")} disabled={!user} style={{ backgroundColor: !user ? theme.textMuted : theme.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, opacity: !user ? 0.7 : 1 }}>
              <Text style={{ color: theme.buttonText, fontWeight: "700", fontSize: 12 }}>Publicar</Text>
            </TouchableOpacity>
          </View>
        </View>
        {!filtersCollapsed && (
        <View style={{ gap: 6, marginBottom: 6 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TouchableOpacity onPress={async () => { await loadMakes(); setBrandOpen((p) => !p); }} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: theme.inputBackground }}>
              <Text style={{ color: theme.inputText, fontWeight: brandFilter ? "700" : "400", fontSize: 13 }}>{brandFilter || "Marca"}</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={!brandFilter} onPress={async () => { if (!brandFilter) return; await loadModels(brandFilter); setModelOpen((p) => !p); }} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: theme.inputBackground, opacity: brandFilter ? 1 : 0.6 }}>
              <Text style={{ color: theme.inputText, fontWeight: modelFilter ? "700" : "400", fontSize: 13 }}>{modelFilter || (brandFilter ? "Modelo" : "Elegí primero Marca")}</Text>
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
                {combinedMakes
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
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TouchableOpacity onPress={() => setYearMinOpen((p) => !p)} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: theme.inputBackground }}>
              <Text style={{ color: theme.inputText, fontWeight: yearMin ? "700" : "400", fontSize: 13 }}>{yearMin ? `Año mín: ${yearMin}` : "Año mín"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setYearMaxOpen((p) => !p)} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: theme.inputBackground }}>
              <Text style={{ color: theme.inputText, fontWeight: yearMax ? "700" : "400", fontSize: 13 }}>{yearMax ? `Año máx: ${yearMax}` : "Año máx"}</Text>
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
          <View style={{ flexDirection: "row", gap: 6 }}>
            {(["ARS", "USD"] as const).map((cur) => {
              const active = filterCurrency === cur;
              return (
                <TouchableOpacity
                  key={cur}
                  onPress={() => {
                    if (active) { setFilterCurrency(undefined); setPriceMin(""); setPriceMax(""); }
                    else { setFilterCurrency(cur); setPriceMin(""); setPriceMax(""); }
                  }}
                  style={{ flex: 1, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: active ? theme.accent : theme.likeBoxBackground, backgroundColor: active ? `${theme.accent}11` : theme.inputBackground, alignItems: "center" }}
                >
                  <Text style={{ color: active ? theme.accent : theme.text, fontWeight: "600", fontSize: 12 }}>{cur}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TouchableOpacity disabled={!filterCurrency} onPress={() => setPriceMinOpen((p) => !p)} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: theme.inputBackground, opacity: !filterCurrency ? 0.6 : 1 }}>
              <Text style={{ color: theme.inputText, fontWeight: priceMin ? "700" : "400", fontSize: 13 }}>{priceMin ? `Precio mín: ${Number(priceMin).toLocaleString("es-AR")} ${filterCurrency}` : (filterCurrency ? `Precio mín (${filterCurrency})` : "Precio mín")}</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={!filterCurrency} onPress={() => setPriceMaxOpen((p) => !p)} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: theme.inputBackground, opacity: !filterCurrency ? 0.6 : 1 }}>
              <Text style={{ color: theme.inputText, fontWeight: priceMax ? "700" : "400", fontSize: 13 }}>{priceMax ? `Precio máx: ${Number(priceMax).toLocaleString("es-AR")} ${filterCurrency}` : (filterCurrency ? `Precio máx (${filterCurrency})` : "Precio máx")}</Text>
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
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TouchableOpacity onPress={() => setKmMinOpen((p) => !p)} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: theme.inputBackground }}>
              <Text style={{ color: theme.inputText, fontWeight: kmMin ? "700" : "400", fontSize: 13 }}>{kmMin ? `KM mín: ${Number(kmMin).toLocaleString("es-AR")}` : "KM mín"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setKmMaxOpen((p) => !p)} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: theme.inputBackground }}>
              <Text style={{ color: theme.inputText, fontWeight: kmMax ? "700" : "400", fontSize: 13 }}>{kmMax ? `KM máx: ${Number(kmMax).toLocaleString("es-AR")}` : "KM máx"}</Text>
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
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TouchableOpacity onPress={() => setFuelOpen((p) => !p)} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: theme.inputBackground }}>
              <Text style={{ color: theme.inputText, fontWeight: fuelFilter ? "700" : "400", fontSize: 13 }}>{fuelFilter || "Combustible"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setProvinceOpen((p) => !p)} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: theme.inputBackground }}>
               <Text style={{ color: theme.inputText, fontWeight: provinceFilter ? "700" : "400", fontSize: 13 }} numberOfLines={1}>{provinceFilter || "Provincia"}</Text>
            </TouchableOpacity>
          </View>

          {fuelOpen && (
             <View style={{ marginTop: 6, borderWidth: 1, borderColor: theme.likeBoxBackground, backgroundColor: theme.card, borderRadius: 10, height: 180, elevation: 4, zIndex: 10 }}>
               <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, padding: 8 }}>
                <TouchableOpacity onPress={() => { setFuelFilter(""); setFuelOpen(false); }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Limpiar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setFuelOpen(false)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.text }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">
                {["Nafta", "Diésel", "Híbrido", "Eléctrico", "GNC"].map((f) => (
                  <TouchableOpacity key={f} onPress={() => { setFuelFilter(f); setFuelOpen(false); }} style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: f === fuelFilter ? `${theme.accent}22` : undefined }}>
                    <Text style={{ color: f === fuelFilter ? theme.accent : theme.text }}>{f}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
             </View>
          )}

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

          <View style={{ marginTop: 6 }}>
            <Text style={{ color: theme.text, marginBottom: 2, fontSize: 12, fontWeight: "600" }}>Financiación</Text>
            <View style={{ flexDirection: "row", backgroundColor: theme.inputBackground, borderRadius: 8, padding: 2 }}>
               {[{l:"Todos", v:"all"}, {l:"Financia", v:"financed"}, {l:"No financia", v:"not_financed"}].map(opt => (
                  <TouchableOpacity 
                    key={opt.v} 
                    onPress={() => setFinancingFilter(opt.v as any)}
                    style={{ flex: 1, paddingVertical: 4, alignItems: "center", borderRadius: 6, backgroundColor: financingFilter === opt.v ? theme.card : "transparent", shadowOpacity: financingFilter === opt.v ? 0.1 : 0 }}
                  >
                     <Text style={{ color: financingFilter === opt.v ? theme.text : theme.textMuted, fontWeight: financingFilter === opt.v ? "700" : "400", fontSize: 12 }}>{opt.l}</Text>
                  </TouchableOpacity>
               ))}
            </View>
          </View>

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
                setFinancingFilter("all");
                setFuelFilter("");
                setBrandOpen(false);
                setModelOpen(false);
                setProvinceOpen(false);
                setFuelOpen(false);
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
                marginTop: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: theme.buttonBackground,
                borderWidth: 1,
                borderColor: theme.buttonBackground,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <Ionicons name="refresh-outline" size={14} color={theme.buttonText} />
              <Text style={{ color: theme.buttonText, fontWeight: "700", fontSize: 13 }}>Limpiar filtros</Text>
            </TouchableOpacity>
        </View>
        )}
        {!favOf && (
          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 6 }}>
            <Text style={{ color: theme.textMuted, fontSize: 11 }}>Te quedan {likesRemaining} likes hoy</Text>
          </View>
        )}
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          <FlatList data={filteredVehicles} keyExtractor={(item) => item.id} renderItem={({ item }) => (
            <CarCard
              vehicle={{ ...item, userName: (item.userId && userNamesCache[item.userId]) ? userNamesCache[item.userId] : item.userName }}
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
                        showAlert("Error", "No se puede contactar a este usuario.", "error");
                        return;
                      }
                      const vehicleData = {
                        id: item.id,
                        brand: item.brand,
                        model: item.model,
                        year: item.year,
                        price: item.price,
                        currency: item.currency,
                        cover: (item as any).images?.cover ?? item.coverImage ?? (item as any).cover ?? ""
                      };

                      router.push({
                        pathname: "/(screens)/chat/[uid]",
                        params: { 
                          uid: String(item.userId), 
                          name: item.userName || undefined,
                          vehicleId: item.id,
                          vehicleData: JSON.stringify(vehicleData)
                        },
                      });
                    }
              }
            />
          )} />
        )}

        <CustomAlert 
          visible={alertConfig.visible}
          title={alertConfig.title}
          message={alertConfig.message}
          type={alertConfig.type}
          onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
        />
      </View>
    </SafeAreaView>
  );
}
