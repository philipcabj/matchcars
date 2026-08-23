// app/car/[id].tsx
import { CarCard } from "@/components/cards/carcard";
import { CustomAlert } from "@/components/CustomAlert";
import { ShareSheet } from "@/components/ShareSheet";
import { OfferCard } from "@/components/OfferCard";
import { DownloadAppBanner } from "@/components/DownloadAppBanner";
import { PriceRecommendation } from "@/components/PriceRecommendation";
import { SelectionModal } from "@/components/SelectionModal";
import { WebContainer } from "@/components/WebContainer";
import type { Theme } from "@/config/theme";
import type { Vehicle } from "@/types/vehicle";
import { CITY_OPTIONS_BY_PROVINCE, PROVINCES } from "@/config/locations";
import { useAuth } from "@/contexts/AuthContext";
import { useHistory } from "@/contexts/HistoryContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Offer } from "@/types/commerce";
import { calcMatchScore } from "@/lib/matchScore";
import { usePriceSuggestion } from "@/hooks/usePriceSuggestion";
import { trackEvent } from "@/lib/analytics";
import { db, storage } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { sendNotificationEmail } from "@/lib/mail";
import { sendPushNotification } from "@/lib/notifications";
import { canExportPDF, canHavePublicAgencyPage } from "@/lib/planChecks";
import { analyzeMarketPrice } from "@/lib/pricing";
import { playLikeSound } from "@/lib/sounds";
import { formatNumber, parseNumber } from "@/utils/format";
import { getOptimizedImageUrl } from "@/utils/imageUtils";
import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from "expo-haptics";
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import { useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import * as Sharing from 'expo-sharing';
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs, getDocFromServer, getDocsFromServer, increment, limit, onSnapshot, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, Image, InputAccessoryView, Keyboard, Modal, Platform, ScrollView, Share, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from "react-native-safe-area-context";

type CarDetailsTabs = "resumen" | "ficha" | "financiacion" | "fotos" | "video";

type VehicleDoc = Vehicle & {
  likedBy?: string[];
  fuel?: string; // legacy field alias for fuelType
  images?: { cover?: string; gallery?: string[] };
};

const fuelOptions = ["Nafta", "Diésel", "Híbrido", "Eléctrico", "GNC"];
const gearboxOptions = ["Manual", "Automática"];

export default function CarDetailsScreen() {
  const { id, tab, edit } = useLocalSearchParams<{ id: string; tab?: string; edit?: string }>();
  const router = useRouter();
  const { user, profile, initializing } = useAuth();
  const { theme } = useTheme();
  const { addToHistory } = useHistory();
  const styles = createStyles(theme);
  const windowWidth = Dimensions.get("window").width;
  const heroWidth = (Platform.OS === "web" ? Math.min(windowWidth, 800) : windowWidth) - 24;
  // 4:3 es el aspect ratio real de la gran mayoría de las fotos subidas; los
  // multiplicadores anteriores (0.5 / 0.65) daban un recuadro mucho más ancho
  // que alto y recortaban gran parte de cada foto con resizeMode="cover".
  const heroHeight = heroWidth * 0.75;

  const [vehicle, setVehicle] = useState<VehicleDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<CarDetailsTabs>("resumen");
  const [editing, setEditing] = useState(false);
  const [ownerProfile, setOwnerProfile] = useState<{ 
    photoURL?: string; 
    initials: string; 
    avatarColor: string; 
    plan?: string; 
    trustLevel?: string;
    sellerRating?: number;
    sellerReviewCount?: number;
  } | null>(null);
  const [editState, setEditState] = useState({
    price: "",
    km: "",
    fuelType: "",
    gearbox: "",
    city: "",
    province: "",
    currency: "",
    acceptsFinancing: false,
    finDownPayment: "",
    finType: "",
    finEntity: "",
    finRate: "",
    finMonths: "",
    description: "",
    featuresText: "",
    historyItems: [] as { year?: string; title?: string; note?: string }[],
    fuelOpen: false,
    gearboxOpen: false,
    cityOpen: false,
    cityQuery: "",
    provinceOpen: false,
    provinceQuery: "",
    airbags: "",
    windowsAuto: "",
    wheelType: "",
    engine: "",
    // AI Description State
    aiLoading: false,
    
    // Images
    cover: "",
    gallery: [] as string[],
    video: "",
    imagesUploading: false,
  } as any);

  const [citiesList, setCitiesList] = useState<string[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  // Offer state
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [offerModalVisible, setOfferModalVisible] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerCurrency, setOfferCurrency] = useState<"ARS" | "USD">("ARS");
  const [offerTradeIn, setOfferTradeIn] = useState(false);
  const [offerTradeInDesc, setOfferTradeInDesc] = useState("");
  const [offerFinancing, setOfferFinancing] = useState(false);
  const [offerFinancingNote, setOfferFinancingNote] = useState("");
  const [offerNote, setOfferNote] = useState("");
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [activeOffer, setActiveOffer] = useState<(Offer & { id: string }) | null>(null);

  // Alert State
  const [alertConfig, setAlertConfig] = useState({ 
    visible: false,
    title: "", 
    message: "", 
    type: "info" as "success" | "error" | "info" | "warning",
    onClose: () => {},
    showCancel: false,
    onCancel: () => {},
    confirmText: "Entendido",
    cancelText: "Cancelar",
    options: undefined as any
  });

  // Full Screen Image Viewer State
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const viewerScrollRef = useRef<ScrollView>(null);

  // Price Recommendation State
  const [hideRecommendation, setHideRecommendation] = useState(false);
  
  // Hero Items State (Images + Video)
   const [heroItems, setHeroItems] = useState<{ type: 'image' | 'video', uri: string }[]>([]);
   const [activeHeroIndex, setActiveHeroIndex] = useState(0);
   const heroScrollRef = useRef<ScrollView>(null);
  const [, setKeyboardVisible] = useState(false);

   useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
        showSub.remove();
        hideSub.remove();
    };
   }, []);

   // Price Alert State
   const [subscribed, setSubscribed] = useState(false);
   const [alertLoading, setAlertLoading] = useState(false);
  
   useEffect(() => {
    if (!user || !id) return;
    const vehicleId = Array.isArray(id) ? id[0] : id;
    const unsub = onSnapshot(doc(db, "vehicles", vehicleId, "price_alerts", user.uid), (doc) => {
        setSubscribed(doc.exists());
    });
    return () => unsub();
   }, [user, id]);

  useEffect(() => {
    if (id) {
      addToHistory(Array.isArray(id) ? id[0] : id);
    }
  }, [id, addToHistory]);

  useEffect(() => {
    if (!user) {
        setFavoriteIds([]);
        return;
    }
    const favRef = collection(db, "users", user.uid, "favorites");
    const unsubFav = onSnapshot(favRef, (snap) => {
        const ids: string[] = [];
        snap.forEach((d) => ids.push(d.id));
        setFavoriteIds(ids);
    });
    return () => unsubFav();
  }, [user]);

  const toggleFavorite = async () => {
    if (!user) {
        router.push("/login");
        return;
    }
    if (!vehicle) return;

    // Play sound and haptics
    playLikeSound().catch(() => {});
    try {
      if (Platform.OS !== 'web') {
         await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {}

    const vehicleId = vehicle.id;
    const ref = doc(db, "users", user.uid, "favorites", vehicleId);
    const vRef = doc(db, "vehicles", vehicleId);
    const isFav = favoriteIds.includes(vehicleId);

    if (isFav) {
        await deleteDoc(ref);
        try {
            await updateDoc(vRef, { 
                likedBy: arrayRemove(user.uid),
                likesCount: increment(-1) 
            });
        } catch {
            try { await updateDoc(vRef, { likedBy: arrayRemove(user.uid) }); } catch {}
        }
    } else {
        // Check daily limit
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const favRef = collection(db, "users", user.uid, "favorites");
        const q = query(favRef, where("createdAt", ">=", Timestamp.fromDate(start)));
        const snap = await getDocs(q);
        if (snap.size >= 10) {
            showAlert("Límite diario", "Sólo podés dar hasta 10 likes por día.", "warning");
            return;
        }

        await setDoc(ref, { 
            vehicleId, 
            createdAt: serverTimestamp(), 
            userId: user.uid, 
            vehicleOwnerId: vehicle.userId ?? null 
        });
        try {
            await updateDoc(vRef, { 
                likedBy: arrayUnion(user.uid),
                likesCount: increment(1) 
            });
        } catch {
            try { await updateDoc(vRef, { likedBy: arrayUnion(user.uid) }); } catch {}
        }
    }
  };

  // Helper Component for Video with Replay
   const ReplayableVideo = ({ uri, resizeMode, shouldPlay, isMuted, style, useNativeControls = true }: any) => {
      const videoRef = React.useRef<Video>(null);
      const [showReplay, setShowReplay] = useState(false);

      return (
          <View style={[{ overflow: 'hidden' }, style]}>
              <Video
                  ref={videoRef}
                  source={{ uri }}
                  style={{ width: '100%', height: '100%' }}
                  useNativeControls={useNativeControls}
                  resizeMode={resizeMode}
                  isLooping={false}
                  shouldPlay={shouldPlay}
                  isMuted={isMuted}
                  onPlaybackStatusUpdate={(status) => {
                      if (status.isLoaded && status.didJustFinish) {
                          setShowReplay(true);
                      } else if (status.isLoaded && status.isPlaying) {
                          setShowReplay(false);
                      }
                  }}
              />
              {showReplay && (
                  <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 10 }]}>
                      <TouchableOpacity 
                        onPress={() => {
                            videoRef.current?.replayAsync();
                            setShowReplay(false);
                        }}
                        style={{ padding: 10 }}
                      >
                          <Ionicons name="refresh-circle" size={70} color="#FFF" />
                          <Text style={{ color: "#FFF", fontWeight: "700", textAlign: "center" }}>Ver de nuevo</Text>
                      </TouchableOpacity>
                  </View>
              )}
          </View>
      );
   };

   useEffect(() => {
    if (!vehicle) return;
    const items: { type: 'image' | 'video', uri: string }[] = [];
    
    // 1. Cover + Gallery
    if (editState.cover) items.push({ type: 'image', uri: getOptimizedImageUrl(editState.cover) });
    
    // 2. Video (User requested: between cover and gallery)
    if (vehicle.video) items.push({ type: 'video', uri: vehicle.video });
    
    // 3. Gallery
    if (editState.gallery && editState.gallery.length > 0) {
        editState.gallery.forEach((g: string) => {
            if (g !== editState.cover) items.push({ type: 'image', uri: getOptimizedImageUrl(g) });
        });
    }
    
    setHeroItems(items);
  }, [vehicle, editState.cover, editState.gallery]);

  // Similar Vehicles State
  const [similarVehicles, setSimilarVehicles] = useState<any[]>([]);

  const calcPMT = (price: number, downPayment: number, annualRate: number, months: number): number => {
    const principal = price - downPayment;
    if (principal <= 0 || months <= 0) return 0;
    if (annualRate === 0) return Math.round(principal / months);
    const r = annualRate / 100 / 12;
    return Math.round((principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1));
  };

  useEffect(() => {
    if (!vehicle || !vehicle.brand) return;

    const fetchSimilar = async () => {
      try {
        const q = query(
          collection(db, "vehicles"),
          where("brand", "==", vehicle.brand),
          where("published", "==", true),
          limit(10)
        );
        const snap = await getDocs(q);
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter(
            (v: any) =>
              v.id !== vehicle.id &&
              v.status !== "deleted" &&
              v.status !== "sold" &&
              v.status !== "blocked" &&
              v.status !== "rejected"
          )
          .slice(0, 5);
        setSimilarVehicles(list);
      } catch (e) {
        logger.log("Error fetching similar vehicles", e);
      }
    };
    fetchSimilar();
  }, [vehicle]);

  const showAlert = (
    title: string, 
    message: string, 
    type: "success" | "error" | "info" | "warning" = "info",
    onClose?: () => void,
    showCancel = false, 
    onCancel?: () => void,
    confirmText = "Entendido",
    cancelText = "Cancelar",
    options?: any[]
  ) => {
      setAlertConfig({ 
        visible: true,
        title, 
        message, 
        type, 
        onClose: () => {
          setAlertConfig(prev => ({ ...prev, visible: false }));
          if (onClose) onClose();
        },
        showCancel, 
        onCancel: () => {
          setAlertConfig(prev => ({ ...prev, visible: false }));
          if (onCancel) onCancel();
        },
        confirmText, 
        cancelText,
        options: options?.map(opt => ({
            ...opt,
            onPress: () => {
                setAlertConfig(prev => ({ ...prev, visible: false }));
                if (opt.onPress) opt.onPress();
            }
        }))
      });
  };

  // Price Indicator Hook (Safe top-level call)
  const priceSuggestion = usePriceSuggestion(
    vehicle?.brand || "", 
    vehicle?.model || "", 
    String(vehicle?.year || ""),
    (vehicle?.currency as "ARS" | "USD") || "ARS",
    vehicle?.id // Exclude current vehicle from average calculation
  );

  useEffect(() => {
    const fetchCities = async () => {
      const prov = editState.province;
      if (!prov) {
        setCitiesList([]);
        return;
      }

      // 1. Defaults
      const defaults = CITY_OPTIONS_BY_PROVINCE[prov] || ["Córdoba", "Rosario", "Mendoza", "Salta", "Neuquén", "Bariloche"];

      // 2. Firestore
      try {
        const docRef = doc(db, "catalog", "default", "provinces", prov);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          const remoteCities: string[] = Array.isArray(data.cities) ? data.cities : [];
          // Merge
          const combined = Array.from(new Set([...defaults, ...remoteCities])).sort();
          setCitiesList(combined);
        } else {
          setCitiesList(defaults.sort());
        }
      } catch (e) {
        logger.log("Error fetching cities for province:", prov, e);
        setCitiesList(defaults.sort());
      }
    };
    fetchCities();
  }, [editState.province]);

  const [authChecking, setAuthChecking] = useState(true);
  

  // ✅ Chequeo de sesión y redirección dentro de useEffect
  useEffect(() => {
    if (initializing) return;
    setAuthChecking(false);
  }, [initializing]);

  useEffect(() => {
    if (tab && ["resumen", "ficha", "financiacion", "fotos", "video"].includes(String(tab))) {
      setActiveTab(tab as CarDetailsTabs);
    }
    if (edit === "true" || edit === "1") {
      setEditing(true);
    }
  }, [tab, edit]);

  useEffect(() => {
    // Allow web users to fetch data without login
    const isWeb = Platform.OS === 'web';
    if (!id || initializing || (authChecking && !isWeb) || (!user && !isWeb)) return;

    const ref = doc(db, "vehicles", id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as VehicleDoc;
          // Hide vehicles that are not publicly accessible to non-owners
          const hiddenStatuses = ["deleted", "blocked", "rejected"];
          if (hiddenStatuses.includes(data.status ?? "") && data.userId !== user?.uid) {
            setVehicle(null);
            setLoading(false);
            return;
          }
          setVehicle(data);
          if (Platform.OS === "web") {
            try {
              trackEvent("car_view", {
                vehicleId: data.id,
                content_ids: data.id,
                brand: data.brand ?? "",
                model: data.model ?? "",
                year: data.year ?? "",
                price: data.price ?? 0,
                value: data.price ?? 0,
                currency: data.currency ?? "",
                status: data.status ?? "",
              });
            } catch {}
          }
          setEditState((prev: any) => ({
            ...prev,
            price: String(data.price ?? ""),
            km: String(data.km ?? ""),
            fuelType: data.fuelType ?? data.fuel ?? "",
            gearbox: data.gearbox ?? data.transmission ?? "",
            city: data.location?.city ?? data.city ?? "",
            province: data.location?.province ?? data.province ?? "",
            currency: data.currency ?? "ARS",
            acceptsFinancing: !!data.acceptsFinancing,
            finDownPayment: data.financing?.downPayment ? String(data.financing.downPayment) : "",
            finType: data.financing?.type ?? "",
            finEntity: data.financing?.entity ?? "",
            finRate: data.financing?.rate ? String(data.financing.rate) : "",
            finMonths: data.financing?.months ? String(data.financing.months) : "",
            description: data.description ?? "",
            featuresText: Array.isArray(data.features) ? data.features.join(", ") : "",
            historyItems: Array.isArray(data.history) ? data.history : [],
            airbags: String((data as any)?.airbags ?? ""),
            windowsAuto: String((data as any)?.windowsAuto ?? ""),
            wheelType: (data as any)?.wheelType ?? "",
            engine: (data as any)?.engine ?? "",
            // History booleans
            singleOwner: !!data.singleOwner,
            serviceRecords: !!data.serviceRecords,
            vtvValid: !!data.vtvValid,
            papersUpToDate: !!data.papersUpToDate,
            warranty: !!data.warranty,
            // New fields
            sellingReason: data.sellingReason ?? "",
            negotiablePrice: !!data.negotiablePrice,
            immediateDelivery: !!data.immediateDelivery,
            acceptsTradeIn: !!(data.flags?.tradeIn || data.acceptsTradeIn),
            // Images
            cover: data.images?.cover ?? data.coverImage ?? data.cover ?? "",
            gallery: Array.isArray(data.images?.gallery) ? data.images.gallery : (Array.isArray(data.additionalImages) ? data.additionalImages : []),
            video: data.video ?? "",
          }));
        } else {
          setVehicle(null);
        }
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    return () => unsub();
  }, [id, initializing, authChecking, user]);

  useEffect(() => {
    const ownerUserId = vehicle?.userId;
    if (!ownerUserId) return;
    const fetchOwner = async () => {
      try {
        const docRef = doc(db, "users", ownerUserId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          let initials = data.initials;
          if (!initials) {
            const name = data.displayName || data.firstName || "Usuario";
            initials = name.slice(0, 2).toUpperCase();
          }
          const avatarColor = data.avatarColor || theme.accent;
          const photoURL = data.photoURL || data.avatar || null;
          const plan = data.plan;
          const trustLevel = data.trustLevel;
          setOwnerProfile({
            photoURL,
            initials,
            avatarColor,
            plan,
            trustLevel,
            sellerRating: data.sellerRating,
            sellerReviewCount: data.sellerReviewCount,
          });

          if (
            vehicle &&
            (vehicle.sellerRating !== data.sellerRating ||
              vehicle.sellerReviewCount !== data.sellerReviewCount ||
              vehicle.sellerTrustLevel !== trustLevel ||
              vehicle.userPlan !== plan)
          ) {
            const vRef = doc(db, "vehicles", id);
            updateDoc(vRef, {
              sellerRating: data.sellerRating ?? null,
              sellerReviewCount: data.sellerReviewCount ?? 0,
              sellerTrustLevel: trustLevel ?? "new",
              userPlan: plan ?? "free",
            }).catch((e) =>
              logger.log("Error syncing vehicle owner data", e)
            );
          }
        }
      } catch (e) {
        console.error("Error fetching owner profile", e);
      }
    };
    fetchOwner();
  }, [vehicle, id, theme.accent]);

  // Track view once per mount (only for non-owners) — must be before early returns
  const viewTrackedRef = useRef(false);
  useEffect(() => {
    if (viewTrackedRef.current || !vehicle?.id || !user || user.uid === vehicle.userId) return;
    viewTrackedRef.current = true;
    updateDoc(doc(db, "vehicles", vehicle.id), { views: increment(1) }).catch(() => {});
  }, [vehicle?.id, user?.uid]);

  // Load active offer for this vehicle+buyer pair
  useEffect(() => {
    if (!vehicle?.id || !user || user.uid === vehicle.userId) return;
    const q = query(
      collection(db, "offers"),
      where("vehicleId", "==", vehicle.id),
      where("buyerId", "==", user.uid),
      where("status", "in", ["pending", "countered", "accepted", "rejected"])
    );
    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) { setActiveOffer(null); return; }
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Offer & { id: string }));
      docs.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setActiveOffer(docs[0]);
    }, (err) => console.error("[car/[id] offers listener]", err.code, err.message));
    return () => unsub();
  }, [vehicle?.id, user?.uid]);

  if (initializing || authChecking) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator color={theme.accent} />
        <Text style={styles.loadingText}>Verificando sesión...</Text>
      </SafeAreaView>
    );
  }

  if (!user && Platform.OS !== 'web') {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.errorText}>Necesitás iniciar sesión para ver detalles.</Text>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
          <TouchableOpacity onPress={() => router.push("/login")} style={styles.backPill}>
            <Text style={styles.backPillText}>Iniciar sesión</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/register")} style={styles.homePill}>
            <Text style={styles.homePillText}>Registrarme</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleGoBack = () => {
    if (editing) {
      showAlert(
        "Cambios sin guardar",
        "Tenés cambios sin guardar. ¿Querés descartarlos y salir?",
        "warning",
        () => { setEditing(false); router.back(); },
        true,
        undefined,
        "Descartar",
        "Seguir editando"
      );
      return;
    }
    router.back();
  };

  const handleGoHome = () => {
    router.push("/(tabs)");
  };

  const handleReactivate = async () => {
    if (!vehicle) return;
    try {
      const vehicleRef = doc(db, "vehicles", vehicle.id);

      // Force server reads — bypass local cache so we find ALL sale docs regardless of offline state
      const [exactSnap, querySnap] = await Promise.all([
        getDocFromServer(doc(db, "sales", vehicle.id)),
        getDocsFromServer(query(collection(db, "sales"), where("vehicleId", "==", vehicle.id))),
      ]);

      const seenIds = new Set<string>();
      const saleEntries: { ref: any; data: any }[] = [];

      if (exactSnap.exists()) {
        seenIds.add(exactSnap.id);
        saleEntries.push({ ref: exactSnap.ref, data: exactSnap.data() });
      }
      querySnap.forEach((d) => {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          saleEntries.push({ ref: d.ref, data: d.data() });
        }
      });

      // Delete each sale in its own transaction — runTransaction waits for server confirmation
      for (const { ref: saleRef, data: sd } of saleEntries) {
        const { sellerId, buyerId, ratingBySeller, ratingByBuyer } = sd;
        const soldViaOfferId = (vehicle as any).soldViaOfferId ?? sd.soldViaOfferId;

        await runTransaction(db, async (t) => {
          const snap = await t.get(saleRef);
          if (!snap.exists()) return;

          if (ratingBySeller?.score && buyerId) {
            t.update(doc(db, "users", buyerId), {
              ratingSum: increment(-ratingBySeller.score),
              ratingCount: increment(-1),
            });
          }
          if (ratingByBuyer?.score && sellerId) {
            t.update(doc(db, "users", sellerId), {
              ratingSum: increment(-ratingByBuyer.score),
              ratingCount: increment(-1),
            });
          }
          if (soldViaOfferId) {
            t.update(doc(db, "offers", soldViaOfferId), { vehicleSold: deleteField() });
          }
          t.delete(saleRef);
        });
      }

      // Use transaction for vehicle update too — ensures server confirmation
      await runTransaction(db, async (t) => {
        const vSnap = await t.get(vehicleRef);
        if (!vSnap.exists()) throw new Error("Vehículo no encontrado.");
        t.update(vehicleRef, {
          status: "available",
          published: true,
          soldAt: deleteField(),
          soldViaOfferId: deleteField(),
        });
      });

      showAlert("Publicación reactivada", "El vehículo volvió a estar disponible.", "success");
    } catch (e: any) {
      showAlert("Error", e?.message ?? "No se pudo reactivar el vehículo.", "error");
    }
  };

  const handleContact = async () => {
    if (!user || !vehicle) return;
    
    // Simply navigate to chat with user. 
    // The chat/[uid] screen handles conversation creation (deterministic ID).
    if (vehicle.userId) {
        // Prepare vehicle data for context
        const vehicleData = {
            id: vehicle.id,
            brand: vehicle.brand,
            model: vehicle.model,
            year: vehicle.year,
            price: vehicle.price,
            currency: vehicle.currency,
            cover: vehicle.images?.cover ?? vehicle.coverImage ?? vehicle.cover ?? ""
        };

        router.push({
            pathname: "/chat/[uid]",
            params: { 
                uid: vehicle.userId, 
                name: vehicle.userName || undefined,
                vehicleId: vehicle.id,
                vehicleData: JSON.stringify(vehicleData)
            }
        });
    } else {
        showAlert("Error", "No se puede contactar a este usuario.", "error");
    }
  };

  const handleSubmitOffer = async () => {
    if (!user || !vehicle || !vehicle.userId) return;
    const parsed = parseFloat(offerAmount.replace(/\./g, "").replace(",", "."));
    if (!parsed || parsed <= 0) {
      showAlert("Monto inválido", "Ingresá un monto válido para tu oferta.", "error");
      return;
    }
    setSubmittingOffer(true);
    try {
      const [uid1, uid2] = [user.uid, vehicle.userId].sort();
      // Un hilo por auto, mismo criterio que leadId (ver chat/[uid].tsx convId).
      const convId = `${uid1}_${uid2}_${vehicle.id}`;
      const leadId = `${vehicle.userId}_${user.uid}_${vehicle.id}`;

      // Ensure conversation exists
      const cRef = doc(db, "conversations", convId);
      const cSnap = await getDoc(cRef);
      if (!cSnap.exists()) {
        await setDoc(cRef, { members: [user.uid, vehicle.userId], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }

      const now = serverTimestamp();
      const expiresAt = Timestamp.fromMillis(Date.now() + 48 * 60 * 60 * 1000);

      const offerData: Omit<Offer, "id"> = {
        leadId,
        conversationId: convId,
        vehicleId: vehicle.id,
        sellerId: vehicle.userId,
        buyerId: user.uid,
        amount: parsed,
        currency: offerCurrency,
        includesTradeIn: offerTradeIn,
        ...(offerTradeIn && offerTradeInDesc.trim() ? { tradeInDescription: offerTradeInDesc.trim() } : {}),
        includesFinancing: offerFinancing,
        ...(offerFinancing && offerFinancingNote.trim() ? { financingNote: offerFinancingNote.trim() } : {}),
        ...(offerNote.trim() ? { note: offerNote.trim() } : {}),
        status: "pending",
        createdAt: now,
        updatedAt: now,
        expiresAt,
        vehicleSnapshot: { brand: vehicle.brand ?? "", model: vehicle.model ?? "", year: Number(vehicle.year) || undefined, price: vehicle.price, currency: (vehicle.currency as "ARS" | "USD") || "ARS" },
        buyerSnapshot: { firstName: profile?.firstName, lastName: profile?.lastName, initials: profile?.initials, avatarColor: profile?.avatarColor },
      };

      const offerRef = await addDoc(collection(db, "offers"), offerData);

      // Notify seller
      addDoc(collection(db, "users", vehicle.userId, "offer_notifications"), {
        type: "offer_received",
        offerId: offerRef.id,
        conversationId: convId,
        vehicleId: vehicle.id,
        buyerId: user.uid,
        sellerId: vehicle.userId,
        amount: parsed,
        currency: offerCurrency,
        buyerSnapshot: offerData.buyerSnapshot ?? {},
        vehicleSnapshot: offerData.vehicleSnapshot ?? {},
        read: false,
        createdAt: now,
      }).catch(() => {});

      const buyerName = (profile?.firstName && profile?.lastName)
        ? `${profile.firstName} ${profile.lastName}`.trim()
        : (profile?.firstName || user.displayName || (user.email?.split('@')[0] ?? "Un interesado"));
      const carModel = `${vehicle.brand} ${vehicle.model}`.trim();
      const amountText = `${offerCurrency} ${Number(parsed).toLocaleString("es-AR")}`;

      sendNotificationEmail("offer_received", {
        recipientUid: vehicle.userId,
        senderName: buyerName,
        subject: `${buyerName} ofertó por tu ${carModel}`,
        carModel,
        amount: amountText,
      }).catch(() => {});

      getDoc(doc(db, "users", vehicle.userId)).then((sellerSnap) => {
        const pushToken = sellerSnap.data()?.pushToken;
        if (pushToken) {
          sendPushNotification(pushToken, "¡Recibiste una oferta!", `${buyerName} ofertó ${amountText} por tu ${carModel}`, { url: `matchcars://chat/${user.uid}?vehicleId=${vehicle.id}` });
        }
      }).catch(() => {});

      const offerSummary = {
        id: offerRef.id, amount: parsed, currency: offerCurrency,
        status: "pending", includesTradeIn: offerTradeIn, includesFinancing: offerFinancing,
        ...(offerData.note ? { note: offerData.note } : {}),
        ...(offerData.financingNote ? { financingNote: offerData.financingNote } : {}),
        createdAt: now, expiresAt,
      };

      // Create/update lead
      const leadRef = doc(db, "leads", leadId);
      const leadSnap = await getDoc(leadRef);
      if (!leadSnap.exists()) {
        await setDoc(leadRef, {
          sellerId: vehicle.userId, buyerId: user.uid, vehicleId: vehicle.id,
          conversationId: convId, status: "negotiation", createdAt: now,
          lastMessageAt: now, lastSenderId: user.uid, unreadCount: 1, messageCount: 0,
          estimatedValue: vehicle.price, currency: (vehicle.currency as "ARS" | "USD") || "ARS",
          offer: offerSummary,
          vehicleSnapshot: offerData.vehicleSnapshot,
          buyerSnapshot: offerData.buyerSnapshot,
        });
      } else {
        await updateDoc(leadRef, { status: "negotiation", offer: offerSummary, unreadCount: increment(1), lastMessageAt: now });
      }

      // System message in conversation
      const msgText = `Oferta: ${offerCurrency} ${Number(parsed).toLocaleString("es-AR")}`;
      await addDoc(collection(db, "conversations", convId, "messages"), {
        senderId: user.uid, text: msgText, type: "offer", offerId: offerRef.id, createdAt: now,
      });
      await updateDoc(cRef, { lastMessage: msgText, lastSenderId: user.uid, updatedAt: now, readBy: [user.uid], deletedBy: [] });

      // Increment vehicle offerCount
      await updateDoc(doc(db, "vehicles", vehicle.id), { offerCount: increment(1) }).catch(() => {});

      setOfferAmount(""); setOfferNote(""); setOfferTradeIn(false); setOfferTradeInDesc(""); setOfferFinancing(false); setOfferFinancingNote("");
      setOfferModalVisible(false);
    } catch (e: any) {
      console.error(e);
      showAlert("Error", "No se pudo enviar la oferta. Intentá de nuevo.", "error");
    } finally {
      setSubmittingOffer(false);
    }
  };

  const handleWithdrawOffer = async () => {
    if (!activeOffer || !vehicle) return;
    try {
      const now = serverTimestamp();
      await updateDoc(doc(db, "offers", activeOffer.id), { status: "withdrawn", updatedAt: now });
      await updateDoc(doc(db, "leads", activeOffer.leadId), {
        "offer.status": "withdrawn",
        ...(activeOffer.status === "accepted" ? { status: "contacted" } : {}),
      }).catch(() => {});
      // Notificar al vendedor si se cancela un acuerdo aceptado
      if (activeOffer.status === "accepted" && activeOffer.sellerId) {
        addDoc(collection(db, "users", activeOffer.sellerId, "offer_notifications"), {
          type: "deal_canceled",
          offerId: activeOffer.id,
          vehicleId: activeOffer.vehicleId ?? vehicle.id,
          buyerId: activeOffer.buyerId ?? user!.uid,
          sellerId: activeOffer.sellerId,
          vehicleSnapshot: activeOffer.vehicleSnapshot ?? {},
          read: false,
          createdAt: now,
        }).catch(() => {});

        const carModel = `${activeOffer.vehicleSnapshot?.brand ?? vehicle.brand} ${activeOffer.vehicleSnapshot?.model ?? vehicle.model}`.trim();
        sendNotificationEmail("deal_canceled", {
          recipientUid: activeOffer.sellerId,
          senderName: "MatchCars",
          subject: `El acuerdo por ${carModel} fue cancelado`,
          carModel,
        }).catch(() => {});
      }
    } catch (e) {
      showAlert("Error", "No se pudo cancelar.", "error");
    }
  };

  const normalizedId = Array.isArray(id) ? id[0] : id;

  const pageTitle = vehicle
    ? `${vehicle.brand || ""} ${vehicle.model || ""} ${vehicle.year || ""} en venta | Matchcars`
    : "Auto en venta | Matchcars";

  const pageDescription = vehicle
    ? `Encontrá este ${vehicle.brand || ""} ${vehicle.model || ""} ${vehicle.year || ""} usado en Matchcars${
        vehicle.km ? ` con ${Number(vehicle.km).toLocaleString("es-AR")} km` : ""
      }.`
    : "Encontrá autos usados publicados por particulares y agencias en Matchcars.";

  const vehicleStructuredData =
    vehicle && normalizedId
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(" "),
          description: pageDescription,
          image:
            vehicle.images?.cover ??
            vehicle.coverImage ??
            vehicle.images?.gallery?.[0] ??
            vehicle.additionalImages?.[0] ??
            undefined,
          url: `https://matchcars.app/car/${normalizedId}`,
          brand: vehicle.brand
            ? {
                "@type": "Brand",
                name: vehicle.brand,
              }
            : undefined,
          offers:
            typeof vehicle.price === "number"
              ? {
                  "@type": "Offer",
                  priceCurrency: vehicle.currency || "ARS",
                  price: vehicle.price,
                  availability:
                    vehicle.status === "sold"
                      ? "https://schema.org/SoldOut"
                      : "https://schema.org/InStock",
                }
              : undefined,
        }
      : null;

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator color={theme.accent} />
        <Text style={styles.loadingText}>Cargando auto...</Text>
      </SafeAreaView>
    );
  }

  if (!vehicle) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.errorText}>No se encontró el auto.</Text>
        <TouchableOpacity onPress={handleGoBack} style={styles.backPill}>
          <Text style={styles.backPillText}>← Volver</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const screenWidth = Dimensions.get("window").width;
  const images: string[] = [
    vehicle.images?.cover ?? vehicle.coverImage ?? vehicle.cover ?? "",
    ...(
      Array.isArray(vehicle.images?.gallery)
        ? vehicle.images.gallery
        : Array.isArray(vehicle.additionalImages)
        ? vehicle.additionalImages
        : []
    ),
  ].filter(Boolean);

  const displayTitle =
    [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(" ") ||
    vehicle.title ||
    "Auto sin título";

  const isSold = vehicle.status === "sold";
  
  const isOwner = user && user.uid === vehicle.userId;
  // Use current profile plan if owner, else stored vehicle plan for accurate permission check
  const effectivePlan = isOwner ? profile?.plan : vehicle.userPlan;
  
  const isVerifiedAgency = canHavePublicAgencyPage(effectivePlan || "");
  const showMetrics = effectivePlan && (effectivePlan.includes('pro_plus') || effectivePlan.includes('pro_dealer'));
  const effectiveAvg = priceSuggestion.avg;
  
  const getPriceIndicator = () => {
    if (!vehicle.price || priceSuggestion.loading) return null;
    
    const currentPrice = Number(vehicle.price);
    const avg = priceSuggestion.avg;

    if (avg === 0) return null;

    // Threshold of 5% difference
    const diff = ((currentPrice - avg) / avg) * 100;
    
    if (diff > 5) return { icon: "caret-up", color: "#EF4444", text: "Alto", desc: "Arriba del promedio" }; // High
    if (diff < -5) return { icon: "caret-down", color: "#10B981", text: "Buen precio", desc: "Debajo del promedio" }; // Low (Good for buyer)
    return { icon: "checkmark-circle", color: "#3B82F6", text: "En precio", desc: "Acorde al mercado" }; // Correct
  };

  const indicator = getPriceIndicator();

  const priceText =
    vehicle.price && vehicle.currency
      ? `${vehicle.currency} ${Number(vehicle.price).toLocaleString("es-AR")}`
      : "Precio no disponible";

  const kmText = vehicle.km ? `${vehicle.km.toLocaleString("es-AR")} km` : "KM no informado";
  const fuelText = vehicle.fuelType || vehicle.fuel || "Combustible no informado";
  const gearboxText = vehicle.gearbox || vehicle.transmission || "Caja no informada";

  const locationText =
    vehicle.location?.province ||
    vehicle.province ||
    "Provincia no disponible";

  const handlePickImage = async (type: "cover" | "gallery") => {
    if (editState.imagesUploading) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert("Permiso requerido", "Necesitamos acceso a tus fotos.", "info");
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: type === "gallery",
      selectionLimit: type === "gallery" ? Math.max(1, 8 - editState.gallery.length) : 1,
    });

    if (res.canceled || !res.assets.length) return;

    setEditState((prev: any) => ({ ...prev, imagesUploading: true }));

    const assets = type === "gallery" ? res.assets : [res.assets[0]];
    const newGallery = [...editState.gallery];
    let newCover = editState.cover;

    try {
        for (const asset of assets) {
            // Manipulate/Compress
            const manipulated = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: 1200 } }], {
                compress: 0.82,
                format: ImageManipulator.SaveFormat.JPEG,
            });

            // Blob
            const blob: Blob = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.onload = function () { resolve(xhr.response); };
                xhr.onerror = function () { reject(new TypeError("Network request failed")); };
                xhr.responseType = "blob";
                xhr.open("GET", manipulated.uri, true);
                xhr.send(null);
            });

            // Upload
            const filename = `${Date.now()}_${Math.floor(Math.random() * 1e6)}.jpg`;
            const path = `vehicles/${vehicle.id}/${filename}`;
            const storageRef = ref(storage, path);
            
            const task = uploadBytesResumable(storageRef, blob, { contentType: "image/jpeg" });
            await new Promise<void>((resolve, reject) => {
                task.on("state_changed", undefined, reject, resolve);
            });
            const url = await getDownloadURL(task.snapshot.ref);

            if (type === "cover") {
                newCover = url;
            } else {
                newGallery.push(url);
            }
        }
        
        setEditState((prev: any) => ({ 
            ...prev, 
            cover: newCover,
            gallery: newGallery,
            imagesUploading: false 
        }));

    } catch (e) {
        console.error("Upload error:", e);
        showAlert("Error", "No se pudieron subir algunas imágenes.", "error");
        setEditState((prev: any) => ({ ...prev, imagesUploading: false }));
    }
  };

  const handleDeleteImage = (type: "cover" | "gallery", index?: number) => {
      if (type === "cover") {
          setEditState((prev: any) => ({ ...prev, cover: "" }));
      } else {
          if (typeof index === 'number') {
              const newGallery = [...editState.gallery];
              newGallery.splice(index, 1);
              setEditState((prev: any) => ({ ...prev, gallery: newGallery }));
          }
      }
  };

  const handlePickVideo = async () => {
    // Check Plan for video upload
    const plan = profile?.plan as string | undefined;
    const isPro = plan === 'pro' || plan === 'pro_plus' || plan === 'pro_dealer'; // Explicit plan check
    if (!isPro) {
        showAlert("Función Premium", "El video walkaround es exclusivo para usuarios PRO. Suscribite para desbloquearlo.", "info", () => router.push("/(screens)/subscribe"));
        return;
    }

    try {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
            showAlert("Permiso requerido", "Necesitamos acceso a tus videos.", "info");
            return;
        }

        const res = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Videos,
            allowsEditing: false,
            videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
        });

        if (res.canceled || !res.assets.length) return;

        setEditState((prev: any) => ({ ...prev, imagesUploading: true }));

        const asset = res.assets[0];
        let finalUri = asset.uri;

        // Handle iOS ph:// assets (ensure we have a file:// URI)
        if (Platform.OS === 'ios' && (finalUri.startsWith('ph://') || finalUri.startsWith('assets-library://'))) {
             try {
                 const cacheDir = FileSystem.cacheDirectory + 'video_temp/';
                 const dirInfo = await FileSystem.getInfoAsync(cacheDir);
                 if (!dirInfo.exists) {
                     await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
                 }
                 const tempUri = cacheDir + `${Date.now()}.mp4`;
                 await FileSystem.copyAsync({ from: finalUri, to: tempUri });
                 finalUri = tempUri;
             } catch (err) {
                 logger.log("Error handling iOS video asset:", err);
             }
        }

        // Safe video handling: Copy to cache to ensure we have a valid file:// URI
        // This solves PHPhotosErrorDomain error 3164 (iCloud assets) and restricted URIs
        const cacheDir = FileSystem.cacheDirectory + 'uploads/';
        const cacheUri = cacheDir + `video_upload_${Date.now()}.mp4`;

        // Ensure directory exists
        const dirInfo = await FileSystem.getInfoAsync(cacheDir);
        if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
        }

        // Copy file
        await FileSystem.copyAsync({
            from: finalUri,
            to: cacheUri
        });

        // Fetch from local cache (guaranteed file:// URI)
        const response = await fetch(cacheUri);
        const blob = await response.blob();

        // Upload
        const filename = `${Date.now()}_${Math.floor(Math.random() * 1e6)}.mp4`;
        const path = `vehicles/${vehicle.id}/${filename}`;
        const storageRef = ref(storage, path);
        
        const task = uploadBytesResumable(storageRef, blob, { contentType: "video/mp4" });
        await new Promise<void>((resolve, reject) => {
            task.on("state_changed", undefined, reject, resolve);
        });
        const url = await getDownloadURL(task.snapshot.ref);

        // Cleanup cache
        await FileSystem.deleteAsync(cacheUri, { idempotent: true });

        setEditState((prev: any) => ({ 
            ...prev, 
            video: url,
            imagesUploading: false 
        }));

    } catch (e: any) {
        console.error("Upload error:", e);
        const errorMsg = e.message || JSON.stringify(e);
        if (errorMsg.includes("3164") || errorMsg.includes("PHPhotosErrorDomain")) {
            showAlert("Video en iCloud", "El video seleccionado está en iCloud y no se pudo descargar. Por favor, abre tu galería de Fotos, reproduce el video para que se descargue en tu dispositivo, e inténtalo de nuevo.", "info");
        } else {
            showAlert("Error", "No se pudo subir el video. Intenta con otro archivo.", "error");
        }
        setEditState((prev: any) => ({ ...prev, imagesUploading: false }));
    }
  };

  const handleDeleteVideo = () => {
      setEditState((prev: any) => ({ ...prev, video: "" }));
  };

  const sendPriceDropNotifications = async (newPrice: number, oldPrice: number, currency: string) => {
    if (!vehicle || !user) return;
    
    try {
        logger.log("Checking price drop for notifications: ", oldPrice, "->", newPrice);
        
        const subscribersRef = collection(db, "vehicles", vehicle.id, "price_alerts");
        const snap = await getDocs(subscribersRef);
        
        logger.log("Found subscribers: ", snap.size);
        
        if (!snap.empty) {
            const notificationsBatch: Promise<void>[] = [];
            const now = Timestamp.now();
            
            snap.forEach(subDoc => {
                const subData = subDoc.data();
                const subscriberId = subData.userId;
                
                // Don't notify the owner (current user)
                if (subscriberId && subscriberId !== user.uid) {
                    const notifRef = doc(collection(db, "users", subscriberId, "price_alert_notifications"));
                    notificationsBatch.push(setDoc(notifRef, {
                        type: "price_drop",
                        title: "¡Bajó de precio!",
                        message: `El ${vehicle.brand} ${vehicle.model} que te interesa bajó a ${currency} ${formatNumber(newPrice)}.`,
                        vehicleId: vehicle.id,
                        newPrice: `${currency} ${formatNumber(newPrice)}`,
                        brand: vehicle.brand,
                        model: vehicle.model,
                        vehicleData: {
                            brand: vehicle.brand,
                            model: vehicle.model,
                            price: newPrice,
                            currency: currency,
                            coverImage: vehicle.images?.cover || null
                        },
                        read: false,
                        createdAt: now
                    }));

                    sendNotificationEmail("price_drop", {
                        recipientUid: subscriberId,
                        senderName: "MatchCars",
                        subject: `¡Bajó de precio! ${vehicle.brand} ${vehicle.model}`,
                        carModel: `${vehicle.brand} ${vehicle.model}`.trim(),
                        newPrice: `${currency} ${formatNumber(newPrice)}`,
                    }).catch(() => {});
                }
            });
            
            await Promise.all(notificationsBatch);
            logger.log("Notifications sent to", notificationsBatch.length, "users");
            if (notificationsBatch.length > 0) {
                // Notify the owner (current user) that alerts were sent, for feedback
                showAlert("Notificaciones Enviadas", `Se avisó a ${notificationsBatch.length} interesados sobre la baja de precio.`, "success");
            } else {
                // If there were subscribers but they were all the owner (shouldn't happen with correct logic but good for safety)
                logger.log("No valid subscribers found (filtered out owner)");
            }
        } else {
            logger.log("No subscribers found for price alert");
        }
    } catch (error: any) {
        console.error("Error sending price drop notifications", error);
        if (error.code === 'permission-denied') {
             showAlert("Error de Permisos", "No tienes permiso para enviar notificaciones. Verifica las reglas de Firestore.", "error");
        } else {
             showAlert("Error", "No se pudieron enviar las notificaciones de precio. " + (error.message || ""), "error");
        }
    }
  };

  const handleQuickPriceUpdate = async (targetPrice: number) => {
    if (!vehicle) return;
    try {
        // Check for price drop
        const currentPrice = Number(vehicle.price);
        if (targetPrice < currentPrice) {
            await sendPriceDropNotifications(targetPrice, currentPrice, vehicle.currency || "ARS");
        }

        const ref = doc(db, "vehicles", vehicle.id);

        let riskUpdate: any = {};
        try {
          if (vehicle.brand && vehicle.model && vehicle.year) {
            const yearNum = Number(vehicle.year);
            if (!Number.isNaN(yearNum) && targetPrice > 0) {
              const currency = (vehicle.currency as "ARS" | "USD") || "ARS";
              const description = typeof vehicle.description === "string" ? vehicle.description : "";
              const coverImage =
                vehicle.images?.cover ||
                vehicle.coverImage ||
                "";
              const trustLevel = (vehicle.sellerTrustLevel as string) || profile?.trustLevel || "new";
              const userId = String(vehicle.userId || "");

              if (userId) {
                const now = new Date();
                const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);

                const flags: string[] = [];
                let score = 0;

            try {
              const analysis = await analyzeMarketPrice(
                String(vehicle.brand),
                String(vehicle.model),
                yearNum,
                currency,
                vehicle.id
              );
              if (analysis.avg > 0) {
                if (targetPrice > analysis.avg * 1.5) {
                  showAlert(
                    "Precio muy alto",
                    "El precio que cargaste está más de 50% por encima del valor de mercado estimado. Revisá el precio sugerido y ajustalo antes de guardar.",
                    "info"
                  );
                  return;
                }
                if (targetPrice < analysis.avg * 0.6) {
                  flags.push("price_outlier");
                  score += 4;
                } else if (targetPrice > analysis.avg * 1.5) {
                  flags.push("price_high_outlier");
                  score += 3;
                }
                const currentYear = now.getFullYear();
                if (yearNum >= currentYear && targetPrice < analysis.avg * 0.8) {
                  flags.push("year_price_mismatch");
                  score += 2;
                }
              }
            } catch {}

                try {
                  const qRecent = query(
                    collection(db, "vehicles"),
                    where("userId", "==", userId),
                    where("createdAt", ">=", Timestamp.fromDate(from))
                  );
                  const snapRecent = await getDocs(qRecent);
                  if (snapRecent.docs.length >= 3 && trustLevel !== "verified") {
                    flags.push("new_user_mass");
                    score += 3;
                  }
                } catch {}

                if (description) {
                  const text = description.toLowerCase();
                  const hasPhone = /\d{8,}/.test(text);
                  const hasLink =
                    text.includes("http://") ||
                    text.includes("https://") ||
                    text.includes("www.") ||
                    text.includes(".com");
                  if (hasPhone || hasLink) {
                    flags.push("external_contact");
                    score += 2;
                  }
                }

                try {
                  if (coverImage) {
                    const qDup = query(
                      collection(db, "vehicles"),
                      where("userId", "==", userId),
                      where("images.cover", "==", coverImage)
                    );
                    const snapDup = await getDocs(qDup);
                    if (snapDup.docs.some((d) => d.id !== vehicle.id)) {
                      flags.push("duplicate_image");
                      score += 2;
                    }
                  }
                } catch {}

                riskUpdate = {
                  riskFlags: Array.from(new Set(flags)),
                  riskScore: score,
                };
              }
            }
          }
        } catch {}

        await updateDoc(ref, {
            price: targetPrice,
            updatedAt: serverTimestamp(),
            ...riskUpdate,
        });
        showAlert("Precio actualizado", "El precio se ha actualizado correctamente.", "success");
        setHideRecommendation(true); // Hide recommendation after applying
    } catch (e) {
        console.error("Error updating price", e);
        showAlert("Error", "No se pudo actualizar el precio.", "error");
    }
  };

  async function handleSaveEdits() {
    if (!vehicle) return;

    // Update catalog cities if needed
    if (editState.province && editState.city) {
      try {
        const provRef = doc(db, "catalog", "default", "provinces", editState.province);
        // setDoc with merge will create if not exists, or update merging fields
        // arrayUnion adds only if not present
        await setDoc(provRef, {
            name: editState.province,
            cities: arrayUnion(editState.city)
        }, { merge: true });
      } catch (e: any) {
        if (e.code === 'permission-denied') {
            logger.warn("Advertencia: No tienes permiso para actualizar el catálogo global de ciudades. (Esto requiere actualizar las reglas de seguridad en Firebase). El auto se actualizará igual.");
        } else {
            console.error("Error updating province cities:", e);
        }
      }
    }

    const ref = doc(db, "vehicles", vehicle.id);
    const priceNum = editState.price ? Number(editState.price) : null;
    
    // Check for price drop and notify subscribers
    const currentPrice = Number(vehicle.price);
    const priceChanged = priceNum && currentPrice && priceNum !== currentPrice;
    if (user && priceNum && currentPrice && priceNum < currentPrice) {
        const currency = editState.currency || vehicle.currency || "ARS";
        await sendPriceDropNotifications(priceNum, currentPrice, currency);
    }

    const kmNum = editState.km ? Number(editState.km) : null;
    const finDP = editState.finDownPayment ? Number(editState.finDownPayment) : 0;
    const finMonthsNum = editState.finMonths ? Number(editState.finMonths) : null;
    const finRateNum = editState.finType === "sin_interes" ? 0 : (editState.finRate ? Number(editState.finRate) : null);
    const airbagsNum = editState.airbags ? Number(editState.airbags) : null;
    const windowsAutoNum = editState.windowsAuto ? Number(editState.windowsAuto) : null;
    const featuresArr = String(editState.featuresText || "")
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);

    let riskUpdate: any = {};
    try {
      const finalPrice = typeof priceNum === "number" && !Number.isNaN(priceNum) ? priceNum : null;
      const brand = vehicle.brand;
      const model = vehicle.model;
      const yearValue = vehicle.year;
            if (finalPrice && brand && model && yearValue) {
        const yearNum = Number(yearValue);
        if (!Number.isNaN(yearNum)) {
          const currency = (editState.currency as "ARS" | "USD") || (vehicle.currency as "ARS" | "USD") || "ARS";
          const description = typeof editState.description === "string" && editState.description.length > 0
            ? editState.description
            : (typeof vehicle.description === "string" ? vehicle.description : "");
          const coverImage =
            editState.cover ||
            vehicle.images?.cover ||
            vehicle.coverImage ||
            "";
          const trustLevel = (vehicle.sellerTrustLevel as string) || profile?.trustLevel || "new";
          const userId = String(vehicle.userId || "");

          if (userId) {
            const now = new Date();
            const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            const flags: string[] = [];
            let score = 0;

            try {
              const analysis = await analyzeMarketPrice(
                String(brand),
                String(model),
                yearNum,
                currency,
                vehicle.id
              );
              if (analysis.avg > 0) {
                if (finalPrice > analysis.avg * 1.5) {
                  showAlert(
                    "Precio muy alto",
                    "El precio que cargaste está más de 50% por encima del valor de mercado estimado. Revisá el precio sugerido y ajustalo antes de guardar.",
                    "info"
                  );
                  return;
                }
                if (finalPrice < analysis.avg * 0.6) {
                  flags.push("price_outlier");
                  score += 4;
                } else if (finalPrice > analysis.avg * 1.5) {
                  flags.push("price_high_outlier");
                  score += 3;
                }
                const currentYear = now.getFullYear();
                if (yearNum >= currentYear && finalPrice < analysis.avg * 0.8) {
                  flags.push("year_price_mismatch");
                  score += 2;
                }
              }
            } catch {}

            try {
              const qRecent = query(
                collection(db, "vehicles"),
                where("userId", "==", userId),
                where("createdAt", ">=", Timestamp.fromDate(from))
              );
              const snapRecent = await getDocs(qRecent);
              if (snapRecent.docs.length >= 3 && trustLevel !== "verified") {
                flags.push("new_user_mass");
                score += 3;
              }
            } catch {}

            if (description) {
              const text = description.toLowerCase();
              const hasPhone = /\d{8,}/.test(text);
              const hasLink =
                text.includes("http://") ||
                text.includes("https://") ||
                text.includes("www.") ||
                text.includes(".com");
              if (hasPhone || hasLink) {
                flags.push("external_contact");
                score += 2;
              }
            }

            try {
              if (coverImage) {
                const qDup = query(
                  collection(db, "vehicles"),
                  where("userId", "==", userId),
                  where("images.cover", "==", coverImage)
                );
                const snapDup = await getDocs(qDup);
                if (snapDup.docs.some((d) => d.id !== vehicle.id)) {
                  flags.push("duplicate_image");
                  score += 2;
                }
              }
            } catch {}

            riskUpdate = {
              riskFlags: Array.from(new Set(flags)),
              riskScore: score,
            };
          }
        }
      }
    } catch {}

    const statusUpdate: any = {};
    if (vehicle.status === "rejected") {
      statusUpdate.status = "pending_review";
      statusUpdate.published = false;
      statusUpdate.rejectionReason = null;
      statusUpdate.rejectedAt = null;
    }

    await updateDoc(ref, {
      price: priceNum,
      km: kmNum,
      fuelType: editState.fuelType || null,
      gearbox: editState.gearbox || null,
      currency: editState.currency || vehicle.currency || "ARS",
      location: {
        city: editState.city || null,
        province: editState.province || null,
      },
      description: editState.description || null,
      features: featuresArr.length ? featuresArr : [],
      airbags: airbagsNum,
      windowsAuto: windowsAutoNum,
      wheelType: editState.wheelType || null,
      engine: editState.engine || null,
      acceptsFinancing: !!editState.acceptsFinancing,
      financing: !!editState.acceptsFinancing && (finDP > 0 || editState.finType || finMonthsNum)
        ? {
            downPayment: finDP > 0 ? finDP : null,
            type: editState.finType || null,
            entity: editState.finType === "banco" ? (editState.finEntity || null) : null,
            months: finMonthsNum || null,
            rate: finRateNum ?? null,
            monthlyPayment: priceNum && finMonthsNum && finRateNum !== null
              ? calcPMT(priceNum, finDP, finRateNum ?? 0, finMonthsNum)
              : null,
          }
        : null,
      history: Array.isArray(editState.historyItems) ? editState.historyItems : [],
      // History booleans
      singleOwner: !!editState.singleOwner,
      serviceRecords: !!editState.serviceRecords,
      vtvValid: !!editState.vtvValid,
      papersUpToDate: !!editState.papersUpToDate,
      warranty: !!editState.warranty,
      // New fields
      sellingReason: editState.sellingReason || null,
      negotiablePrice: !!editState.negotiablePrice,
      immediateDelivery: !!editState.immediateDelivery,
      "flags.tradeIn": !!editState.acceptsTradeIn,
      video: editState.video || null,
      images: {
          cover: editState.cover || null,
          gallery: editState.gallery || []
      },
      updatedAt: serverTimestamp(),
      ...(priceChanged ? {
        priceHistory: arrayUnion({ price: priceNum, currency: editState.currency || vehicle.currency || "ARS", changedAt: Timestamp.now() }),
      } : {}),
      ...riskUpdate,
      ...statusUpdate,
    });
    if (vehicle.status === "rejected") {
      showAlert(
        "Enviado a revisión",
        "Tu publicación fue enviada nuevamente al equipo de moderación para su revisión.",
        "success"
      );
    }
    setEditing(false);
  }

  // --- Contenidos de cada pestaña ---

  const handlePriceAlertToggle = async () => {
    if (!user) {
        showAlert("Inicia sesión", "Debes estar logueado para suscribirte a alertas.", "info", () => router.push("/login"));
        return;
    }
    if (alertLoading) return;

    setAlertLoading(true);
    try {
        const vehicleId = Array.isArray(id) ? id[0] : id;
        logger.log("Toggling alert for vehicle:", vehicleId, "User:", user.uid);
        
        const ref = doc(db, "vehicles", vehicleId, "price_alerts", user.uid);
        const userAlertRef = doc(db, "users", user.uid, "price_alerts", vehicleId);

        if (subscribed) {
            logger.log("Removing alert...");
            await deleteDoc(ref);
            await deleteDoc(userAlertRef);
        } else {
            logger.log("Adding alert...");
            const alertData = {
                userId: user.uid,
                initialPrice: vehicle?.price || 0,
                createdAt: serverTimestamp()
            };
            await setDoc(ref, alertData);
            // Denormalize data for "My Alerts" screen
            await setDoc(userAlertRef, {
                ...alertData,
                vehicleId,
                brand: vehicle?.brand || "",
                model: vehicle?.model || "",
                year: vehicle?.year || "",
                coverImage: vehicle?.images?.cover || vehicle?.coverImage || null,
                currency: vehicle?.currency || "$",
                currentPrice: vehicle?.price || 0
            });
            
            // Auto-like when subscribing to price alert
            if (vehicle && !favoriteIds.includes(vehicle.id)) {
                 await toggleFavorite();
            }

            logger.log("Alert added successfully");
            showAlert("¡Listo!", "Te avisaremos si este auto baja de precio.", "success");
        }
    } catch (error) {
        console.error("Error toggling price alert", error);
        showAlert("Error", "No se pudo actualizar la alerta.", "error");
    } finally {
        setAlertLoading(false);
    }
  };

  const renderResumen = () => {
    const daysSincePublished = vehicle.createdAt
      ? Math.floor((new Date().getTime() - (vehicle.createdAt.toDate ? vehicle.createdAt.toDate() : new Date(vehicle.createdAt)).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const highInterest = ((vehicle.views ?? 0) > 50 && daysSincePublished < 7) || ((vehicle.likesCount ?? 0) > 5);
    const activeSeller = vehicle.sellerTrustLevel === 'active' || vehicle.sellerTrustLevel === 'verified' || (vehicle.images?.gallery?.length || 0) >= 5;

    const priceDrop = vehicle.originalPrice && (vehicle.price ?? 0) < vehicle.originalPrice
      ? Math.round(((vehicle.originalPrice - (vehicle.price ?? 0)) / vehicle.originalPrice) * 100)
      : 0;

    const showPriceRecommendation =
        user &&
        user.uid === vehicle.userId &&
        (vehicle.userPlan === 'pro_dealer' || profile?.plan === 'pro_dealer') &&
        !isSold &&
        !hideRecommendation &&
        priceSuggestion.avg > 0 &&
        (vehicle.price ?? 0) > priceSuggestion.avg;

    return (
    <View style={styles.sectionCard}>
      {isSold && (
        <View style={{ backgroundColor: "#ef4444", borderRadius: 8, marginBottom: 16, overflow: "hidden" }}>
          <View style={{ padding: 12, alignItems: "center" }}>
            <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 16 }}>¡VENDIDO!</Text>
            <Text style={{ color: "#FFF", fontSize: 12 }}>Este vehículo ya no está disponible.</Text>
          </View>
          {(profile?.role === "admin" || profile?.role === "moderator" || isOwner) && (
            <TouchableOpacity
              onPress={handleReactivate}
              style={{ backgroundColor: "rgba(0,0,0,0.2)", paddingVertical: 10, alignItems: "center", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.2)" }}
            >
              <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>Reactivar publicación</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {user && user.uid === vehicle.userId && (
        <View style={{ backgroundColor: theme.card, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: theme.badgeBorder }}>
          <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14, marginBottom: 8 }}>Métricas de tu publicación</Text>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <View style={{ flex: 1, backgroundColor: theme.background, padding: 10, borderRadius: 8, alignItems: "center" }}>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>Vistas</Text>
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: "800" }}>{vehicle.views || 0}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: theme.background, padding: 10, borderRadius: 8, alignItems: "center" }}>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>Me gusta</Text>
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: "800" }}>{vehicle.likesCount || 0}</Text>
            </View>
          </View>
          {profile?.plan === 'free' && (
            <TouchableOpacity onPress={() => router.push("/(screens)/subscribe")} style={{ marginTop: 8 }}>
               <Text style={{ color: theme.accent, fontSize: 12, textAlign: "center", fontWeight: "600" }}>🚀 Pasate a PRO para más exposición</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {showPriceRecommendation && (
        <PriceRecommendation
            currentPrice={Number(vehicle.price)}
            avgPrice={priceSuggestion.avg}
            currency={vehicle.currency || "ARS"}
            onLowerPrice={handleQuickPriceUpdate}
            onIgnore={() => setHideRecommendation(true)}
        />
      )}

      <Text style={styles.sectionTitle}>Resumen</Text>

      {user && user.uid !== vehicle.userId && (
        <TouchableOpacity 
            onPress={handlePriceAlertToggle}
            disabled={alertLoading}
            style={{ 
                flexDirection: 'row', 
                alignItems: 'center', 
                gap: 8, 
                backgroundColor: subscribed ? theme.inputBackground : theme.card, 
                padding: 10, 
                borderRadius: 8, 
                marginBottom: 16,
                borderWidth: 1,
                borderColor: subscribed ? theme.accent : theme.likeBoxBackground,
                opacity: alertLoading ? 0.7 : 1
            }}
        >
            {alertLoading ? (
                <ActivityIndicator size="small" color={theme.text} />
            ) : (
                <Ionicons name={subscribed ? "notifications" : "notifications-outline"} size={20} color={subscribed ? theme.accent : theme.text} />
            )}
            <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14 }}>
                    {subscribed ? "Suscrito a alertas de precio" : "Avísame si baja de precio"}
                </Text>
                {!subscribed && <Text style={{ color: theme.textMuted, fontSize: 12 }}>Te notificaremos si el vendedor reduce el valor.</Text>}
            </View>
        </TouchableOpacity>
      )}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {isVerifiedAgency && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#9013FE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                <Ionicons name="checkmark-circle" size={12} color="#FFF" />
                <Text style={{ fontSize: 10, color: '#FFF', fontWeight: '800' }}>AGENCIA VERIFICADA</Text>
            </View>
        )}
        {activeSeller && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.badgeBackground, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: theme.accent }}>
                <Ionicons name="flash" size={12} color={theme.accent} />
                <Text style={{ fontSize: 10, color: theme.text, fontWeight: '800' }}>VENDEDOR ACTIVO</Text>
            </View>
        )}
        {highInterest && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F59E0B', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                <Ionicons name="flame" size={12} color="#FFF" />
                <Text style={{ fontSize: 10, color: '#FFF', fontWeight: '800' }}>MUCHO INTERÉS</Text>
            </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.carTitle}>{displayTitle}</Text>
          {vehicle?.publicationCode && (
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>#{vehicle.publicationCode}</Text>
          )}
        </View>
      </View>

      <View style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[styles.priceText, { marginBottom: 0 }]}>{priceText}</Text>
            {showMetrics && indicator && !isSold && (
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: indicator.color }}>
                    <Ionicons name={indicator.icon as any} size={16} color={indicator.color} style={{ marginRight: 4 }} />
                    <Text style={{ color: indicator.color, fontWeight: '700', fontSize: 12 }}>{indicator.text}</Text>
                </View>
            )}
        </View>
        {showMetrics && indicator && !isSold && (
            <Text style={{ color: theme.textMuted, fontSize: 10, marginTop: 4, textAlign: 'right' }}>
                {indicator.desc} vs {priceSuggestion.count} similares
            </Text>
        )}
      </View>

      <View style={[styles.badgesRow, { flexWrap: "wrap" }]}>
        {vehicle.operationType === "sale" && (
          <View style={[styles.badge, styles.badgeSale]}>
            <Text style={styles.badgeText}>VENTA</Text>
          </View>
        )}
        {vehicle.operationType === "swap" && (
          <View style={[styles.badge, styles.badgeSwap]}>
            <Text style={styles.badgeText}>PERMUTA</Text>
          </View>
        )}
        {(vehicle.flags?.tradeIn || vehicle.acceptsTradeIn) && vehicle.operationType !== "swap" && (
           <View style={[styles.badge, { backgroundColor: theme.badgeBackground, borderWidth: 1, borderColor: theme.accent }]}>
             <Text style={[styles.badgeText, { color: theme.text }]}>🔁 ACEPTA PERMUTA</Text>
           </View>
        )}
        {vehicle.negotiablePrice && (
           <View style={[styles.badge, { backgroundColor: theme.badgeBackground, borderWidth: 1, borderColor: theme.accent }]}>
             <Text style={[styles.badgeText, { color: theme.text }]}>💬 PRECIO CHARLABLE</Text>
           </View>
        )}
        {vehicle.immediateDelivery && (
           <View style={[styles.badge, { backgroundColor: theme.badgeBackground, borderWidth: 1, borderColor: theme.accent }]}>
             <Text style={[styles.badgeText, { color: theme.text }]}>⏱ ENTREGA INMEDIATA</Text>
           </View>
        )}
        {vehicle.acceptsFinancing && (
          <View style={[styles.badge, { backgroundColor: theme.badgeBackground, borderWidth: 1, borderColor: theme.accent }]}>
            <Text style={[styles.badgeText, { color: theme.text }]}>💳 FINANCIACIÓN POSIBLE</Text>
          </View>
        )}
      </View>

      {/* Match Score breakdown — only for buyers viewing someone else's listing */}
      {profile?.buyerPreferences && user?.uid !== vehicle.userId && (() => {
        const { score, breakdown } = calcMatchScore(vehicle as any, profile.buyerPreferences!);
        if (score === 0 || breakdown.length === 0) return null;
        return (
          <View style={{ backgroundColor: theme.card, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: `${theme.accent}33` }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Ionicons name="sparkles" size={16} color={theme.accent} />
              <Text style={{ color: theme.title, fontWeight: "700", fontSize: 14 }}>
                {score}% para vos
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>— Por qué coincide</Text>
            </View>
            {breakdown.map((c, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <Ionicons
                  name={c.matched ? "checkmark-circle" : "close-circle"}
                  size={16}
                  color={c.matched ? "#10B981" : theme.textMuted}
                />
                <Text style={{ color: c.matched ? theme.text : theme.textMuted, fontSize: 13 }}>
                  {c.label}
                </Text>
              </View>
            ))}
          </View>
        );
      })()}

      <TouchableOpacity
          onPress={() => setShareSheetVisible(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.accent,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 8,
            gap: 8,
            marginBottom: 16,
            alignSelf: 'flex-start'
          }}
        >
          <Ionicons name="share-social" size={18} color="#FFF" />
          <Text style={{ color: "#FFF", fontWeight: "600", fontSize: 14 }}>Compartir publicación</Text>
      </TouchableOpacity>

      {vehicle.sellingReason && (
          <View style={{ marginTop: 8, marginBottom: 16, padding: 10, backgroundColor: theme.inputBackground, borderRadius: 8 }}>
             <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 2 }}>Motivo de venta</Text>
             <Text style={{ fontSize: 14, color: theme.text, fontWeight: '500' }}>{vehicle.sellingReason}</Text>
          </View>
      )}

      {/* Historial del aviso */}
      <View style={{ marginTop: 4, marginBottom: 16, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.likeBoxBackground }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: theme.text, marginBottom: 6, textTransform: "uppercase" }}>Historial del aviso</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
             <Text style={{ fontSize: 12, color: theme.textMuted }}>Publicado hace</Text>
             <Text style={{ fontSize: 12, color: theme.text, fontWeight: "600" }}>{daysSincePublished} días</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
             <Text style={{ fontSize: 12, color: theme.textMuted }}>Vistas totales</Text>
             <Text style={{ fontSize: 12, color: theme.text, fontWeight: "600" }}>{vehicle.views || 0}</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
             <Text style={{ fontSize: 12, color: theme.textMuted }}>Guardado en favoritos</Text>
             <Text style={{ fontSize: 12, color: theme.text, fontWeight: "600" }}>{vehicle.likesCount || 0} veces</Text>
        </View>
        {priceDrop > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: theme.textMuted }}>Precio original</Text>
                <Text style={{ fontSize: 12, color: theme.textMuted, textDecorationLine: "line-through" }}>{vehicle.currency} {vehicle.originalPrice?.toLocaleString("es-AR")}</Text>
            </View>
        )}
        {priceDrop > 0 && (
             <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: theme.textMuted }}>Rebaja total</Text>
                <Text style={{ fontSize: 12, color: theme.accent, fontWeight: "800" }}>⬇ {priceDrop}% OFF</Text>
            </View>
        )}
        {priceDrop > 0 && vehicle.updatedAt && (
             <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: theme.textMuted }}>Último cambio de precio</Text>
                <Text style={{ fontSize: 12, color: theme.text }}>
                    {vehicle.updatedAt?.toDate 
                        ? vehicle.updatedAt.toDate().toLocaleDateString("es-AR") 
                        : "Reciente"}
                </Text>
            </View>
        )}
        {vehicle.updatedAt && (
             <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <Text style={{ fontSize: 12, color: theme.textMuted }}>Última actualización</Text>
                <Text style={{ fontSize: 12, color: theme.text }}>
                    {vehicle.updatedAt?.toDate
                        ? vehicle.updatedAt.toDate().toLocaleDateString("es-AR")
                        : "Reciente"}
                </Text>
            </View>
        )}
        {vehicle.priceHistory && vehicle.priceHistory.length > 1 && (() => {
          const sorted = [...vehicle.priceHistory].sort((a, b) => {
            const ta = a.changedAt?.seconds ?? 0;
            const tb = b.changedAt?.seconds ?? 0;
            return tb - ta;
          });
          return (
            <View style={{ marginTop: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: theme.text, marginBottom: 8 }}>
                Historial de precio
              </Text>
              {sorted.map((entry, idx) => {
                const next = sorted[idx + 1];
                const pct = next ? Math.round(((entry.price - next.price) / next.price) * 100) : null;
                const date = entry.changedAt?.toDate
                  ? entry.changedAt.toDate().toLocaleDateString("es-AR")
                  : entry.changedAt?.seconds
                    ? new Date(entry.changedAt.seconds * 1000).toLocaleDateString("es-AR")
                    : "—";
                return (
                  <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5, borderBottomWidth: idx < sorted.length - 1 ? 1 : 0, borderBottomColor: theme.likeBoxBackground }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: idx === 0 ? theme.accent : theme.textMuted }} />
                      <Text style={{ fontSize: 12, color: idx === 0 ? theme.text : theme.textMuted, fontWeight: idx === 0 ? "600" : "400" }}>
                        {entry.currency} {entry.price.toLocaleString("es-AR")}
                      </Text>
                      {pct !== null && (
                        <View style={{ backgroundColor: pct < 0 ? "#22c55e22" : "#ef444422", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 10, fontWeight: "700", color: pct < 0 ? "#22c55e" : "#ef4444" }}>
                            {pct > 0 ? "+" : ""}{pct}%
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 11, color: theme.textMuted }}>{date}</Text>
                  </View>
                );
              })}
            </View>
          );
        })()}
      </View>

      <View style={styles.chipsRow}>
        <View style={styles.chip}>
          <Text style={styles.chipLabel} numberOfLines={1} adjustsFontSizeToFit>KM</Text>
          <Text style={styles.chipValue} numberOfLines={1} adjustsFontSizeToFit>{kmText}</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipLabel} numberOfLines={1} adjustsFontSizeToFit>Combustible</Text>
          <Text style={styles.chipValue} numberOfLines={1} adjustsFontSizeToFit>{fuelText}</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipLabel} numberOfLines={1} adjustsFontSizeToFit>Caja</Text>
          <Text style={styles.chipValue} numberOfLines={1} adjustsFontSizeToFit>{gearboxText}</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipLabel} numberOfLines={1} adjustsFontSizeToFit>Provincia</Text>
          <Text style={styles.chipValue} numberOfLines={1} adjustsFontSizeToFit>{locationText}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {[
          { label: "Único dueño", value: vehicle.singleOwner, icon: "person" },
          { label: "Service oficiales", value: vehicle.serviceRecords, icon: "build" },
          { label: "VTV al día", value: vehicle.vtvValid, icon: "checkmark-circle" },
          { label: "Papeles al día", value: vehicle.papersUpToDate, icon: "document-text" },
          { label: "En garantía", value: vehicle.warranty, icon: "shield-checkmark" },
        ].filter(i => i.value).map((item, idx) => (
          <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.inputBackground, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
            <Ionicons name={item.icon as any} size={16} color={theme.accent} style={{ marginRight: 6 }} />
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.ownerBox}>
        <TouchableOpacity 
          style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 }}
          onPress={() => vehicle.userId && router.push(`/(screens)/user-profile/${vehicle.userId}`)}
          disabled={!vehicle.userId}
        >
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: ownerProfile?.avatarColor || theme.accent, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {ownerProfile?.photoURL ? (
                    <Image source={{ uri: ownerProfile.photoURL }} style={{ width: 48, height: 48 }} />
                ) : (
                    <Text style={{ color: "#FFF", fontSize: 18, fontWeight: "bold" }}>{ownerProfile?.initials || (vehicle.userName || "U").slice(0, 2).toUpperCase()}</Text>
                )}
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.ownerLabel}>Publicado por</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.ownerName} numberOfLines={1}>
                      {vehicle.userName || "Usuario desconocido"}
                    </Text>
                    {(canHavePublicAgencyPage(ownerProfile?.plan || "") || canHavePublicAgencyPage(vehicle.userPlan || "")) && (
                        <Ionicons name="checkmark-circle" size={14} color="#9013FE" />
                    )}
                </View>

                {/* Reputation / Status */}
                {(canHavePublicAgencyPage(ownerProfile?.plan || "") || canHavePublicAgencyPage(vehicle.userPlan || "")) ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <Text style={{ color: "#9013FE", fontSize: 12, fontWeight: "700" }}>Agencia Verificada</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                            <Ionicons name="star" size={12} color="#F5A623" />
                            <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700" }}>
                              {Number(
                                (ownerProfile?.sellerRating ?? vehicle.sellerRating ?? 0)
                              ).toFixed(1)}
                            </Text>
                            <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                              (
                              {ownerProfile?.sellerReviewCount ??
                                vehicle.sellerReviewCount ??
                                0}
                              )
                            </Text>
                        </View>
                    </View>
                ) : ((vehicle.sellerRating !== undefined && vehicle.sellerRating !== null) || (ownerProfile?.sellerRating !== undefined && ownerProfile?.sellerRating !== null) || (vehicle.sellerReviewCount || 0) > 0 || (ownerProfile?.sellerReviewCount || 0) > 0) ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                        <Ionicons name="star" size={14} color="#F5A623" />
                        <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>
                          {Number(
                            (ownerProfile?.sellerRating ?? vehicle.sellerRating ?? 0)
                          ).toFixed(1)}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                          (
                          {ownerProfile?.sellerReviewCount ??
                            vehicle.sellerReviewCount ??
                            0}{" "}
                          ventas)
                        </Text>
                    </View>
                ) : (
                    <Text style={{ 
                        color: (ownerProfile?.trustLevel === 'verified' || vehicle.sellerTrustLevel === 'verified') ? "#34C759" : 
                               (ownerProfile?.trustLevel === 'active' || vehicle.sellerTrustLevel === 'active') ? theme.accent : theme.textMuted, 
                        fontSize: 12, 
                        fontWeight: "600", 
                        marginTop: 2 
                    }}>
                        {(ownerProfile?.trustLevel === 'verified' || vehicle.sellerTrustLevel === 'verified') ? "Vendedor Verificado" : 
                         (ownerProfile?.trustLevel === 'active' || vehicle.sellerTrustLevel === 'active') ? "Vendedor Activo" : "Usuario Nuevo"}
                    </Text>
                )}
            </View>
        </TouchableOpacity>
        {vehicle.createdAt && (
          <Text style={styles.ownerDate}>
            Publicado el{" "}
            {vehicle.createdAt?.toDate
              ? vehicle.createdAt.toDate().toLocaleDateString("es-AR")
              : new Date(vehicle.createdAt).toLocaleDateString("es-AR")}
          </Text>
        )}
        
        {Platform.OS === 'web' && (
            <View style={{ marginTop: 16 }}>
                <DownloadAppBanner message="Descargá la App para contactar al vendedor" />
            </View>
        )}

      </View>
      {vehicle.description ? (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.specLabel}>Descripción</Text>
          <Text style={styles.descriptionText}>{vehicle.description}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        onPress={() => router.push({ pathname: "/report/[id]", params: { id: vehicle.id, type: "vehicle" } })}
        style={{ marginTop: 24, alignSelf: "center", padding: 8 }}
      >
        <Text style={{ color: theme.textMuted, fontSize: 14, textDecorationLine: "underline" }}>
          Reportar publicación
        </Text>
      </TouchableOpacity>
    </View>
  );
  };

  const renderFichaTecnica = () => (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Ficha Técnica</Text>
      <View style={styles.specGrid}>
        <View style={styles.specItem}>
          <Text style={styles.specLabel}>Kilómetros</Text>
          <Text style={styles.specValue}>{kmText}</Text>
        </View>
        <View style={styles.specItem}>
          <Text style={styles.specLabel}>Combustible</Text>
          <Text style={styles.specValue}>{fuelText}</Text>
        </View>
        <View style={styles.specItem}>
          <Text style={styles.specLabel}>Transmisión</Text>
          <Text style={styles.specValue}>{gearboxText}</Text>
        </View>
        <View style={styles.specItem}>
          <Text style={styles.specLabel}>Año</Text>
          <Text style={styles.specValue}>{vehicle.year}</Text>
        </View>
        {vehicle.engine ? (
          <View style={styles.specItem}>
            <Text style={styles.specLabel}>Motor</Text>
            <Text style={styles.specValue}>{vehicle.engine}</Text>
          </View>
        ) : null}
        {vehicle.wheelType ? (
          <View style={styles.specItem}>
            <Text style={styles.specLabel}>Dirección</Text>
            <Text style={styles.specValue}>{vehicle.wheelType}</Text>
          </View>
        ) : null}
        {vehicle.airbags ? (
          <View style={styles.specItem}>
            <Text style={styles.specLabel}>Airbags</Text>
            <Text style={styles.specValue}>{vehicle.airbags}</Text>
          </View>
        ) : null}
        {vehicle.windowsAuto ? (
          <View style={styles.specItem}>
            <Text style={styles.specLabel}>Levantavidrios</Text>
            <Text style={styles.specValue}>{vehicle.windowsAuto}</Text>
          </View>
        ) : null}
      </View>

      {vehicle.features && vehicle.features.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={styles.specLabel}>Equipamiento</Text>
          <View style={styles.featuresWrap}>
            {vehicle.features.map((f: string, i: number) => (
              <View key={i} style={styles.featureTag}>
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {vehicle.description ? (
        <View style={{ marginTop: 16 }}>
          <Text style={styles.specLabel}>Descripción del vendedor</Text>
          <Text style={styles.descriptionText}>{vehicle.description}</Text>
        </View>
      ) : null}
    </View>
  );

  const renderFinanciacion = () => {
    const fin = vehicle.financing;
    const hasFinancing = vehicle.acceptsFinancing && fin && (fin.downPayment || fin.monthlyPayment || fin.type);

    if (!hasFinancing) {
      return (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Financiación</Text>
          <Text style={styles.mutedText}>Este vehículo no tiene financiación configurada.</Text>
        </View>
      );
    }

    const sym = vehicle.currency === "USD" ? "USD" : "$";
    const quota = fin.monthlyPayment || 0;

    const typeLabel: Record<string, string> = { propio: "Financiación Propia", banco: "Banco", sin_interes: "Sin Interés (0%)" };
    const typeColor: Record<string, string> = { propio: "#7C3AED", banco: "#1D4ED8", sin_interes: "#D97706" };
    const typeBg: Record<string, string> = { propio: "#F3E8FF", banco: "#EFF6FF", sin_interes: "#FFF9E6" };

    return (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Financiación</Text>

        {/* Type + Entity badges */}
        {fin.type && (
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: typeBg[fin.type] || theme.badgeBackground, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}>
              <Ionicons name={fin.type === "banco" ? "business-outline" : fin.type === "propio" ? "person-outline" : "gift-outline"} size={13} color={typeColor[fin.type] || theme.textMuted} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: typeColor[fin.type] || theme.text }}>{typeLabel[fin.type] || fin.type}</Text>
            </View>
            {fin.type === "banco" && fin.entity && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EFF6FF", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#1D4ED8" }}>{fin.entity}</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.financeBox}>
          {/* Anticipo row */}
          {fin.downPayment && fin.downPayment > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.badgeBorder }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="cash-outline" size={18} color="#166534" />
                <Text style={{ color: theme.text, fontSize: 14 }}>Anticipo</Text>
              </View>
              <Text style={{ color: "#166534", fontWeight: "800", fontSize: 16 }}>{sym} {fin.downPayment.toLocaleString("es-AR")}</Text>
            </View>
          )}

          {/* Cuotas row */}
          {fin.months && fin.months > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: fin.rate ? 1 : 0, borderBottomColor: theme.badgeBorder }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="calendar-outline" size={18} color="#1D4ED8" />
                <Text style={{ color: theme.text, fontSize: 14 }}>Cuota Mensual</Text>
              </View>
              <Text style={{ color: "#1D4ED8", fontWeight: "800", fontSize: 16 }}>
                {fin.months}x {sym} {quota > 0 ? quota.toLocaleString("es-AR") : "—"}
              </Text>
            </View>
          )}

          {/* Rate row */}
          {fin.type !== "sin_interes" && fin.rate != null && fin.rate > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="trending-up-outline" size={18} color={theme.textMuted} />
                <Text style={{ color: theme.text, fontSize: 14 }}>Tasa Anual</Text>
              </View>
              <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14 }}>{fin.rate}%</Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={[styles.ctaButton, { marginTop: 16 }]} onPress={handleContact}>
          <Text style={styles.ctaButtonText}>Consultar financiación</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderFotos = () => (
    <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Galería de Fotos</Text>
        
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {images.map((img, i) => (
                <TouchableOpacity key={i} onPress={() => {
                    // Find the index in heroItems to open the viewer correctly
                    const idx = heroItems.findIndex(h => h.uri === img && h.type === 'image');
                    if (idx !== -1) {
                        setViewerIndex(idx);
                        setViewerVisible(true);
                    }
                }}>
                    <Image source={{ uri: img }} style={{ width: (Dimensions.get("window").width - 60) / 3, height: (Dimensions.get("window").width - 60) / 3, borderRadius: 8, backgroundColor: theme.inputBackground }} />
                </TouchableOpacity>
            ))}
            {images.length === 0 && <Text style={styles.mutedText}>No hay fotos disponibles.</Text>}
        </View>
    </View>
  );

  const renderVideo = () => {
    if (!vehicle.video) return (
        <View style={styles.sectionCard}>
            <Text style={styles.mutedText}>No hay video disponible.</Text>
        </View>
    );
    
    return (
        <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Video</Text>
            <View style={{ alignItems: 'center' }}>
                <View style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: '#000', width: '65%', aspectRatio: 9/16 }}>
                    <ReplayableVideo
                        uri={vehicle.video}
                        style={{ width: '100%', height: '100%' }}
                        useNativeControls
                        resizeMode={ResizeMode.CONTAIN}
                        shouldPlay={true}
                        isMuted={true}
                    />
                </View>
            </View>
        </View>
    );
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case "resumen": return renderResumen();
      case "ficha": return renderFichaTecnica();
      case "financiacion": return renderFinanciacion();
      case "fotos": return renderFotos();
      case "video": return renderVideo();
      default: return renderResumen();
    }
  };

  const handleGenerateDescription = async () => {
    if (!profile?.plan || !['pro_plus', 'pro_dealer'].some(p => profile.plan.includes(p))) {
        showAlert("Función Premium", "La generación de descripción con IA es exclusiva para usuarios Pro Plus o superiores. ¡Mejorá tu plan para acceder!", "info", () => router.push("/(screens)/subscribe"));
        return;
    }

    // Use vehicle data if editState is missing it (fallback)
    const brand = editState.brand || vehicle?.brand;
    const model = editState.model || vehicle?.model;
    const year = editState.year || vehicle?.year;

    if (!brand || !model || !year) {
        showAlert("Datos incompletos", "Necesitamos al menos Marca, Modelo y Año para generar la descripción.", "warning");
        return;
    }

    setEditState({ ...editState, aiLoading: true });
    try {
        // Mock AI generation for now - In a real app this would call an API
        // Using a comprehensive template based on available data
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate network delay
        
        const specs = [
            editState.version || vehicle?.version ? `Versión ${editState.version || vehicle?.version}` : '',
            editState.engine || vehicle?.engine ? `Motor ${editState.engine || vehicle?.engine}` : '',
            editState.gearbox || vehicle?.gearbox ? `Caja ${editState.gearbox || vehicle?.gearbox}` : '',
            editState.fuelType || vehicle?.fuelType ? `Combustible ${editState.fuelType || vehicle?.fuelType}` : '',
            (editState.km || vehicle?.km) ? `${formatNumber(editState.km || vehicle?.km)} km` : ''
        ].filter(Boolean).join(' - ');

        const features = editState.featuresText || vehicle?.features?.join(', ')
            ? `\n\nEquipamiento destacado:\n${(editState.featuresText || vehicle?.features?.join(', ')).split(',').map((f: string) => `• ${f.trim()}`).join('\n')}`
            : '';

        const generatedDesc = `¡Imperdible ${brand} ${model} ${year}!\n\n${specs}\n${features}\n\nEl vehículo se encuentra en excelentes condiciones. Papeles al día, listo para transferir.`;
        
        setEditState({ ...editState, description: generatedDesc, aiLoading: false });
        showAlert("Descripción Generada", "Se ha generado una nueva descripción con IA. Podés editarla si lo deseas.", "success");
    } catch (error) {
        console.error("Error generating description:", error);
        showAlert("Error", "No se pudo generar la descripción.", "error");
        setEditState({ ...editState, aiLoading: false });
    }
  };

  const renderEditActiveTab = () => {
    switch (activeTab) {
      case "resumen":
        return (
            <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Editar Resumen</Text>
                
                <Text style={styles.specLabel}>Descripción Detallada</Text>
                <View style={{ marginBottom: 12 }}>
                    <TouchableOpacity 
                        onPress={handleGenerateDescription}
                        style={{ 
                            flexDirection: 'row', 
                            alignItems: 'center', 
                            backgroundColor: theme.card, 
                            padding: 8, 
                            borderRadius: 8, 
                            borderWidth: 1, 
                            borderColor: theme.accent,
                            alignSelf: 'flex-start',
                            marginBottom: 8
                        }}
                    >
                        {editState.aiLoading ? (
                            <ActivityIndicator size="small" color={theme.accent} style={{ marginRight: 6 }} />
                        ) : (
                            <Ionicons name="sparkles" size={16} color={theme.accent} style={{ marginRight: 6 }} />
                        )}
                        <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 12 }}>
                            {editState.aiLoading ? "Generando..." : "Generar con IA (Pro)"}
                        </Text>
                    </TouchableOpacity>
                    <TextInput
                        style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
                        value={editState.description}
                        onChangeText={(t) => setEditState({...editState, description: t})}
                        multiline
                        placeholder="Descripción completa del vehículo..."
                        inputAccessoryViewID="doneAccessory"
                    />
                </View>

                <Text style={styles.specLabel}>Precio</Text>
                <TextInput
                    style={styles.input}
                    value={formatNumber(editState.price)}
                    onChangeText={(t) => setEditState({...editState, price: parseNumber(t)})}
                    keyboardType="numeric"
                    placeholder="Precio"
                    inputAccessoryViewID="doneAccessory"
                    returnKeyType="done"
                />

                <Text style={[styles.specLabel, { marginTop: 12 }]}>Kilómetros</Text>
                <TextInput
                    style={styles.input}
                    value={formatNumber(editState.km)}
                    onChangeText={(t) => setEditState({...editState, km: parseNumber(t)})}
                    keyboardType="numeric"
                    placeholder="KM"
                    inputAccessoryViewID="doneAccessory"
                    returnKeyType="done"
                />

                <Text style={[styles.specLabel, { marginTop: 12 }]}>Ubicación</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity 
                        style={[styles.input, { flex: 1 }]} 
                        onPress={() => setEditState({...editState, provinceOpen: true})}
                    >
                        <Text style={{ color: editState.province ? theme.text : theme.textMuted }}>
                            {editState.province || "Provincia"}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.input, { flex: 1 }]} 
                        onPress={() => {
                            if (!editState.province) {
                                showAlert("Primero selecciona una provincia", "Debes elegir una provincia para ver las ciudades.", "info");
                            } else {
                                setEditState({...editState, cityOpen: true});
                            }
                        }}
                    >
                        <Text style={{ color: editState.city ? theme.text : theme.textMuted }}>
                            {editState.city || "Ciudad"}
                        </Text>
                    </TouchableOpacity>
                </View>

                <SelectionModal
                    visible={!!editState.provinceOpen}
                    title="Seleccionar Provincia"
                    options={PROVINCES}
                    onSelect={(val) => setEditState({...editState, province: val, city: "", provinceOpen: false})}
                    onClose={() => setEditState({...editState, provinceOpen: false})}
                    value={editState.province}
                    searchable={true}
                />

                <SelectionModal
                    visible={!!editState.cityOpen}
                    title="Seleccionar Ciudad"
                    options={citiesList}
                    onSelect={(val) => setEditState({...editState, city: val, cityOpen: false})}
                    onClose={() => setEditState({...editState, cityOpen: false})}
                    value={editState.city}
                    searchable={true}
                />

                <Text style={[styles.specLabel, { marginTop: 12 }]}>Motivo de venta</Text>
                <TouchableOpacity onPress={() => setEditState({...editState, sellingReasonOpen: true})} style={styles.input}>
                    <Text style={{ color: theme.text }}>{editState.sellingReason || "Seleccionar motivo"}</Text>
                </TouchableOpacity>
                <SelectionModal
                    visible={!!editState.sellingReasonOpen}
                    title="Seleccionar Motivo"
                    options={["Cambio de auto", "Necesidad económica", "Poco uso", "Urgente", "Otro"]}
                    onSelect={(val) => setEditState({...editState, sellingReason: val})}
                    onClose={() => setEditState({...editState, sellingReasonOpen: false})}
                    value={editState.sellingReason}
                    variant="inline"
                    searchable={false}
                />

                <Text style={[styles.specLabel, { marginTop: 12, marginBottom: 8 }]}>Opciones de Venta</Text>
                {[
                    { label: "Precio Charlable", key: "negotiablePrice" },
                    { label: "Entrega Inmediata", key: "immediateDelivery" },
                    { label: "Acepta Permuta", key: "acceptsTradeIn" },
                ].map((opt) => (
                    <View key={opt.key} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <Text style={{ color: theme.text }}>{opt.label}</Text>
                        <Switch
                            value={!!editState[opt.key]}
                            onValueChange={(v) => setEditState({...editState, [opt.key]: v})}
                            trackColor={{ false: theme.inputBackground, true: theme.accent }}
                        />
                    </View>
                ))}

                <Text style={[styles.specLabel, { marginTop: 12, marginBottom: 8 }]}>Historial y Documentación</Text>
                {[
                    { label: "Único dueño", key: "singleOwner" },
                    { label: "Service oficiales", key: "serviceRecords" },
                    { label: "VTV al día", key: "vtvValid" },
                    { label: "Papeles al día", key: "papersUpToDate" },
                    { label: "En garantía", key: "warranty" },
                ].map((opt) => (
                    <View key={opt.key} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <Text style={{ color: theme.text }}>{opt.label}</Text>
                        <Switch
                            value={!!editState[opt.key]}
                            onValueChange={(v) => setEditState({...editState, [opt.key]: v})}
                            trackColor={{ false: theme.inputBackground, true: theme.accent }}
                        />
                    </View>
                ))}
            </View>
        );
      case "ficha":
        return (
            <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Editar Ficha Técnica</Text>
                
                <Text style={styles.specLabel}>Combustible</Text>
                <TouchableOpacity onPress={() => setEditState({...editState, fuelOpen: true})} style={styles.input}>
                    <Text style={{ color: editState.fuelType ? theme.text : theme.textMuted }}>{editState.fuelType || "Seleccionar"}</Text>
                </TouchableOpacity>
                <SelectionModal
                    visible={!!editState.fuelOpen}
                    title="Combustible"
                    options={fuelOptions}
                    onSelect={(val) => setEditState({...editState, fuelType: val, fuelOpen: false})}
                    onClose={() => setEditState({...editState, fuelOpen: false})}
                    value={editState.fuelType}
                    variant="inline"
                />

                <Text style={[styles.specLabel, { marginTop: 12 }]}>Transmisión</Text>
                <TouchableOpacity onPress={() => setEditState({...editState, gearboxOpen: true})} style={styles.input}>
                    <Text style={{ color: editState.gearbox ? theme.text : theme.textMuted }}>{editState.gearbox || "Seleccionar"}</Text>
                </TouchableOpacity>
                <SelectionModal
                    visible={!!editState.gearboxOpen}
                    title="Transmisión"
                    options={gearboxOptions}
                    onSelect={(val) => setEditState({...editState, gearbox: val, gearboxOpen: false})}
                    onClose={() => setEditState({...editState, gearboxOpen: false})}
                    value={editState.gearbox}
                    variant="inline"
                />

                <Text style={[styles.specLabel, { marginTop: 12 }]}>Motor</Text>
                <TextInput
                    style={styles.input}
                    value={editState.engine}
                    onChangeText={(t) => setEditState({...editState, engine: t})}
                    placeholder="Ej: 1.6 16v"
                    inputAccessoryViewID="doneAccessory"
                />

                <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.specLabel}>Airbags</Text>
                        <TextInput
                            style={styles.input}
                            value={editState.airbags}
                            onChangeText={(t) => setEditState({...editState, airbags: t})}
                            keyboardType="numeric"
                            placeholder="Cant."
                            inputAccessoryViewID="doneAccessory"
                        />
                    </View>
                    <View style={{ flex: 1 }}>
                         <Text style={styles.specLabel}>Levantavidrios</Text>
                         <TextInput
                            style={styles.input}
                            value={editState.windowsAuto}
                            onChangeText={(t) => setEditState({...editState, windowsAuto: t})}
                            keyboardType="numeric"
                            placeholder="Cant."
                            inputAccessoryViewID="doneAccessory"
                        />
                    </View>
                </View>
                
                <Text style={[styles.specLabel, { marginTop: 12 }]}>Dirección</Text>
                <TextInput
                    style={styles.input}
                    value={editState.wheelType}
                    onChangeText={(t) => setEditState({...editState, wheelType: t})}
                    placeholder="Ej: Asistida, Hidráulica"
                    inputAccessoryViewID="doneAccessory"
                />

                <Text style={[styles.specLabel, { marginTop: 12 }]}>Equipamiento (separado por comas)</Text>
                <TextInput
                    style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                    value={editState.featuresText}
                    onChangeText={(t) => setEditState({...editState, featuresText: t})}
                    multiline
                    placeholder="Ej: Aire acondicionado, Dirección asistida, ..."
                    inputAccessoryViewID="doneAccessory"
                />
            </View>
        );
      case "financiacion": {
        const sym = editState.currency || vehicle?.currency || "ARS";
        const previewDP = editState.finDownPayment ? Number(editState.finDownPayment) : 0;
        const previewMonths = editState.finMonths ? Number(editState.finMonths) : 0;
        const previewRate = editState.finType === "sin_interes" ? 0 : (editState.finRate ? Number(editState.finRate) : 0);
        const previewPrice = editState.price ? Number(editState.price) : Number(vehicle?.price ?? 0);
        const previewPmt = previewPrice && previewMonths ? calcPMT(previewPrice, previewDP, previewRate, previewMonths) : 0;
        return (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Editar Financiación</Text>

            {/* Toggle */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ color: theme.text, fontWeight: "600" }}>Acepta Financiación</Text>
              <Switch
                value={!!editState.acceptsFinancing}
                onValueChange={(v) => setEditState({ ...editState, acceptsFinancing: v })}
                trackColor={{ false: theme.inputBackground, true: theme.accent }}
              />
            </View>

            {editState.acceptsFinancing && (
              <View style={{ gap: 16 }}>
                {/* Anticipo */}
                <View>
                  <Text style={styles.specLabel}>Anticipo ({sym === "USD" ? "USD" : "$"})</Text>
                  <TextInput
                    style={styles.input}
                    value={editState.finDownPayment}
                    onChangeText={(t) => setEditState({ ...editState, finDownPayment: t.replace(/\D/g, '') })}
                    keyboardType="numeric"
                    placeholder="Ej: 5000000"
                    inputAccessoryViewID="doneAccessory"
                  />
                  {previewDP > 0 && previewPrice > 0 && (
                    <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 3 }}>
                      {((previewDP / previewPrice) * 100).toFixed(1)}% del precio
                    </Text>
                  )}
                </View>

                {/* Tipo de financiación */}
                <View>
                  <Text style={styles.specLabel}>Tipo de Financiación</Text>
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    {[
                      { v: "propio", l: "Propia" },
                      { v: "banco", l: "Banco" },
                      { v: "sin_interes", l: "0% Interés" },
                    ].map(opt => (
                      <TouchableOpacity
                        key={opt.v}
                        onPress={() => setEditState({ ...editState, finType: editState.finType === opt.v ? "" : opt.v })}
                        style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: editState.finType === opt.v ? theme.accent : theme.badgeBorder, backgroundColor: editState.finType === opt.v ? theme.accent + "20" : "transparent" }}
                      >
                        <Text style={{ fontSize: 13, color: editState.finType === opt.v ? theme.accent : theme.text, fontWeight: editState.finType === opt.v ? "700" : "400" }}>{opt.l}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Entidad (solo banco) */}
                {editState.finType === "banco" && (
                  <View>
                    <Text style={styles.specLabel}>Entidad Bancaria</Text>
                    <TextInput
                      style={styles.input}
                      value={editState.finEntity}
                      onChangeText={(t) => setEditState({ ...editState, finEntity: t })}
                      placeholder="Ej: Banco Nación"
                      inputAccessoryViewID="doneAccessory"
                    />
                  </View>
                )}

                {/* Plazo */}
                <View>
                  <Text style={styles.specLabel}>Plazo Máximo</Text>
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    {[12, 24, 36, 48, 60].map(m => (
                      <TouchableOpacity
                        key={m}
                        onPress={() => setEditState({ ...editState, finMonths: String(m) })}
                        style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: editState.finMonths === String(m) ? theme.accent : theme.badgeBorder, backgroundColor: editState.finMonths === String(m) ? theme.accent + "20" : "transparent" }}
                      >
                        <Text style={{ fontSize: 13, color: editState.finMonths === String(m) ? theme.accent : theme.text, fontWeight: editState.finMonths === String(m) ? "700" : "400" }}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Tasa (no sin_interes) */}
                {editState.finType !== "sin_interes" && (
                  <View>
                    <Text style={styles.specLabel}>Tasa Anual (%)</Text>
                    <TextInput
                      style={styles.input}
                      value={editState.finRate}
                      onChangeText={(t) => setEditState({ ...editState, finRate: t })}
                      keyboardType="numeric"
                      placeholder="Ej: 45"
                      inputAccessoryViewID="doneAccessory"
                    />
                  </View>
                )}

                {/* Preview */}
                {previewMonths > 0 && previewPmt > 0 && (
                  <View style={{ alignItems: "center", padding: 12, backgroundColor: theme.badgeBackground, borderRadius: 12 }}>
                    <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>Vista previa cuota mensual</Text>
                    <Text style={{ fontSize: 20, fontWeight: "800", color: theme.accent }}>
                      {previewMonths}x {sym === "USD" ? "USD" : "$"} {previewPmt.toLocaleString("es-AR")}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        );
      }
      case "fotos":
        return (
            <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Administrar Fotos</Text>
                
                <Text style={styles.specLabel}>Foto de Portada</Text>
                <View style={{ marginBottom: 16 }}>
                    {editState.cover ? (
                        <View>
                            <Image source={{ uri: editState.cover }} style={{ width: "100%", height: 200, borderRadius: 8, marginBottom: 8 }} resizeMode="cover" />
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TouchableOpacity onPress={() => handlePickImage("cover")} style={[styles.input, { flex: 1, alignItems: 'center' }]}>
                                    <Text style={{ color: theme.text }}>Cambiar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => handleDeleteImage("cover")} style={[styles.input, { flex: 1, alignItems: 'center', borderColor: theme.error }]}>
                                    <Text style={{ color: theme.error }}>Eliminar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                         <TouchableOpacity onPress={() => handlePickImage("cover")} style={[styles.mapPlaceholder, { height: 120 }]}>
                            <Ionicons name="camera" size={32} color={theme.textMuted} />
                            <Text style={styles.mapPlaceholderText}>Subir portada</Text>
                         </TouchableOpacity>
                    )}
                </View>

                <Text style={styles.specLabel}>Galería ({editState.gallery.length}/8)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {editState.gallery.map((img: string, i: number) => (
                        <View key={i} style={{ position: 'relative' }}>
                            <Image source={{ uri: img }} style={{ width: (screenWidth - 60) / 3, height: (screenWidth - 60) / 3, borderRadius: 8 }} />
                            <TouchableOpacity 
                                onPress={() => handleDeleteImage("gallery", i)}
                                style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, padding: 4 }}
                            >
                                <Ionicons name="close" size={12} color="#FFF" />
                            </TouchableOpacity>
                        </View>
                    ))}
                    {editState.gallery.length < 8 && (
                        <TouchableOpacity 
                            onPress={() => handlePickImage("gallery")}
                            style={{ 
                                width: (screenWidth - 60) / 3, 
                                height: (screenWidth - 60) / 3, 
                                borderRadius: 8, 
                                borderWidth: 1, 
                                borderColor: theme.badgeBorder,
                                borderStyle: 'dashed',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <Ionicons name="add" size={32} color={theme.textMuted} />
                        </TouchableOpacity>
                    )}
                </View>
                {editState.imagesUploading && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                        <ActivityIndicator size="small" color={theme.accent} style={{ marginRight: 8 }} />
                        <Text style={{ color: theme.textMuted }}>Subiendo imágenes...</Text>
                    </View>
                )}
            </View>
        );
      case "video":
        return (
            <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Administrar Video</Text>
                
                {editState.video ? (
                    <View style={{ alignItems: 'center' }}>
                        <View style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: '#000', width: '65%', aspectRatio: 9/16, marginBottom: 12 }}>
                            <ReplayableVideo
                                uri={editState.video}
                                style={{ width: '100%', height: '100%' }}
                                useNativeControls
                                resizeMode={ResizeMode.CONTAIN}
                                shouldPlay={false}
                                isMuted={true}
                            />
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
                            <TouchableOpacity onPress={handlePickVideo} style={[styles.input, { flex: 1, alignItems: 'center' }]}>
                                <Text style={{ color: theme.text }}>Cambiar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleDeleteVideo} style={[styles.input, { flex: 1, alignItems: 'center', borderColor: theme.error }]}>
                                <Text style={{ color: theme.error }}>Eliminar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <TouchableOpacity onPress={handlePickVideo} style={[styles.mapPlaceholder, { height: 200 }]}>
                        <Ionicons name="videocam" size={32} color={theme.textMuted} />
                        <Text style={styles.mapPlaceholderText}>Subir video</Text>
                    </TouchableOpacity>
                )}
                
                {editState.imagesUploading && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                        <ActivityIndicator size="small" color={theme.accent} style={{ marginRight: 8 }} />
                        <Text style={{ color: theme.textMuted }}>Subiendo video...</Text>
                    </View>
                )}
            </View>
        );
      default:
        return (
            <View style={styles.sectionCard}>
                <Text style={styles.mutedText}>Edición no disponible para esta sección.</Text>
            </View>
        );
    }
  };

  const handleDeleteVehicle = () => {
    showAlert(
      "Eliminar publicación",
      "¿Estás seguro de que querés eliminar esta publicación? Esta acción no se puede deshacer.",
      "warning",
      async () => {
        if (!vehicle?.id) return;
        try {
          setLoading(true);

          // Delete video if exists
          if (vehicle.video) {
              try {
                  const videoRef = ref(storage, vehicle.video);
                  await deleteObject(videoRef);
              } catch (e) {
                  console.error("Error deleting video file:", e);
                  // Continue with vehicle deletion anyway
              }
          }

          const docRef = doc(db, "vehicles", vehicle.id);
          await updateDoc(docRef, { 
            status: "deleted",
            updatedAt: serverTimestamp() 
          });
          showAlert("Eliminado", "La publicación ha sido eliminada.", "success", () => {
            router.replace("/(tabs)/mycars");
          });
        } catch (error) {
          console.error("Error deleting vehicle:", error);
          showAlert("Error", "No se pudo eliminar la publicación.", "error");
          setLoading(false);
        }
      },
      true,
      () => {},
      "Eliminar",
      "Cancelar"
    );
  };

  const handleGeneratePDF = async () => {
    if (!vehicle) return;
    
    // Check if user is owner (redundant if button is hidden, but good for safety)
    if (!user || user.uid !== vehicle.userId) {
        return;
    }

    // Check Plan Access for PDF export
    const hasAccess = profile?.role === 'admin' || canExportPDF(profile?.plan || "");

    if (!hasAccess) {
        showAlert(
            "Función Premium",
            "Generar la ficha PDF con QR es exclusivo para planes Pro Plus o superiores. ¡Mejorá tu plan para acceder!",
            "info",
            () => router.push("/(screens)/subscribe"), // Redirect to subscribe
            true,
            () => {},
            "Ver Planes",
            "Cancelar"
        );
        return;
    }
    
    // Generar PDF con QR para imprimir
    try {
        const qrData = `https://matchcars.app/car/${vehicle.id}`;
        // Use a reliable QR code API
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`;

        const html = `
          <html>
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
              <style>
                @page { margin: 0; size: A4; }
                body { 
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
                    padding: 20px; 
                    text-align: center; 
                    background-color: #fff;
                    margin: 0;
                    box-sizing: border-box;
                    width: 100%;
                    height: 100%;
                }
                .container {
                    max-width: 700px;
                    margin: 0 auto;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                }
                .header { margin-bottom: 15px; }
                .logo { font-size: 20px; font-weight: bold; color: #9013FE; margin-bottom: 5px; }
                .title { font-size: 26px; font-weight: bold; color: #333; margin: 5px 0; }
                .price { font-size: 36px; font-weight: bold; color: #9013FE; margin: 10px 0; }
                .image-container { 
                    width: 100%; 
                    max-width: 500px;
                    height: 300px; 
                    margin-bottom: 20px; 
                    border-radius: 16px; 
                    overflow: hidden;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
                .image-container img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .specs { 
                    display: flex; 
                    justify-content: space-around; 
                    width: 100%;
                    max-width: 600px;
                    margin-bottom: 30px; 
                    padding: 15px; 
                    background-color: #f8f8f8; 
                    border-radius: 12px; 
                }
                .spec-item { text-align: center; }
                .spec-value { font-size: 20px; font-weight: bold; color: #333; }
                .spec-label { font-size: 12px; color: #666; text-transform: uppercase; margin-top: 5px; }
                .qr-section { 
                    margin-top: 20px; 
                    padding-top: 20px; 
                    border-top: 2px dashed #ddd; 
                    width: 100%;
                    max-width: 500px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                .qr-code { width: 150px; height: 150px; margin-bottom: 10px; }
                .cta { font-size: 18px; font-weight: bold; color: #333; margin-bottom: 5px; }
                .footer { margin-top: 20px; color: #999; font-size: 12px; }
              </style>
            </head>
            <body>
              <div class="container">
                  <div class="logo">MatchCars</div>
                  <div class="header">
                    <div class="title">${vehicle.brand} ${vehicle.model} ${vehicle.year}</div>
                    ${vehicle.publicationCode ? `<div style="color:#999;font-size:14px;">Publicación #${vehicle.publicationCode}</div>` : ""}
                    <div class="price">${vehicle.currency} ${Number(vehicle.price).toLocaleString("es-AR")}</div>
                  </div>
                  
                  <div class="image-container">
                    <img src="${vehicle.images?.cover || vehicle.coverImage || vehicle.cover || "https://placehold.co/600x400?text=Sin+Foto"}" alt="Auto" />
                  </div>
                  
                  <div class="specs">
                    <div class="spec-item">
                      <div class="spec-value">${vehicle.km?.toLocaleString("es-AR") || "0"}</div>
                      <div class="spec-label">Kilómetros</div>
                    </div>
                    <div class="spec-item">
                      <div class="spec-value">${vehicle.year}</div>
                      <div class="spec-label">Año</div>
                    </div>
                    <div class="spec-item">
                      <div class="spec-value">${vehicle.fuelType || vehicle.fuel || "-"}</div>
                      <div class="spec-label">Combustible</div>
                    </div>
                  </div>

                  <div class="qr-section">
                    <img src="${qrUrl}" class="qr-code" />
                    <div class="cta">¡Escaneá para ver más fotos y detalles!</div>
                    <div class="footer">Publicado en MatchCars App</div>
                  </div>
              </div>
            </body>
          </html>
        `;

        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) {
        console.error("PDF Error:", error);
        showAlert("Error", "No se pudo generar el PDF.", "error");
    }
  };

  const handleShare = async () => {
    if (!vehicle) return;
    
    // Generamos el link con el esquema personalizado (matchcars://car/ID)
    // Esto permitirá abrir la app directamente si se tiene instalada.
    
    // Link Web Universal (https://matchcars.app/car/ID)
    // Al tener configurado Universal Links, este link abrirá la app si está instalada,
    // o llevará a la landing page si no lo está.
    const webLink = `https://matchcars.app/car/${vehicle.id}`;
    
    const headline = displayTitle;
    const downloadLinks = `\n\n📲 Android: https://play.google.com/store/apps/details?id=com.matchcars.app\n🍏 iOS: https://apps.apple.com/app/id6757968664`;
    const message = `¡Mirá este auto en MatchCars!\n\n${headline}\n${priceText}\n\nVer publicación: ${webLink}`;

    try {
      if (Platform.OS === 'ios') {
        await Share.share({
          message: message + downloadLinks,
          url: webLink
        });
      } else {
        await Share.share({
          message: `${message}${downloadLinks}`,
          title: 'MatchCars',
        });
      }
    } catch {
    }
  };

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={`https://matchcars.app/car/${normalizedId}`} />
        {vehicleStructuredData && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(vehicleStructuredData),
            }}
          />
        )}
      </Head>
    <SafeAreaView style={styles.container}>
      {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID="doneAccessory">
            <View style={{ backgroundColor: theme.card, flexDirection: 'row', justifyContent: 'flex-end', padding: 10, borderTopWidth: 1, borderColor: theme.border }}>
               <TouchableOpacity onPress={() => Keyboard.dismiss()} style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                   <Text style={{ color: theme.accent, fontWeight: "600", fontSize: 16 }}>Listo</Text>
               </TouchableOpacity>
            </View>
          </InputAccessoryView>
      )}
      <WebContainer>
      <View style={styles.topActions}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backPill}>
          <Text style={styles.backPillText}>← Volver</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={handleGoHome} style={styles.homePill}>
                <Ionicons name="home" size={18} color={theme.text} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShareSheetVisible(true)} style={styles.homePill}>
                <Ionicons name="share-social-outline" size={18} color={theme.text} />
            </TouchableOpacity>

            {user && user.uid === vehicle.userId && (
                <>
                    {editing && (
                        <TouchableOpacity onPress={handleDeleteVehicle} style={[styles.homePill, { backgroundColor: theme.error + '20' }]}>
                            <Ionicons name="trash-outline" size={18} color={theme.error} />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={handleGeneratePDF} style={styles.homePill}>
                        <Ionicons name="document-outline" size={18} color={theme.text} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setEditing(!editing)} style={styles.editPill}>
                        <Text style={styles.editPillText}>{editing ? "Cancelar" : "Editar"}</Text>
                    </TouchableOpacity>
                </>
            )}
        </View>
      </View>

      <View style={{ flex: 1 }}>
      <KeyboardAwareScrollView 
          style={styles.scrollArea} 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={{ paddingBottom: 120 }}
          enableOnAndroid={true}
          extraScrollHeight={Platform.OS === 'ios' ? 20 : 0}
          keyboardShouldPersistTaps="handled"
      >
          {editing && vehicle?.status === "rejected" && (
            <View style={{ marginHorizontal: 12, marginBottom: 8, padding: 10, borderRadius: 10, backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA" }}>
              <Text style={{ color: "#B91C1C", fontWeight: "700", marginBottom: 4 }}>
                Publicación rechazada
              </Text>
              {vehicle.rejectionReason ? (
                <Text style={{ color: "#7F1D1D", fontSize: 13 }}>
                  Motivo: {vehicle.rejectionReason}
                </Text>
              ) : (
                <Text style={{ color: "#7F1D1D", fontSize: 13 }}>
                  Revisá los datos y ajustá el precio para reenviar a revisión.
                </Text>
              )}
            </View>
          )}
          <View style={styles.heroContainer}>
              {heroItems.length > 0 ? (
                  <ScrollView
                    ref={heroScrollRef}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={(e) => {
                        const newIndex = Math.round(e.nativeEvent.contentOffset.x / heroWidth);
                        setActiveHeroIndex(newIndex);
                    }}
                  >
                    {heroItems.map((item, idx) => (
                        <View 
                            key={idx} 
                            style={{ width: heroWidth, height: heroHeight, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}
                        >
                            {item.type === 'video' ? (
                                <ReplayableVideo
                                    uri={item.uri}
                                    style={{ width: '100%', height: '100%' }}
                                    useNativeControls
                                    resizeMode={ResizeMode.COVER}
                                    shouldPlay={activeHeroIndex === idx}
                                    isMuted={true}
                                />
                            ) : (
                                <TouchableOpacity 
                                    activeOpacity={0.9} 
                                    onPress={() => {
                                        // Find index in original images array for viewer
                                        const imgIdx = images.indexOf(item.uri);
                                        if (imgIdx >= 0) {
                                            setViewerIndex(imgIdx);
                                            setViewerVisible(true);
                                        }
                                    }}
                                    style={{ width: '100%', height: '100%' }}
                                >
                                    <Image 
                                        source={{ uri: item.uri }} 
                                        style={{ width: '100%', height: '100%', resizeMode: "cover" }} 
                                    />
                                </TouchableOpacity>
                            )}
                        </View>
                    ))}
                  </ScrollView>
              ) : (
                  <View style={styles.heroPlaceholder}>
                      <Ionicons name="car-sport" size={48} color={theme.textMuted} />
                      <Text style={styles.heroPlaceholderText}>Sin foto de portada</Text>
                  </View>
              )}
              {heroItems.length > 1 && (
                  <View style={{ position: "absolute", bottom: 12, right: 12, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                      <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "700" }}>
                          +{heroItems.length} MEDIA
                      </Text>
                  </View>
              )}
              {Platform.OS === 'web' && heroItems.length > 1 && (
                  <>
                      {activeHeroIndex > 0 && (
                          <TouchableOpacity
                              activeOpacity={0.8}
                              accessibilityLabel="Foto anterior"
                              onPress={() => {
                                  const newIndex = Math.max(0, activeHeroIndex - 1);
                                  heroScrollRef.current?.scrollTo({ x: newIndex * heroWidth, y: 0, animated: true });
                                  setActiveHeroIndex(newIndex);
                              }}
                              style={{ position: "absolute", left: 10, top: "50%", marginTop: -18, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}
                          >
                              <Ionicons name="chevron-back" size={22} color="#FFF" />
                          </TouchableOpacity>
                      )}
                      {activeHeroIndex < heroItems.length - 1 && (
                          <TouchableOpacity
                              activeOpacity={0.8}
                              accessibilityLabel="Foto siguiente"
                              onPress={() => {
                                  const newIndex = Math.min(heroItems.length - 1, activeHeroIndex + 1);
                                  heroScrollRef.current?.scrollTo({ x: newIndex * heroWidth, y: 0, animated: true });
                                  setActiveHeroIndex(newIndex);
                              }}
                              style={{ position: "absolute", right: 10, top: "50%", marginTop: -18, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}
                          >
                              <Ionicons name="chevron-forward" size={22} color="#FFF" />
                          </TouchableOpacity>
                      )}
                  </>
              )}
              {heroItems.length > 1 && (
                  <View style={{ position: "absolute", bottom: 12, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 4 }}>
                      {heroItems.map((_, idx) => (
                          <View
                              key={idx}
                              style={{
                                  width: idx === activeHeroIndex ? 14 : 6,
                                  height: 6,
                                  borderRadius: 3,
                                  backgroundColor: idx === activeHeroIndex ? "#FFFFFF" : "rgba(255,255,255,0.5)",
                              }}
                          />
                      ))}
                  </View>
              )}
              <View style={styles.heroOverlay}>
                  <Text style={styles.heroTitle} numberOfLines={1}>{displayTitle}</Text>
                  <Text style={styles.heroPrice}>{priceText}</Text>
              </View>

              {!isOwner && Platform.OS !== 'web' && (
                   <TouchableOpacity 
                     onPress={toggleFavorite} 
                     hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                     style={{ 
                         position: 'absolute', 
                         bottom: 12, 
                         left: 12, 
                         backgroundColor: 'rgba(0,0,0,0.4)', 
                         borderRadius: 999, 
                         padding: 8,
                         zIndex: 50,
                         elevation: 10
                     }}
                   >
                       <Ionicons 
                         name={favoriteIds.includes(vehicle?.id) ? "heart" : "heart-outline"} 
                         size={22} 
                         color={favoriteIds.includes(vehicle?.id) ? "#ef4444" : "#FFF"} 
                       />
                   </TouchableOpacity>
               )}
          </View>

          {null}

          {isOwner && showMetrics && !isSold && !hideRecommendation && effectiveAvg > 0 && Number(vehicle.price) > effectiveAvg && (
            <View>
                {null}
                <PriceRecommendation
                    currentPrice={Number(vehicle.price)}
                    avgPrice={effectiveAvg}
                    currency={vehicle.currency || "ARS"}
                    onLowerPrice={handleQuickPriceUpdate}
                    onIgnore={() => setHideRecommendation(true)}
                />
            </View>
          )}

      <View style={styles.tabsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScrollContent}
        >
          {(() => {
              const tabs: CarDetailsTabs[] = ["resumen", "ficha", "financiacion", "fotos", "video"];
              
              return tabs.map((t) => (
                  <TouchableOpacity
                      key={t}
                      style={[styles.tabChip, activeTab === t && styles.tabChipActive]}
                      onPress={() => setActiveTab(t)}
                  >
                      <Text style={[styles.tabChipText, activeTab === t && styles.tabChipTextActive]}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                      </Text>
                  </TouchableOpacity>
              ));
          })()}
        </ScrollView>
      </View>

          {editing ? renderEditActiveTab() : renderActiveTab()}
          
          {!editing && similarVehicles.length > 0 && (
              <View style={{ marginTop: 24, paddingHorizontal: 12 }}>
                  <Text style={styles.sectionTitle}>Vehículos similares</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 16 }}>
                      {similarVehicles.map(v => (
                          <View key={v.id} style={{ width: 280 }}>
                              <CarCard 
                                vehicle={v} 
                                compact 
                                hideLike={Platform.OS === 'web'} 
                                hideCompare={Platform.OS === 'web'} 
                              />
                          </View>
                      ))}
                  </ScrollView>
              </View>
          )}
          
          <View style={{ height: 40 }} />
      </KeyboardAwareScrollView>
      </View>

      {/* Sticky bottom CTA bar — visible to buyers on native */}
      {!editing && user && user.uid !== vehicle.userId && Platform.OS !== 'web' && (
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, borderTopWidth: 1, borderColor: theme.badgeBorder, backgroundColor: theme.card }}>
          {/* Compact offer status — no Modal inside, avoids conflicts */}
          {activeOffer && activeOffer.status !== "rejected" && activeOffer.status !== "withdrawn" && activeOffer.status !== "expired" && (() => {
            const isAccepted = activeOffer.status === "accepted";
            const isCountered = activeOffer.status === "countered";
            const offerStatusColor = isAccepted ? "#10B981" : isCountered ? "#6366F1" : "#F59E0B";
            const offerStatusLabel = isAccepted ? "Aceptada ✓" : isCountered ? "Contraoferta recibida" : "Pendiente de respuesta";
            // Show the negotiated amount (counter-offer takes precedence)
            const displayAmount = (isAccepted || isCountered) && activeOffer.counterAmount
              ? activeOffer.counterAmount : activeOffer.amount;
            const displayCurrency = (isAccepted || isCountered) && activeOffer.counterCurrency
              ? activeOffer.counterCurrency : activeOffer.currency;
            return (
              <View style={{ marginBottom: 10 }}>
                <TouchableOpacity
                  onPress={handleContact}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: offerStatusColor + "18", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: offerStatusColor + "44" }}
                >
                  <Ionicons name={isAccepted ? "checkmark-circle" : "pricetag"} size={14} color={offerStatusColor} />
                  <Text style={{ color: offerStatusColor, fontWeight: "700", fontSize: 12, flex: 1 }}>
                    {displayCurrency} {Number(displayAmount).toLocaleString("es-AR")} · {offerStatusLabel}
                  </Text>
                  <Text style={{ color: offerStatusColor, fontSize: 11 }}>Ver →</Text>
                </TouchableOpacity>
                {isAccepted && (
                  <TouchableOpacity
                    onPress={() => showAlert(
                      "Cancelar acuerdo",
                      "¿Estás seguro? Esto retirará la oferta y podrás volver a negociar.",
                      "warning",
                      handleWithdrawOffer,
                      true, undefined, "Sí, cancelar", "No"
                    )}
                    style={{ alignSelf: "flex-end", paddingTop: 6, paddingHorizontal: 4 }}
                  >
                    <Text style={{ color: theme.textMuted, fontSize: 11, textDecorationLine: "underline" }}>Cancelar acuerdo</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })()}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              disabled={isSold}
              style={{ flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: isSold ? theme.textMuted : theme.primary, alignItems: "center", opacity: isSold ? 0.6 : 1 }}
              onPress={() => !isSold && handleContact()}
            >
              <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 15 }}>{isSold ? "No disponible" : "Mensaje"}</Text>
            </TouchableOpacity>
            {!isSold && (!activeOffer || activeOffer.status === "rejected" || activeOffer.status === "withdrawn" || activeOffer.status === "expired") && (
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: "#10B981", alignItems: "center" }}
                onPress={() => setOfferModalVisible(true)}
              >
                <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 15 }}>Hacer oferta</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {editing && (
          <View style={{ padding: 12, borderTopWidth: 1, borderColor: theme.badgeBorder, backgroundColor: theme.card }}>
              <TouchableOpacity onPress={handleSaveEdits} style={[styles.ctaButton, { marginTop: 0 }]}>
                  <Text style={styles.ctaButtonText}>Guardar Cambios</Text>
              </TouchableOpacity>
          </View>
      )}
      </WebContainer>

      {loading && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' }]}>
            <ActivityIndicator size="large" color={theme.accent} />
        </View>
      )}

      <Modal visible={viewerVisible} transparent={true} animationType="fade" onRequestClose={() => setViewerVisible(false)}>
          <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center" }}>
              <ScrollView
                  ref={viewerScrollRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  contentOffset={{ x: viewerIndex * Dimensions.get("window").width, y: 0 }}
                  onMomentumScrollEnd={(e) => {
                      const idx = Math.round(e.nativeEvent.contentOffset.x / Dimensions.get("window").width);
                      setViewerIndex(idx);
                  }}
              >
                  {heroItems.map((item, idx) => (
                      <View key={idx} style={{ width: Dimensions.get("window").width, height: Dimensions.get("window").height, justifyContent: "center", alignItems: "center" }}>
                           {item.type === 'video' ? (
                               <View style={{ width: Dimensions.get("window").width, height: Dimensions.get("window").height, justifyContent: "center" }}>
                                   <ReplayableVideo
                                       uri={item.uri}
                                       style={{ width: '100%', height: '100%' }}
                                       useNativeControls
                                       resizeMode={ResizeMode.CONTAIN}
                                       shouldPlay={viewerIndex === idx}
                                       isMuted={true}
                                   />
                               </View>
                           ) : (
                               <ScrollView
                                  minimumZoomScale={1}
                                  maximumZoomScale={3}
                                  showsHorizontalScrollIndicator={false}
                                  showsVerticalScrollIndicator={false}
                                  contentContainerStyle={{ flex: 1, justifyContent: 'center' }}
                               >
                                  <Image 
                                      source={{ uri: item.uri }} 
                                      style={{ width: Dimensions.get("window").width, height: Dimensions.get("window").height * 0.8, resizeMode: "contain" }} 
                                  />
                               </ScrollView>
                           )}
                      </View>
                  ))}
              </ScrollView>
              
              <TouchableOpacity
                  style={{ position: "absolute", top: 40, right: 20, zIndex: 999, elevation: 10, padding: 8, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20 }}
                  onPress={() => setViewerVisible(false)}
              >
                  <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>

              {Platform.OS === 'web' && heroItems.length > 1 && (
                  <>
                      {viewerIndex > 0 && (
                          <TouchableOpacity
                              activeOpacity={0.8}
                              accessibilityLabel="Foto anterior"
                              onPress={() => {
                                  const newIndex = Math.max(0, viewerIndex - 1);
                                  viewerScrollRef.current?.scrollTo({ x: newIndex * Dimensions.get("window").width, y: 0, animated: true });
                                  setViewerIndex(newIndex);
                              }}
                              style={{ position: "absolute", left: 20, top: Dimensions.get("window").height / 2 - 22, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", zIndex: 999, elevation: 10 }}
                          >
                              <Ionicons name="chevron-back" size={26} color="#FFF" />
                          </TouchableOpacity>
                      )}
                      {viewerIndex < heroItems.length - 1 && (
                          <TouchableOpacity
                              activeOpacity={0.8}
                              accessibilityLabel="Foto siguiente"
                              onPress={() => {
                                  const newIndex = Math.min(heroItems.length - 1, viewerIndex + 1);
                                  viewerScrollRef.current?.scrollTo({ x: newIndex * Dimensions.get("window").width, y: 0, animated: true });
                                  setViewerIndex(newIndex);
                              }}
                              style={{ position: "absolute", right: 20, top: Dimensions.get("window").height / 2 - 22, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", zIndex: 999, elevation: 10 }}
                          >
                              <Ionicons name="chevron-forward" size={26} color="#FFF" />
                          </TouchableOpacity>
                      )}
                  </>
              )}

              <View style={{ position: "absolute", bottom: 40, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, zIndex: 999, elevation: 10 }}>
                  <Text style={{ color: "#FFF", fontWeight: "bold", fontSize: 16 }}>{viewerIndex + 1} / {heroItems.length}</Text>
              </View>
          </View>
      </Modal>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={alertConfig.onClose}
        showCancel={alertConfig.showCancel}
        onCancel={alertConfig.onCancel}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        options={alertConfig.options}
      />

      {/* Offer Modal */}
      <Modal visible={offerModalVisible} transparent animationType="slide" onRequestClose={() => setOfferModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: theme.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: theme.inputBackground }}>
              <View>
                <Text style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}>Hacer oferta</Text>
                {vehicle && <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 2 }}>{vehicle.brand} {vehicle.model} {vehicle.year}</Text>}
              </View>
              <TouchableOpacity onPress={() => setOfferModalVisible(false)}>
                <Ionicons name="close" size={26} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
              {/* Currency */}
              <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "700", marginTop: 20, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>Moneda</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                {(["ARS", "USD"] as const).map(c => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setOfferCurrency(c)}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: offerCurrency === c ? theme.primary : theme.inputBackground, borderWidth: 1.5, borderColor: offerCurrency === c ? theme.primary : theme.likeBoxBackground }}
                  >
                    <Text style={{ color: offerCurrency === c ? "#FFF" : theme.text, fontWeight: "700" }}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Amount */}
              <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>Monto de la oferta</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                <TextInput
                  value={offerAmount}
                  onChangeText={(t) => {
                    const digits = t.replace(/\./g, "").replace(/[^0-9]/g, "");
                    setOfferAmount(digits ? formatNumber(digits) : "");
                  }}
                  placeholder={`Ej: ${offerCurrency === "ARS" ? "15.000.000" : "12.000"}`}
                  placeholderTextColor={theme.textMuted}
                  keyboardType="numeric"
                  style={{ flex: 1, backgroundColor: theme.inputBackground, color: theme.text, padding: 14, borderRadius: 10, fontSize: 20, fontWeight: "700", borderWidth: 1, borderColor: theme.likeBoxBackground }}
                />
                <TouchableOpacity
                  onPress={() => Keyboard.dismiss()}
                  style={{ backgroundColor: theme.inputBackground, borderRadius: 10, paddingHorizontal: 14, justifyContent: "center", borderWidth: 1, borderColor: theme.likeBoxBackground }}
                >
                  <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 14 }}>Listo</Text>
                </TouchableOpacity>
              </View>

              {/* Conditions */}
              <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>Condiciones</Text>
              <TouchableOpacity onPress={() => setOfferTradeIn(!offerTradeIn)} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8, padding: 12, backgroundColor: theme.inputBackground, borderRadius: 10, borderWidth: 1, borderColor: offerTradeIn ? theme.primary : theme.likeBoxBackground }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: offerTradeIn ? theme.primary : theme.textMuted, backgroundColor: offerTradeIn ? theme.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
                  {offerTradeIn && <Ionicons name="checkmark" size={14} color="#FFF" />}
                </View>
                <Text style={{ color: theme.text, fontSize: 14 }}>Incluye permuta</Text>
              </TouchableOpacity>
              {offerTradeIn && (
                <TextInput
                  value={offerTradeInDesc}
                  onChangeText={setOfferTradeInDesc}
                  placeholder="Describí el auto que ofrecés en parte de pago..."
                  placeholderTextColor={theme.textMuted}
                  multiline
                  style={{ backgroundColor: theme.inputBackground, color: theme.text, padding: 12, borderRadius: 10, marginBottom: 8, minHeight: 60, textAlignVertical: "top", borderWidth: 1, borderColor: theme.likeBoxBackground }}
                />
              )}
              <TouchableOpacity onPress={() => setOfferFinancing(!offerFinancing)} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: offerFinancing ? 8 : 16, padding: 12, backgroundColor: theme.inputBackground, borderRadius: 10, borderWidth: 1, borderColor: offerFinancing ? theme.primary : theme.likeBoxBackground }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: offerFinancing ? theme.primary : theme.textMuted, backgroundColor: offerFinancing ? theme.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
                  {offerFinancing && <Ionicons name="checkmark" size={14} color="#FFF" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 14 }}>Necesito financiación</Text>
                  {!offerFinancing && <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>Banco, cuotas, préstamo personal, etc.</Text>}
                </View>
              </TouchableOpacity>
              {offerFinancing && (
                <TextInput
                  value={offerFinancingNote}
                  onChangeText={setOfferFinancingNote}
                  placeholder="¿Qué tipo de financiación necesitás? Ej: banco hipotecario, 60 cuotas, etc."
                  placeholderTextColor={theme.textMuted}
                  multiline
                  style={{ backgroundColor: theme.inputBackground, color: theme.text, padding: 12, borderRadius: 10, marginBottom: 16, minHeight: 60, textAlignVertical: "top", borderWidth: 1, borderColor: theme.primary + "66" }}
                />
              )}

              {/* Note */}
              <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>Nota (opcional)</Text>
              <TextInput
                value={offerNote}
                onChangeText={setOfferNote}
                placeholder="Cualquier aclaración para el vendedor..."
                placeholderTextColor={theme.textMuted}
                multiline
                maxLength={200}
                style={{ backgroundColor: theme.inputBackground, color: theme.text, padding: 12, borderRadius: 10, marginBottom: 20, minHeight: 70, textAlignVertical: "top", borderWidth: 1, borderColor: theme.likeBoxBackground }}
              />
              <Text style={{ color: theme.textMuted, fontSize: 11, textAlign: "right", marginTop: -16, marginBottom: 16 }}>{offerNote.length}/200</Text>

              <TouchableOpacity
                onPress={handleSubmitOffer}
                disabled={submittingOffer || !offerAmount.trim()}
                style={{ backgroundColor: "#10B981", borderRadius: 12, padding: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, opacity: (submittingOffer || !offerAmount.trim()) ? 0.6 : 1, marginBottom: 8 }}
              >
                {submittingOffer && <ActivityIndicator size="small" color="#FFF" />}
                <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 16 }}>{submittingOffer ? "Enviando..." : "Enviar oferta"}</Text>
              </TouchableOpacity>
              <Text style={{ color: theme.textMuted, fontSize: 11, textAlign: "center", marginBottom: 8 }}>
                La oferta expira en 48 hs si no hay respuesta.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ShareSheet
        visible={shareSheetVisible}
        onClose={() => setShareSheetVisible(false)}
        url={`https://matchcars.app/car/${vehicle?.id ?? normalizedId}`}
        title={`${displayTitle} · ${priceText}`}
        theme={theme}
      />
    </SafeAreaView>
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
      paddingHorizontal: 12,
    },
    loadingContainer: {
      flex: 1,
      backgroundColor: theme.background,
      alignItems: "center",
      justifyContent: "center",
    },
    loadingText: {
      marginTop: 8,
      color: theme.text,
    },
    errorText: {
      color: theme.error,
      fontSize: 16,
      marginBottom: 16,
      textAlign: "center",
    },
    topActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 4,
      marginBottom: 8,
      paddingHorizontal: 12,
    },
    backPill: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: theme.card,
    },
    backPillText: {
      color: theme.primary,
      fontWeight: "600",
    },
    homePill: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: theme.card,
    },
    homePillText: {
      color: theme.text,
      fontWeight: "600",
    },
    editPill: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: theme.primary,
    },
    editPillText: {
      color: theme.buttonText,
      fontWeight: "700",
    },
    heroContainer: {
      borderRadius: 16,
      overflow: "hidden",
      marginBottom: 8,
      backgroundColor: theme.card,
      // marginHorizontal: -12, // Edge to edge removed
    },
    heroImage: {
      height: Dimensions.get("window").width * 0.6,
      resizeMode: "cover",
    },
    heroPlaceholder: {
      height: Dimensions.get("window").width * 0.6,
      alignItems: "center",
      justifyContent: "center",
    },
    heroPlaceholderText: {
      color: theme.textMuted,
    },
    heroOverlay: {
      position: "absolute",
      top: 8,
      left: 12,
      right: 12,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: "rgba(0,0,0,0.55)",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    heroTitle: {
      color: "#FFF",
      fontWeight: "700",
      fontSize: 14,
      flex: 1,
      marginRight: 8,
    },
    heroPrice: {
      color: "#FFF",
      fontWeight: "700",
      fontSize: 14,
    },
    tabsContainer: {
      marginTop: 8,
      marginBottom: 8,
    },
    tabsScrollContent: {
      paddingHorizontal: 12,
      gap: 8,
      paddingRight: 24, // Extra padding for last item
    },
    tabChip: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: theme.card,
    },
    tabChipActive: {
      backgroundColor: theme.accent,
    },
    tabChipText: {
      color: theme.text,
      fontSize: 12, // Restored readable size
      fontWeight: "500",
    },
    tabChipTextActive: {
      color: theme.buttonText,
    },
    scrollArea: {
      flex: 1,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.badgeBorder,
      backgroundColor: theme.inputBackground,
      color: theme.inputText,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
    },
    select: {
      borderWidth: 1,
      borderColor: theme.badgeBorder,
      backgroundColor: theme.inputBackground,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 8,
      marginTop: 2,
    },
    selectText: {
      color: theme.inputText,
      fontWeight: "600",
    },
    selectMenu: {
      marginTop: 2,
      borderWidth: 1,
      borderColor: theme.badgeBorder,
      backgroundColor: theme.card,
      borderRadius: 8,
    },
    selectItem: {
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    selectItemText: {
      color: theme.text,
    },
    sectionCard: {
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
    },
    sectionTitle: {
      color: theme.title,
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 8,
    },
    carTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 4,
    },
    priceText: {
      color: theme.price,
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 10,
    },
    badgesRow: {
      flexDirection: "row",
      gap: 6,
      marginBottom: 10,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
    },
    badgeSale: {
      backgroundColor: "#22c55e33",
      borderWidth: 1,
      borderColor: "#22c55e",
    },
    badgeSwap: {
      backgroundColor: "#3b82f633",
      borderWidth: 1,
      borderColor: "#3b82f6",
    },
    badgeFinance: {
      backgroundColor: "#eab30833",
      borderWidth: 1,
      borderColor: "#eab308",
    },
    badgeText: {
      color: "#FFF",
      fontSize: 10,
      fontWeight: "700",
    },
    chipsRow: {
      flexDirection: "row",
      gap: 4,
      marginBottom: 10,
    },
    chip: {
      flex: 1,
      backgroundColor: theme.likeBox,
      borderRadius: 10,
      paddingVertical: 6,
      paddingHorizontal: 4,
      alignItems: "center",
    },
    chipLabel: {
      color: theme.textMuted,
      fontSize: 10,
      marginBottom: 2,
    },
    chipValue: {
      color: theme.text,
      fontSize: 12,
      fontWeight: "600",
      textAlign: "center",
    },
    ownerBox: {
      marginTop: 4,
    },
    ownerLabel: {
      color: theme.textMuted,
      fontSize: 12,
    },
    ownerName: {
      color: theme.text,
      fontSize: 14,
      fontWeight: "600",
    },
    ownerDate: {
      color: theme.textLight,
      fontSize: 12,
      marginTop: 2,
    },
    specGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    specItem: {
      width: "47%",
    },
    specLabel: {
      color: theme.textMuted,
      fontSize: 11,
      marginBottom: 2,
    },
    specValue: {
      color: theme.text,
      fontSize: 14,
      fontWeight: "600",
    },
    featuresWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 6,
    },
    featureTag: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: theme.likeBox,
    },
    featureText: {
      color: theme.text,
      fontSize: 11,
    },
    descriptionText: {
      color: theme.text,
      fontSize: 14,
      marginTop: 4,
    },
    mutedText: {
      color: theme.textMuted,
      fontSize: 13,
    },
    timeline: {
      marginTop: 8,
    },
    timelineItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 10,
    },
    timelineDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.accent,
      marginTop: 4,
      marginRight: 8,
    },
    timelineContent: {
      flex: 1,
    },
    timelineYear: {
      color: theme.textLight,
      fontSize: 11,
    },
    timelineTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: "600",
    },
    timelineNote: {
      color: theme.textMuted,
      fontSize: 12,
    },
    financeBox: {
      marginTop: 10,
      padding: 12,
      borderRadius: 10,
      backgroundColor: theme.likeBoxBackground,
    },
    financeRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4,
    },
    financeLabel: {
      color: theme.textMuted,
      fontSize: 12,
    },
    financeValue: {
      color: theme.text,
      fontSize: 13,
      fontWeight: "600",
    },
    financeLabelStrong: {
      color: theme.text,
      fontSize: 13,
      fontWeight: "600",
    },
    financeValueStrong: {
      color: theme.price,
      fontSize: 16,
      fontWeight: "700",
    },
    ctaButton: {
      marginTop: 14,
      backgroundColor: theme.buttonBackground,
      paddingVertical: 12,
      borderRadius: 999,
      alignItems: "center",
    },
    ctaButtonText: {
      color: theme.buttonText,
      fontWeight: "700",
      fontSize: 15,
    },
    locationText: {
      color: theme.text,
      fontSize: 14,
      marginBottom: 8,
    },
    mapPlaceholder: {
      height: 180,
      borderRadius: 12,
      backgroundColor: theme.likeBox,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 4,
    },
    mapPlaceholderText: {
      color: theme.textMuted,
      fontSize: 13,
      textAlign: "center",
      paddingHorizontal: 12,
    },
  });
}
