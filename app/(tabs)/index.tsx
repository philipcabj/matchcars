import { BuyerPreferencesModal } from "@/components/BuyerPreferencesModal";
import { CarCard } from "@/components/cards/carcard";
import { CustomAlert } from "@/components/CustomAlert";
import { DownloadAppBanner } from "@/components/DownloadAppBanner";
import { Header } from "@/components/Header";
import { Onboarding } from "@/components/Onboarding";
import { SkeletonList } from "@/components/SkeletonLoader";
import { WebContainer } from "@/components/WebContainer";
import { useAuth } from "@/contexts/AuthContext";
import { useHistory } from "@/contexts/HistoryContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useDebounce } from "@/hooks/useDebounce";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { calcMatchScore } from "@/lib/matchScore";
import { sendNotificationEmail } from "@/lib/mail";
import { getBoostScoreMultiplier, hasUnlimitedFeatured, hasWeekendBoost, isDealerPlan } from "@/lib/planChecks";
import { getListingYears } from "@/lib/pricing";
import type { BuyerPreferences } from "@/types/user";
import type { Vehicle } from "@/types/vehicle";
import { safeDate } from "@/utils/dateUtils";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadVehiclesCache, saveVehiclesCache } from "@/lib/offlineCache";
import { useLocalSearchParams, useRouter } from "expo-router";
import { DocumentSnapshot, arrayRemove, arrayUnion, collection, deleteDoc, doc, documentId, getDoc, getDocs, increment, limit, onSnapshot, query, serverTimestamp, setDoc, startAfter, Timestamp, updateDoc, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Platform, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as CarModelsAr from "../../config/carModelsAr";
import { PROVINCES } from "@/config/locations";

export default function AutosPublicTab() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const owner = (params?.owner as string) || undefined;
  const favOf = (params?.favOf as string) || undefined;
  const { user, profile } = useAuth();
  const { viewedIds } = useHistory();
  const [buyerPrefs, setBuyerPrefs] = useState<BuyerPreferences | undefined>(undefined);
  const [showPrefsModal, setShowPrefsModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
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
  
  // Debounced search queries for better performance
  const debouncedBrandQuery = useDebounce(brandQuery, 300);
  const debouncedModelQuery = useDebounce(modelQuery, 300);
  
  const [makesRemote, setMakesRemote] = useState<string[]>([]);
  const [modelsRemote, setModelsRemote] = useState<string[]>([]);
  const [provinceOpen, setProvinceOpen] = useState(false);
  const [provinceQuery, setProvinceQuery] = useState("");
  const [yearMinOpen, setYearMinOpen] = useState(false);
  const [yearMaxOpen, setYearMaxOpen] = useState(false);
  // Years that currently have an active listing (scoped to the selected brand/model, if any),
  // so the year filter doesn't offer years with nothing to find. Falls back to the generic
  // 40-year range while loading or if the lookup comes back empty.
  const [yearFilterOptions, setYearFilterOptions] = useState<number[] | null>(null);
  const [yearFilterLoading, setYearFilterLoading] = useState(false);
  const [priceMinOpen, setPriceMinOpen] = useState(false);
  const [priceMaxOpen, setPriceMaxOpen] = useState(false);
  const [kmMinOpen, setKmMinOpen] = useState(false);
  const [kmMaxOpen, setKmMaxOpen] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [filterCurrency, setFilterCurrency] = useState<"ARS" | "USD" | undefined>(undefined);
  
  // Persistence for Filters
  const STORAGE_KEY_FILTERS = `matchcars_filters_${user?.uid || 'guest'}`;

  const saveFilters = async (filters: any) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_FILTERS, JSON.stringify(filters));
    } catch (e) {
      console.error("Error saving filters:", e);
    }
  };

  const loadSavedFilters = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY_FILTERS);
      if (saved) {
        const f = JSON.parse(saved);
        if (f.province) setProvinceFilter(f.province);
        if (f.brand) {
            setBrandFilter(f.brand);
            loadModels(f.brand);
        }
        if (f.model) setModelFilter(f.model);
        if (f.yearMin) setYearMin(f.yearMin);
        if (f.yearMax) setYearMax(f.yearMax);
        if (f.priceMin) setPriceMin(f.priceMin);
        if (f.priceMax) setPriceMax(f.priceMax);
        if (f.kmMin) setKmMin(f.kmMin);
        if (f.kmMax) setKmMax(f.kmMax);
        if (f.financing) setFinancingFilter(f.financing);
        if (f.fuel) setFuelFilter(f.fuel);
        if (f.currency) setFilterCurrency(f.currency);
        
        // If any filter is active, expand the filter section
        const hasFilters = Object.values(f).some(v => v !== "" && v !== "all" && v !== undefined);
        if (hasFilters) setFiltersCollapsed(false);
      }
    } catch (e) {
      console.error("Error loading filters:", e);
    }
  };

  const clearFilters = async () => {
    setProvinceFilter("");
    setBrandFilter("");
    setModelFilter("");
    setYearMin("");
    setYearMax("");
    setPriceMin("");
    setPriceMax("");
    setKmMin("");
    setKmMax("");
    setFinancingFilter("all");
    setFuelFilter("");
    setFilterCurrency(undefined);
    setModelsRemote([]);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY_FILTERS);
    } catch (e) {
      console.error("Error clearing filters:", e);
    }
  };

  // Effect to load filters on mount
  useEffect(() => {
    loadSavedFilters();
  }, [user?.uid]);

  // Seed UI from cache while Firestore loads (stale-while-revalidate)
  useEffect(() => {
    loadVehiclesCache().then((cached) => {
      if (cached && cached.length > 0) {
        setVehicles(cached);
        setLoading(false);
      }
    });
  }, []);

  const activeFilterCount = [
    provinceFilter !== "",
    brandFilter !== "",
    modelFilter !== "",
    yearMin !== "" || yearMax !== "",
    priceMin !== "" || priceMax !== "",
    kmMin !== "" || kmMax !== "",
    fuelFilter !== "",
    filterCurrency !== undefined,
    financingFilter !== "all",
  ].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;

  // Effect to save filters whenever they change
  useEffect(() => {
    const timer = setTimeout(() => {
      const currentFilters = {
        province: provinceFilter,
        brand: brandFilter,
        model: modelFilter,
        yearMin,
        yearMax,
        priceMin,
        priceMax,
        kmMin,
        kmMax,
        financing: financingFilter,
        fuel: fuelFilter,
        currency: filterCurrency,
      };
      saveFilters(currentFilters);
    }, 1000); // Debounce save
    return () => clearTimeout(timer);
  }, [provinceFilter, brandFilter, modelFilter, yearMin, yearMax, priceMin, priceMax, kmMin, kmMax, financingFilter, fuelFilter, filterCurrency]);

  // Reset onboarding cuando el usuario inicia sesión si es necesario.

  const [refreshing, setRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [recentVehicles, setRecentVehicles] = useState<Vehicle[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [hideHomeRecently, setHideHomeRecently] = useState<boolean>(!!profile?.hideHomeRecentlyViewed);

  // Sync buyer preferences from profile
  useEffect(() => {
    if (profile?.buyerPreferences) {
      setBuyerPrefs(profile.buyerPreferences);
    }
  }, [profile?.buyerPreferences]);

  // Auto-show preferences modal once for logged-in users without preferences
  useEffect(() => {
    if (!user || profile?.buyerPreferences) return;
    const key = `matchcars_prefs_seen_${user.uid}`;
    AsyncStorage.getItem(key).then((val) => {
      if (!val) {
        setShowPrefsModal(true);
        AsyncStorage.setItem(key, "1").catch(() => {});
      }
    }).catch(() => {});
  }, [user, profile?.buyerPreferences]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
        await loadMakes();
        if (brandFilter) await loadModels(brandFilter);
        setRefreshTrigger(t => t + 1);
    } catch (e) {
        console.error(e);
    } finally {
        setRefreshing(false);
    }
  }, [brandFilter]);

  const loadMore = React.useCallback(async () => {
    if (loadingMore || !hasMore || !lastDoc) return;
    setLoadingMore(true);
    try {
      const PAGE_SIZE = 20;
      const q = query(
        collection(db, "vehicles"),
        where("published", "==", true),
        startAfter(lastDoc),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      const blockedUsers = profile?.blockedUsers || [];
      const now = new Date();
      const isWeekend = now.getDay() === 0 || now.getDay() === 6;
      const newItems: Vehicle[] = [];

      snap.forEach((docSnap) => {
        const data: any = docSnap.data();
        if (data.userId && blockedUsers.includes(data.userId)) return;
        const mapped: Vehicle = {
          id: docSnap.id,
          brand: data.brand, model: data.model, version: data.version ?? undefined,
          year: data.year, price: data.price, currency: data.currency, km: data.km,
          coverImage: data.coverImage ?? data.images?.cover ?? undefined,
          additionalImages: data.additionalImages ?? data.images?.gallery ?? undefined,
          city: data.location?.city ?? data.city,
          province: data.location?.province ?? data.province,
          location: data.location ? { latitude: data.location.latitude, longitude: data.location.longitude, address: data.location.address, city: data.location.city, province: data.location.province } : undefined,
          userId: data.userId, userName: data.userName, createdAt: data.createdAt,
          published: data.published, fuelType: data.fuelType ?? data.fuel,
          acceptsFinancing: data.acceptsFinancing, financing: data.financing ?? undefined,
          gearbox: data.gearbox, isFeatured: data.isFeatured, userPlan: data.userPlan,
          status: data.status, sellerRating: data.sellerRating,
          sellerReviewCount: data.sellerReviewCount, sellerTrustLevel: data.sellerTrustLevel,
        };
        newItems.push(mapped);
      });

      setVehicles(prev => {
        const existingIds = new Set(prev.map(v => v.id));
        const merged = [...prev, ...newItems.filter(v => !existingIds.has(v.id))];
        // Re-sort entire list by boost score
        return merged.sort((a, b) => {
          const score = (v: Vehicle) => {
            let s = getBoostScoreMultiplier(v.userPlan ?? "");
            if (v.isFeatured && !hasUnlimitedFeatured(v.userPlan ?? "")) s += 500;
            if (isWeekend && hasWeekendBoost(v.userPlan ?? "")) s += 300;
            return s;
          };
          const diff = score(b) - score(a);
          if (diff !== 0) return diff;
          const tA = (a.createdAt as any)?.toMillis?.() ?? 0;
          const tB = (b.createdAt as any)?.toMillis?.() ?? 0;
          return tB - tA;
        });
      });
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error("Error loading more vehicles:", e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, lastDoc, profile?.blockedUsers]);

  useEffect(() => {
    const fetchRecentVehicles = async () => {
      if (!viewedIds || viewedIds.length === 0) {
        setRecentVehicles([]);
        return;
      }
      try {
        setRecentLoading(true);
        const ids = viewedIds.slice(0, 3);
        const q = query(
          collection(db, "vehicles"),
          where(documentId(), "in", ids)
        );
        const snap = await getDocs(q);
        const allDocs: any[] = [];
        snap.forEach((d) => allDocs.push({ id: d.id, ...d.data() }));
        const sorted = ids
          .map((id) => allDocs.find((v) => v.id === id))
          .filter((v) => v !== undefined) as Vehicle[];
        setRecentVehicles(sorted);
      } catch (e) {
        console.error(e);
        setRecentVehicles([]);
      } finally {
        setRecentLoading(false);
      }
    };
    fetchRecentVehicles();
  }, [viewedIds]);
  
  useEffect(() => {
    setHideHomeRecently(!!profile?.hideHomeRecentlyViewed);
  }, [profile?.hideHomeRecentlyViewed]);

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

  const handleHideHomeRecently = async () => {
    if (!user) return;
    setHideHomeRecently(true);
    try {
      await updateDoc(doc(db, "users", user.uid), { hideHomeRecentlyViewed: true });
    } catch (e) {
      console.error(e);
      setHideHomeRecently(false);
    }
  };

  const handleShowHomeRecently = async () => {
    if (!user) return;
    setHideHomeRecently(false);
    try {
      await updateDoc(doc(db, "users", user.uid), { hideHomeRecentlyViewed: false });
    } catch (e) {
      console.error(e);
      setHideHomeRecently(true);
    }
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
    const statusMatch = v.status !== 'sold' && v.status !== 'deleted' && v.status !== 'blocked' && v.status !== 'rejected' && v.published !== false;

    return favMatch && ownerMatch && notMineMatch && brandMatch && modelMatch && provinceMatch && yearMatch && currencyListMatch && priceMatch && kmMatch && finMatch && fuelMatch && statusMatch;
  });

  // Auto-load more pages when active filters produce fewer than PAGE_SIZE results
  const PAGE_SIZE_CONST = 20;
  React.useEffect(() => {
    if (!loading && !loadingMore && hasMore && filteredVehicles.length < PAGE_SIZE_CONST) {
      loadMore();
    }
  }, [filteredVehicles.length, hasMore, loading, loadingMore]);

  async function loadMakes() {
    try {
      const snap = await getDocs(collection(db, "catalog", "default", "makes"));
      const arr: string[] = [];
      if (snap && (snap as any).forEach) {
        snap.forEach((d) => {
          const data = d.data() as any;
          const name = data?.name || d.id;
          if (name) arr.push(name);
        });
      }
      setMakesRemote(arr);
    } catch {
      setMakesRemote([]);
    }
  }

  async function loadModels(make: string) {
    try {
      const snap = await getDocs(collection(db, "catalog", "default", "makes", make, "models"));
      const arr: string[] = [];
      if (snap && (snap as any).forEach) {
        snap.forEach((d) => {
          const data = d.data() as any;
          const name = data?.name || d.id;
          if (name) arr.push(name);
        });
      }
      const local = DEFAULT_MODELS_BY_MAKE[make] || [];
      const combined = Array.from(new Set([...local, ...arr])).sort();
      setModelsRemote(combined);
    } catch {
      setModelsRemote(DEFAULT_MODELS_BY_MAKE[make] || []);
    }
  }

  async function loadYearFilterOptions() {
    setYearFilterLoading(true);
    try {
      const years = await getListingYears(brandFilter || undefined, modelFilter || undefined);
      setYearFilterOptions(years.length > 0 ? years : null);
    } catch {
      setYearFilterOptions(null);
    } finally {
      setYearFilterLoading(false);
    }
  }

  useEffect(() => {
    const PAGE_SIZE = 20;
    setVehicles([]);
    setLastDoc(null);
    setHasMore(true);

    const ref = query(
      collection(db, "vehicles"),
      where("published", "==", true),
      limit(PAGE_SIZE)
    );
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
          financing: data.financing ?? undefined,
          gearbox: data.gearbox,
          isFeatured: data.isFeatured,
          userPlan: data.userPlan,
          status: data.status,
          sellerRating: data.sellerRating,
          sellerReviewCount: data.sellerReviewCount,
          sellerTrustLevel: data.sellerTrustLevel,
        };

        // Lazy expiration check (7 days) for non-dealers
        if (mapped.isFeatured && data.featuredAt && !hasUnlimitedFeatured(mapped.userPlan ?? "")) {
          try {
             const featDate = safeDate(data.featuredAt);
             if (featDate) {
                 const now = new Date();
                 const diffTime = Math.abs(now.getTime() - featDate.getTime());
                 const diffDays = diffTime / (1000 * 60 * 60 * 24);
                 
                 if (diffDays > 7) {
                   mapped.isFeatured = false;
                   // Background update to cleanup DB
                   updateDoc(doc.ref, { isFeatured: false }).catch(e => logger.log("Auto-expire failed", e));
                 }
             }
          } catch (e) {
            logger.log("Error checking expiration", e);
          }
        }

        items.push(mapped);
      });
      
      // Ordenamiento Avanzado: Boosts y Destacados
      const now = new Date();
      const isWeekend = now.getDay() === 0 || now.getDay() === 6; // 0=Sun, 6=Sat

      const getBoostScore = (v: Vehicle) => {
        let score = 0;
        
        // Base boost from plan
        score += getBoostScoreMultiplier(v.userPlan ?? "");

        if (v.isFeatured && !hasUnlimitedFeatured(v.userPlan ?? "")) {
          score += 500;
        }

        if (isWeekend && hasWeekendBoost(v.userPlan ?? "")) {
          score += 300;
        }

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
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
      setLoading(false);
      setIsOffline(false);
      saveVehiclesCache(items);
    }, (error) => {
        console.error("Error fetching vehicles:", error);
        setIsOffline(true);
        setLoading(false);
    });

    return () => unsub();
  }, [provinceFilter, brandFilter, modelFilter, yearMin, yearMax, priceMin, priceMax, kmMin, kmMax, financingFilter, fuelFilter, owner, favOf, filterCurrency, profile?.blockedUsers, refreshTrigger]);

    // Effect to fetch missing user names (if they look like emails)
    useEffect(() => {
        if (vehicles.length === 0) return;

        const idsToFetch = new Set<string>();
        vehicles.forEach(v => {
            if (!v.userId || userNamesCache[v.userId]) return;
            // Always fetch for dealer plans to resolve agencyName
            if (isDealerPlan(v.userPlan ?? "")) {
                idsToFetch.add(v.userId);
                return;
            }
            // For regular users fetch only if userName is missing, looks like email, or is generic
            if (!v.userName || v.userName.includes('@') || v.userName === 'Usuario') {
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
                        let fullName = "Usuario MatchCars";
                        // Agency name takes priority for dealer plans
                        if (u.agencyName) {
                            fullName = u.agencyName;
                        } else if (u.firstName && u.lastName) {
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
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}>
      <WebContainer>
      <Header />
      {Platform.OS === 'web' && <DownloadAppBanner floating />}

      {Platform.OS === 'web' && (
        <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
          <TouchableOpacity
            onPress={() => router.push("/(screens)/agencias" as any)}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.border }}
            activeOpacity={0.8}
          >
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="business" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13 }}>Agencias</Text>
              <Text style={{ color: theme.textMuted, fontSize: 11 }}>Concesionarias verificadas</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/(screens)/tasador" as any)}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.border }}
            activeOpacity={0.8}
          >
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#8B5CF6", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="calculator-outline" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13 }}>¿Cuánto vale tu auto?</Text>
              <Text style={{ color: theme.textMuted, fontSize: 11 }}>Estimación de precio gratis</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#8B5CF6" />
          </TouchableOpacity>
        </View>
      )}

      <View style={{ paddingHorizontal: 16, paddingTop: 4, flex: 1 }}>
        {Platform.OS !== "web" && !hideHomeRecently && recentVehicles.length > 0 && (
          <View style={{ marginBottom: 10, backgroundColor: "#1f2937", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Text style={{ color: "#F9FAFB", fontSize: 13, fontWeight: "700" }}>Seguí viendo</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <TouchableOpacity onPress={() => router.push("/(screens)/recently-viewed")}>
                  <Text style={{ color: theme.accent, fontSize: 11, fontWeight: "600" }}>Ver todos</Text>
                </TouchableOpacity>
                {user && (
                  <TouchableOpacity onPress={handleHideHomeRecently}>
                    <Text style={{ color: "#9CA3AF", fontSize: 10 }}>Ocultar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            {recentLoading && recentVehicles.length === 0 ? (
              <ActivityIndicator color={theme.accent} size="small" />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {recentVehicles
                  .filter((v) => {
                    const s = (v as any).status;
                    const p = (v as any).published;
                    return !["sold","pending","pending_review","rejected","blocked","deleted"].includes(s) && p !== false;
                  })
                  .map((v) => (
                    <TouchableOpacity
                      key={v.id}
                      style={{ width: 95, borderRadius: 8, borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.card, overflow: "hidden" }}
                      activeOpacity={0.9}
                      onPress={() => router.push(`/car/${v.id}`)}
                    >
                      <View style={{ width: "100%", height: 52, backgroundColor: "#f0f0f0" }}>
                        {(() => {
                          const anyV: any = v as any;
                          const rawImage = v.coverImage || anyV.images?.cover || anyV.images?.gallery?.[0] || (Array.isArray(anyV.images) ? anyV.images[0] : null);
                          return rawImage
                            ? <Image source={{ uri: rawImage }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                            : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Ionicons name="car-sport-outline" size={20} color={theme.textMuted} /></View>;
                        })()}
                      </View>
                      <View style={{ paddingHorizontal: 5, paddingVertical: 3 }}>
                        <Text style={{ color: theme.text, fontSize: 9, fontWeight: "700" }} numberOfLines={1}>{(v.brand ?? "") + " " + (v.model ?? "")}</Text>
                        <Text style={{ color: theme.price, fontSize: 9, fontWeight: "700", marginTop: 2 }} numberOfLines={1}>
                          {v.price != null && v.currency ? `${v.currency} ${v.price.toLocaleString("es-AR")}` : "Consultar"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            )}
          </View>
        )}
        {Platform.OS !== "web" && hideHomeRecently && recentVehicles.length > 0 && user && (
          <View style={{ marginBottom: 16 }}>
            <TouchableOpacity
              onPress={handleShowHomeRecently}
              style={{
                alignSelf: "flex-start",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "#1f2937",
                backgroundColor: "#1f2937",
              }}
            >
              <Text style={{ color: "#E5E7EB", fontSize: 11, fontWeight: "500" }}>
                Volver a mostrar «Seguí viendo»
              </Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>Publicaciones</Text>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TouchableOpacity onPress={() => setFiltersCollapsed((p) => !p)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: hasActiveFilters ? theme.accent : theme.likeBoxBackground, backgroundColor: hasActiveFilters ? `${theme.accent}15` : theme.inputBackground, flexDirection: "row", alignItems: "center", gap: 4 }}>
              {hasActiveFilters && (
                <View style={{ minWidth: 16, height: 16, borderRadius: 8, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, marginRight: 2 }}>
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{activeFilterCount}</Text>
                </View>
              )}
              <Text style={{ color: hasActiveFilters ? theme.accent : theme.text, fontSize: 12, fontWeight: hasActiveFilters ? "700" : "400" }}>{filtersCollapsed ? "Filtrar" : "Cerrar"}</Text>
              <Ionicons name={filtersCollapsed ? "chevron-down" : "chevron-up"} size={12} color={hasActiveFilters ? theme.accent : theme.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => user && router.push("/(screens)/add-car")} disabled={!user} style={{ backgroundColor: !user ? theme.textMuted : theme.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, opacity: !user ? 0.7 : 1 }}>
              <Text style={{ color: theme.buttonText, fontWeight: "700", fontSize: 12 }}>Publicar</Text>
            </TouchableOpacity>
          </View>
        </View>
        {hasActiveFilters && filtersCollapsed && (
          <View style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: `${theme.accent}10`, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: `${theme.accent}30` }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
              <Ionicons name="funnel" size={14} color={theme.accent} />
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: "500" }} numberOfLines={1}>
                Filtros activos: {[brandFilter, modelFilter, provinceFilter, yearMin ? `>${yearMin}` : "", priceMax ? `<${priceMax}` : ""].filter(Boolean).join(", ") || "Personalizados"}
              </Text>
            </View>
            <TouchableOpacity onPress={clearFilters} style={{ marginLeft: 8 }}>
              <Text style={{ color: theme.accent, fontSize: 12, fontWeight: "700" }}>Limpiar</Text>
            </TouchableOpacity>
          </View>
        )}
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
                  .filter((m) => m.toLowerCase().includes(debouncedBrandQuery.toLowerCase()))
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
                  .filter((mo) => mo.toLowerCase().includes(debouncedModelQuery.toLowerCase()))
                  .map((mo) => (
                    <TouchableOpacity key={mo} onPress={() => { setModelFilter(mo); setModelOpen(false); setModelQuery(""); }} style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: mo === modelFilter ? `${theme.accent}22` : undefined }}>
                      <Text style={{ color: mo === modelFilter ? theme.accent : theme.text }}>{mo}</Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TouchableOpacity onPress={async () => { await loadYearFilterOptions(); setYearMinOpen((p) => !p); }} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: theme.inputBackground }}>
              <Text style={{ color: theme.inputText, fontWeight: yearMin ? "700" : "400", fontSize: 13 }}>{yearMin ? `Año mín: ${yearMin}` : "Año mín"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={async () => { await loadYearFilterOptions(); setYearMaxOpen((p) => !p); }} style={{ flex: 1, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: theme.inputBackground }}>
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
              {yearFilterLoading ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <ActivityIndicator color={theme.accent} size="small" />
                </View>
              ) : (
                <ScrollView keyboardShouldPersistTaps="handled">
                  {(yearFilterOptions ?? YEAR_OPTIONS).slice().reverse().map((yo) => (
                    <TouchableOpacity key={`ymin-${yo}`} onPress={() => { setYearMin(String(yo)); setYearMinOpen(false); }} style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: String(yo) === yearMin ? `${theme.accent}22` : undefined }}>
                      <Text style={{ color: String(yo) === yearMin ? theme.accent : theme.text }}>{yo}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
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
              {yearFilterLoading ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <ActivityIndicator color={theme.accent} size="small" />
                </View>
              ) : (
                <ScrollView keyboardShouldPersistTaps="handled">
                  {(yearFilterOptions ?? YEAR_OPTIONS).map((yo) => (
                    <TouchableOpacity key={`ymax-${yo}`} onPress={() => { setYearMax(String(yo)); setYearMaxOpen(false); }} style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: String(yo) === yearMax ? `${theme.accent}22` : undefined }}>
                      <Text style={{ color: String(yo) === yearMax ? theme.accent : theme.text }}>{yo}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
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
              onPress={clearFilters}
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
          <SkeletonList count={5} />
        ) : (
          <FlatList
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />
                    }
                    style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
            data={filteredVehicles}
            keyExtractor={(item) => item.id}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            onEndReachedThreshold={0.4}
            onEndReached={loadMore}
            ListHeaderComponent={isOffline ? (
              <View style={{ backgroundColor: "#92400e", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 4 }}>
                <Ionicons name="cloud-offline-outline" size={16} color="#fde68a" />
                <Text style={{ color: "#fde68a", fontSize: 13, flex: 1 }}>Sin conexión — mostrando datos guardados</Text>
              </View>
            ) : null}

            ListFooterComponent={
              loadingMore ? (
                <View style={{ paddingVertical: 16, alignItems: "center" }}>
                  <ActivityIndicator color={theme.accent} size="small" />
                </View>
              ) : !hasMore && filteredVehicles.length > 0 ? (
                <Text style={{ color: theme.textMuted, fontSize: 11, textAlign: "center", paddingVertical: 16 }}>
                  — {filteredVehicles.length} vehículos —
                </Text>
              ) : null
            }
            ListEmptyComponent={
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", marginTop: 40, padding: 20 }}>
                  <Ionicons name="car-sport-outline" size={48} color={theme.textMuted} />
                  <Text style={{ color: theme.textMuted, marginTop: 16, textAlign: "center", fontSize: 16 }}>
                      No se encontraron vehículos.
                  </Text>
                  {Platform.OS === 'web' && (
                      <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 8 }}>
                          {vehicles.length} vehículos cargados. (Revisá los filtros)
                      </Text>
                  )}
              </View>
            }
            renderItem={({ item }) => (
            <CarCard
              vehicle={{ ...item, userName: (item.userId && userNamesCache[item.userId]) ? userNamesCache[item.userId] : item.userName }}
              liked={favoriteIds.has(item.id)}
              likeDisabled={!favoriteIds.has(item.id) && likesRemaining <= 0}
              onToggleLike={() => toggleFavorite(item.id, item.userId)}
              matchScore={buyerPrefs && Object.keys(buyerPrefs).length > 0 ? calcMatchScore(item, buyerPrefs).score : undefined}
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
      </WebContainer>
      <Onboarding />

      {/* FABs — fijos, no scrollean */}
      {Platform.OS !== "web" && (
        <>
          {/* FAB Asesor IA */}
          <TouchableOpacity
            onPress={() => router.push("/(screens)/ai-advisor" as any)}
            activeOpacity={0.88}
            style={{
              position: "absolute",
              bottom: 86,
              right: 16,
              backgroundColor: theme.accent,
              borderRadius: 28,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 12,
              gap: 7,
              shadowColor: "#000",
              shadowOpacity: 0.28,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 8,
            }}
          >
            <Ionicons name="sparkles" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Buscá con IA</Text>
          </TouchableOpacity>

          {/* FAB Preferencias */}
          {user && (
            <TouchableOpacity
              onPress={() => setShowPrefsModal(true)}
              activeOpacity={0.88}
              style={{
                position: "absolute",
                bottom: 148,
                right: 16,
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: theme.card,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1.5,
                borderColor: buyerPrefs && Object.keys(buyerPrefs).some(k => (buyerPrefs as any)[k]) ? theme.accent : theme.likeBoxBackground,
                shadowColor: "#000",
                shadowOpacity: 0.18,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: 6,
              }}
            >
              <Ionicons
                name="options-outline"
                size={20}
                color={buyerPrefs && Object.keys(buyerPrefs).some(k => (buyerPrefs as any)[k]) ? theme.accent : theme.textMuted}
              />
              {buyerPrefs && Object.keys(buyerPrefs).some(k => (buyerPrefs as any)[k]) && (
                <View style={{
                  position: "absolute", top: 6, right: 6,
                  width: 8, height: 8, borderRadius: 4,
                  backgroundColor: theme.accent,
                  borderWidth: 1.5, borderColor: theme.card,
                }} />
              )}
            </TouchableOpacity>
          )}
        </>
      )}

      {user && (
        <BuyerPreferencesModal
          visible={showPrefsModal}
          userId={user.uid}
          initial={buyerPrefs}
          onSave={(prefs) => { setBuyerPrefs(prefs); setShowPrefsModal(false); }}
          onDismiss={() => setShowPrefsModal(false)}
        />
      )}
    </SafeAreaView>
  );
}
