// app/car/[id].tsx
import { SelectionModal } from "@/components/SelectionModal";
import type { Theme } from "@/config/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { usePriceSuggestion } from "@/hooks/usePriceSuggestion";
import { db, storage } from "@/lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from 'expo-sharing';
import { arrayUnion, doc, getDoc, increment, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Dimensions, Image, Modal, Platform, ScrollView, Share, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
type CarDetailsTabs = "resumen" | "ficha" | "historial" | "financiacion" | "fotos";

// Por ahora usamos any para no pelearnos con el tipo Vehicle
type VehicleDoc = any;

const fuelOptions = ["Nafta", "Diésel", "Híbrido", "Eléctrico", "GNC"];
const gearboxOptions = ["Manual", "Automática"];
const PROVINCES: string[] = [
  "Buenos Aires","CABA","Catamarca","Chaco","Chubut","Córdoba","Corrientes","Entre Ríos","Formosa","Jujuy","La Pampa","La Rioja","Mendoza","Misiones","Neuquén","Río Negro","Salta","San Juan","San Luis","Santa Cruz","Santa Fe","Santiago del Estero","Tierra del Fuego","Tucumán"
];

const CITY_OPTIONS_BY_PROVINCE: Record<string, string[]> = {
  "Buenos Aires": ["La Plata", "Mar del Plata", "Bahía Blanca", "Quilmes", "Morón", "Tandil", "San Isidro"],
  "CABA": ["Palermo", "Recoleta", "Belgrano", "Caballito", "Flores", "Mataderos"],
  "Córdoba": ["Córdoba", "Villa Carlos Paz", "Río Cuarto", "Alta Gracia", "Villa María"],
  "Santa Fe": ["Rosario", "Santa Fe", "Rafaela", "Venado Tuerto"],
  "Mendoza": ["Mendoza", "Godoy Cruz", "Guaymallén", "San Rafael"],
  "Tucumán": ["San Miguel de Tucumán", "Yerba Buena", "Tafí Viejo"],
  "Salta": ["Salta", "San Lorenzo", "Tartagal"],
  "Neuquén": ["Neuquén", "Plottier", "Centenario"],
  "Río Negro": ["Bariloche", "General Roca", "Cipolletti"],
  "Chubut": ["Comodoro Rivadavia", "Trelew", "Puerto Madryn"],
};

export default function CarDetailsScreen() {
  const { id, tab, edit } = useLocalSearchParams<{ id: string; tab?: string; edit?: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const [vehicle, setVehicle] = useState<VehicleDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<CarDetailsTabs>("resumen");
  const [editing, setEditing] = useState(false);
  const [ownerProfile, setOwnerProfile] = useState<{ photoURL?: string; initials: string; avatarColor: string } | null>(null);
  const [editState, setEditState] = useState({
    price: "",
    km: "",
    fuelType: "",
    gearbox: "",
    city: "",
    province: "",
    currency: "",
    acceptsFinancing: false,
    finRate: "",
    finMonths: "",
    finInitialPercent: "",
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
    // Images
    cover: "",
    gallery: [] as string[],
    imagesUploading: false,
  } as any);

  const [citiesList, setCitiesList] = useState<string[]>([]);

  // Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ 
    title: "", 
    message: "", 
    type: "info" as "success" | "error" | "info" | "warning" 
  });

  // Full Screen Image Viewer State
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const showAlert = (title: string, message: string, type: "success" | "error" | "info" | "warning" = "info") => {
    setAlertConfig({ title, message, type });
    setAlertVisible(true);
  };

  // Price Indicator Hook (Safe top-level call)
  const priceSuggestion = usePriceSuggestion(
    vehicle?.brand || "", 
    vehicle?.model || "", 
    vehicle?.year || "", 
    vehicle?.currency || "ARS"
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
        console.log("Error fetching cities for province:", prov, e);
        setCitiesList(defaults.sort());
      }
    };
    fetchCities();
  }, [editState.province]);

  const { user, profile, initializing } = useAuth();
  const [authChecking, setAuthChecking] = useState(true);
  

  // ✅ Chequeo de sesión y redirección dentro de useEffect
  useEffect(() => {
    if (initializing) return;
    setAuthChecking(false);
  }, [initializing]);

  useEffect(() => {
    if (tab && ["resumen", "ficha", "historial", "financiacion", "fotos"].includes(String(tab))) {
      setActiveTab(tab as CarDetailsTabs);
    }
    if (edit === "true") {
      setEditing(true);
    }
  }, [tab, edit]);

  useEffect(() => {
    if (!id || initializing || authChecking || !user) return;

    // Increment views
    const incrementView = async () => {
        try {
            const ref = doc(db, "vehicles", id);
            await updateDoc(ref, { views: increment(1) });
        } catch {}
    };
    incrementView();

    const ref = doc(db, "vehicles", id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as any;
          setVehicle(data);
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
            finRate: String(data.financing?.rate ?? 25),
            finMonths: String(data.financing?.months ?? 24),
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
    if (!vehicle?.userId) return;
    const fetchOwner = async () => {
      try {
        const docRef = doc(db, "users", vehicle.userId);
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
          setOwnerProfile({ photoURL, initials, avatarColor });
        }
      } catch (e) {
        console.error("Error fetching owner profile", e);
      }
    };
    fetchOwner();
  }, [vehicle?.userId]);

  if (initializing || authChecking) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator color={theme.accent} />
        <Text style={styles.loadingText}>Verificando sesión...</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
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
    router.back();
  };

  const handleGoHome = () => {
    router.push("/(tabs)");
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
  const isDealer = vehicle.userPlan === 'pro_dealer';
  const showMetrics = vehicle.userPlan === 'pro_plus' || vehicle.userPlan === 'pro_dealer';
  
  const getPriceIndicator = () => {
    if (!vehicle.price || priceSuggestion.loading || priceSuggestion.count === 0) return null;
    
    const currentPrice = Number(vehicle.price);
    const avg = priceSuggestion.avg;
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
            const manipulated = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: 1024 } }], {
                compress: 0.7,
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
            console.warn("Advertencia: No tienes permiso para actualizar el catálogo global de ciudades. (Esto requiere actualizar las reglas de seguridad en Firebase). El auto se actualizará igual.");
        } else {
            console.error("Error updating province cities:", e);
        }
      }
    }

    const ref = doc(db, "vehicles", vehicle.id);
    const priceNum = editState.price ? Number(editState.price) : null;
    const kmNum = editState.km ? Number(editState.km) : null;
    const rateNum = editState.finRate ? Number(editState.finRate) : null;
    const monthsNum = editState.finMonths ? Number(editState.finMonths) : null;
    const airbagsNum = editState.airbags ? Number(editState.airbags) : null;
    const windowsAutoNum = editState.windowsAuto ? Number(editState.windowsAuto) : null;
    const featuresArr = String(editState.featuresText || "")
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
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
      financing: !!editState.acceptsFinancing
        ? {
            rate: rateNum ?? 25,
            months: monthsNum ?? 24,
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
      images: {
          cover: editState.cover || null,
          gallery: editState.gallery || []
      },
      updatedAt: serverTimestamp(),
    });
    setEditing(false);
  }

  // --- Contenidos de cada pestaña ---

  const renderResumen = () => {
    const daysSincePublished = vehicle.createdAt
      ? Math.floor((new Date().getTime() - (vehicle.createdAt.toDate ? vehicle.createdAt.toDate() : new Date(vehicle.createdAt)).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const highInterest = (vehicle.views > 50 && daysSincePublished < 7) || (vehicle.likesCount > 5);
    const activeSeller = vehicle.sellerTrustLevel === 'active' || vehicle.sellerTrustLevel === 'verified' || (vehicle.images?.gallery?.length || 0) >= 5;
    
    const priceDrop = vehicle.originalPrice && vehicle.price < vehicle.originalPrice
      ? Math.round(((vehicle.originalPrice - vehicle.price) / vehicle.originalPrice) * 100)
      : 0;

    return (
    <View style={styles.sectionCard}>
      {isSold && (
        <View style={{ backgroundColor: "#ef4444", padding: 12, borderRadius: 8, marginBottom: 16, alignItems: "center" }}>
            <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 16 }}>¡VENDIDO!</Text>
            <Text style={{ color: "#FFF", fontSize: 12 }}>Este vehículo ya no está disponible.</Text>
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

      <Text style={styles.sectionTitle}>Resumen</Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {isDealer && (
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

      <Text style={styles.carTitle}>{displayTitle}</Text>

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
        {priceDrop > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: theme.textMuted }}>Precio original</Text>
                <Text style={{ fontSize: 12, color: theme.textMuted, textDecorationLine: "line-through" }}>{vehicle.currency} {vehicle.originalPrice?.toLocaleString("es-AR")}</Text>
            </View>
        )}
        {priceDrop > 0 && (
             <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 12, color: theme.accent }}>Rebaja</Text>
                <Text style={{ fontSize: 12, color: theme.accent, fontWeight: "800" }}>⬇ {priceDrop}% OFF</Text>
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
                    <Text style={{ color: "#FFF", fontSize: 18, fontWeight: "bold" }}>{ownerProfile?.initials || (vehicle.userName || vehicle.sellerName || "U").slice(0, 2).toUpperCase()}</Text>
                )}
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.ownerLabel}>Publicado por</Text>
                <Text style={styles.ownerName}>
                  {vehicle.userName || vehicle.sellerName || "Usuario desconocido"}
                </Text>
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
        {user && user.uid !== vehicle.userId && (
          <TouchableOpacity
            disabled={isSold}
            style={[styles.ctaButton, { marginTop: 12, backgroundColor: isSold ? theme.textMuted : theme.primary, opacity: isSold ? 0.6 : 1 }]}
            onPress={() => !isSold && handleContact()}
          >
            <Text style={styles.ctaButtonText}>{isSold ? "No disponible" : "Enviar mensaje"}</Text>
          </TouchableOpacity>
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

  const renderHistorial = () => {
    const items = vehicle.history || [];
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Historial del Vehículo</Text>
        {items.length === 0 ? (
           <Text style={styles.mutedText}>No hay eventos registrados.</Text>
        ) : (
           <View style={styles.timeline}>
             {items.map((h: any, i: number) => (
               <View key={i} style={styles.timelineItem}>
                 <View style={styles.timelineDot} />
                 <View style={styles.timelineContent}>
                   <Text style={styles.timelineYear}>{h.year}</Text>
                   <Text style={styles.timelineTitle}>{h.title}</Text>
                   {h.note ? <Text style={styles.timelineNote}>{h.note}</Text> : null}
                 </View>
               </View>
             ))}
           </View>
        )}
      </View>
    );
  };

  const renderFinanciacion = () => {
    if (!vehicle.acceptsFinancing || !vehicle.financing) {
       return (
         <View style={styles.sectionCard}>
           <Text style={styles.sectionTitle}>Financiación</Text>
           <Text style={styles.mutedText}>Este vehículo no acepta financiación.</Text>
         </View>
       );
    }
    const { rate, months } = vehicle.financing;
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Opciones de Financiación</Text>
        <View style={styles.financeBox}>
           <View style={styles.financeRow}>
             <Text style={styles.financeLabel}>Tasa (aprox.)</Text>
             <Text style={styles.financeValue}>{rate}%</Text>
           </View>
           <View style={styles.financeRow}>
             <Text style={styles.financeLabel}>Plazo</Text>
             <Text style={styles.financeValue}>{months} cuotas</Text>
           </View>
           <View style={{ height: 1, backgroundColor: theme.badgeBorder, marginVertical: 8 }} />
           <View style={styles.financeRow}>
             <Text style={styles.financeLabelStrong}>Anticipo sugerido</Text>
             <Text style={styles.financeValueStrong}>50%</Text>
           </View>
        </View>
        <TouchableOpacity style={styles.ctaButton} onPress={handleContact}>
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
                    setViewerIndex(i);
                    setViewerVisible(true);
                }}>
                    <Image source={{ uri: img }} style={{ width: (screenWidth - 60) / 3, height: (screenWidth - 60) / 3, borderRadius: 8, backgroundColor: theme.inputBackground }} />
                </TouchableOpacity>
            ))}
            {images.length === 0 && <Text style={styles.mutedText}>No hay fotos disponibles.</Text>}
        </View>
    </View>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case "resumen": return renderResumen();
      case "ficha": return renderFichaTecnica();
      case "historial": return renderHistorial();
      case "financiacion": return renderFinanciacion();
      case "fotos": return renderFotos();
      default: return renderResumen();
    }
  };

  const renderEditActiveTab = () => {
    switch (activeTab) {
      case "resumen":
        return (
            <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Editar Resumen</Text>
                
                <Text style={styles.specLabel}>Precio</Text>
                <TextInput
                    style={styles.input}
                    value={editState.price}
                    onChangeText={(t) => setEditState({...editState, price: t})}
                    keyboardType="numeric"
                    placeholder="Precio"
                />

                <Text style={[styles.specLabel, { marginTop: 12 }]}>Kilómetros</Text>
                <TextInput
                    style={styles.input}
                    value={editState.km}
                    onChangeText={(t) => setEditState({...editState, km: t})}
                    keyboardType="numeric"
                    placeholder="KM"
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

                <Text style={[styles.specLabel, { marginTop: 12 }]}>Descripción</Text>
                <TextInput
                    style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                    value={editState.description}
                    onChangeText={(t) => setEditState({...editState, description: t})}
                    multiline
                    placeholder="Descripción del vehículo"
                />
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
                        />
                    </View>
                </View>
                
                <Text style={[styles.specLabel, { marginTop: 12 }]}>Dirección</Text>
                <TextInput
                    style={styles.input}
                    value={editState.wheelType}
                    onChangeText={(t) => setEditState({...editState, wheelType: t})}
                    placeholder="Ej: Asistida, Hidráulica"
                />

                <Text style={[styles.specLabel, { marginTop: 12 }]}>Equipamiento (separado por comas)</Text>
                <TextInput
                    style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                    value={editState.featuresText}
                    onChangeText={(t) => setEditState({...editState, featuresText: t})}
                    multiline
                    placeholder="Ej: Aire acondicionado, Dirección asistida, ..."
                />
            </View>
        );
      case "financiacion":
        return (
            <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Editar Financiación</Text>
                
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <Text style={{ color: theme.text, fontWeight: "600" }}>Acepta Financiación</Text>
                    <Switch
                        value={!!editState.acceptsFinancing}
                        onValueChange={(v) => setEditState({...editState, acceptsFinancing: v})}
                        trackColor={{ false: theme.inputBackground, true: theme.accent }}
                    />
                </View>

                {editState.acceptsFinancing && (
                    <>
                        <Text style={styles.specLabel}>Tasa anual (%)</Text>
                        <TextInput
                            style={styles.input}
                            value={editState.finRate}
                            onChangeText={(t) => setEditState({...editState, finRate: t})}
                            keyboardType="numeric"
                            placeholder="Ej: 25"
                        />
                        <Text style={[styles.specLabel, { marginTop: 12 }]}>Plazo (meses)</Text>
                        <TextInput
                            style={styles.input}
                            value={editState.finMonths}
                            onChangeText={(t) => setEditState({...editState, finMonths: t})}
                            keyboardType="numeric"
                            placeholder="Ej: 24"
                        />
                    </>
                )}
            </View>
        );
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
      default:
        return (
            <View style={styles.sectionCard}>
                <Text style={styles.mutedText}>Edición no disponible para esta sección.</Text>
            </View>
        );
    }
  };

  const handleGeneratePDF = async () => {
    if (!vehicle) return;
    
    // Check if user is owner (redundant if button is hidden, but good for safety)
    if (!user || user.uid !== vehicle.userId) {
        return;
    }

    // Check Plan Access
    const hasAccess = profile?.role === 'admin' || 
                      profile?.plan?.includes('pro_plus') || 
                      profile?.plan?.includes('pro_dealer');

    if (!hasAccess) {
        showAlert(
            "Función Premium",
            "Generar la ficha PDF con QR es exclusivo para planes Pro Plus y Pro Dealer. ¡Mejorá tu plan para acceder!",
            "info",
            () => router.push("/subscribe"), // Redirect to subscribe
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
      
      // Usamos un link HTTPS para garantizar que sea clickeable en apps de mensajería (WhatsApp, etc)
      // Nota: Requiere configuración de Universal Links para abrir la app directamente.
      const webLink = `https://matchcars.app/car/${vehicle.id}`;
      
      const headline = displayTitle;
      const message = `¡Mirá este auto en MatchCars!\n\n${headline}\n${priceText}\n\nVer publicación:`;

      try {
        if (Platform.OS === 'ios') {
            await Share.share({
                message: message,
                url: webLink
            });
        } else {
            await Share.share({
                message: `${message} ${webLink}`,
                title: 'MatchCars'
            });
        }
      } catch (error: any) {
        // ignore
      }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topActions}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backPill}>
          <Text style={styles.backPillText}>← Volver</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={handleGoHome} style={styles.homePill}>
                <Ionicons name="home" size={18} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} style={styles.homePill}>
                <Ionicons name="share-outline" size={18} color={theme.text} />
            </TouchableOpacity>
            
            {user && user.uid === vehicle.userId && (
                <>
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

      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
          <View style={styles.heroContainer}>
              {images.length > 0 ? (
                  <ScrollView 
                    horizontal 
                    pagingEnabled 
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={(e) => {
                        const newIndex = Math.round(e.nativeEvent.contentOffset.x / (Dimensions.get("window").width - 24));
                        // Optional: track index if needed
                    }}
                  >
                    {images.map((img, idx) => (
                        <TouchableOpacity 
                            key={idx} 
                            activeOpacity={0.9} 
                            onPress={() => {
                                setViewerIndex(idx);
                                setViewerVisible(true);
                            }}
                        >
                            <Image 
                                source={{ uri: img }} 
                                style={{ width: Dimensions.get("window").width - 24, height: (Dimensions.get("window").width - 24) * 0.65, resizeMode: "cover" }} 
                            />
                        </TouchableOpacity>
                    ))}
                  </ScrollView>
              ) : (
                  <View style={styles.heroPlaceholder}>
                      <Ionicons name="car-sport" size={48} color={theme.textMuted} />
                      <Text style={styles.heroPlaceholderText}>Sin foto de portada</Text>
                  </View>
              )}
              {images.length > 1 && (
                  <View style={{ position: "absolute", bottom: 12, right: 12, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                      <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "700" }}>
                          +{images.length} FOTOS
                      </Text>
                  </View>
              )}
              <View style={styles.heroOverlay}>
                  <Text style={styles.heroTitle} numberOfLines={1}>{displayTitle}</Text>
                  <Text style={styles.heroPrice}>{priceText}</Text>
              </View>
          </View>

          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.tabsContainer}
          >
              {(["resumen", "ficha", "historial", "financiacion", "fotos"] as const).map((t) => (
                  <TouchableOpacity
                      key={t}
                      style={[styles.tabChip, activeTab === t && styles.tabChipActive]}
                      onPress={() => setActiveTab(t)}
                  >
                      <Text style={[styles.tabChipText, activeTab === t && styles.tabChipTextActive]}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                      </Text>
                  </TouchableOpacity>
              ))}
          </ScrollView>

          {editing ? renderEditActiveTab() : renderActiveTab()}
          
          <View style={{ height: 40 }} />
      </ScrollView>

      {editing && (
          <View style={{ padding: 12, borderTopWidth: 1, borderColor: theme.badgeBorder, backgroundColor: theme.card }}>
              <TouchableOpacity onPress={handleSaveEdits} style={[styles.ctaButton, { marginTop: 0 }]}>
                  <Text style={styles.ctaButtonText}>Guardar Cambios</Text>
              </TouchableOpacity>
          </View>
      )}

      {loading && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' }]}>
            <ActivityIndicator size="large" color={theme.accent} />
        </View>
      )}

      <Modal visible={viewerVisible} transparent={true} animationType="fade" onRequestClose={() => setViewerVisible(false)}>
          <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center" }}>
              <TouchableOpacity 
                  style={{ position: "absolute", top: 40, right: 20, zIndex: 10, padding: 8, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20 }}
                  onPress={() => setViewerVisible(false)}
              >
                  <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
              
              <ScrollView 
                  horizontal 
                  pagingEnabled 
                  showsHorizontalScrollIndicator={false}
                  contentOffset={{ x: viewerIndex * Dimensions.get("window").width, y: 0 }}
                  onMomentumScrollEnd={(e) => {
                      const idx = Math.round(e.nativeEvent.contentOffset.x / Dimensions.get("window").width);
                      setViewerIndex(idx);
                  }}
              >
                  {images.map((img, idx) => (
                      <View key={idx} style={{ width: Dimensions.get("window").width, height: Dimensions.get("window").height, justifyContent: "center", alignItems: "center" }}>
                           <ScrollView
                              minimumZoomScale={1}
                              maximumZoomScale={3}
                              showsHorizontalScrollIndicator={false}
                              showsVerticalScrollIndicator={false}
                              contentContainerStyle={{ flex: 1, justifyContent: 'center' }}
                           >
                              <Image 
                                  source={{ uri: img }} 
                                  style={{ width: Dimensions.get("window").width, height: Dimensions.get("window").height * 0.8, resizeMode: "contain" }} 
                              />
                           </ScrollView>
                      </View>
                  ))}
              </ScrollView>
              
              <View style={{ position: "absolute", bottom: 40, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 }}>
                  <Text style={{ color: "#FFF", fontWeight: "bold", fontSize: 16 }}>{viewerIndex + 1} / {images.length}</Text>
              </View>
          </View>
      </Modal>
    </SafeAreaView>
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
      flexDirection: "row",
      // flexWrap: "wrap", // Removed
      gap: 4, // Tight gap to fit screen
      marginTop: 8,
      marginBottom: 8,
      paddingHorizontal: 8, 
      paddingRight: 64,
    },
    tabChip: {
      paddingVertical: 6,
      paddingHorizontal: 10, // Restored slightly
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
