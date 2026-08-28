import { CarCard } from "@/components/cards/carcard";
import { SkeletonList } from "@/components/SkeletonLoader";
import { CustomAlert } from "@/components/CustomAlert";
import { DownloadAppBanner } from "@/components/DownloadAppBanner";
import { Header } from "@/components/Header";
import { WebContainer } from "@/components/WebContainer";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { isDealerPlan } from "@/lib/planChecks";
import { shareProfile } from "@/lib/share";
import type { Vehicle } from "@/types/vehicle";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { addDoc, collection, doc, getDoc, getDocs, increment, limit, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function MyCarsTab() {
  const { theme } = useTheme();
  const { user, profile, refreshTrustLevel } = useAuth();
  const router = useRouter();
  const { saleVehicleId, saleBuyerId, leadId } = useLocalSearchParams<{
    saleVehicleId?: string;
    saleBuyerId?: string;
    leadId?: string;
  }>();
  const [loading, setLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [myVehicles, setMyVehicles] = useState<Vehicle[]>([]);

  // Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ 
    title: "", 
    message: "", 
    type: "info" as "success" | "error" | "info" | "warning",
    showCancel: false,
    onCancel: undefined as (() => void) | undefined,
    confirmText: "Entendido",
    cancelText: "Cancelar",
    onConfirm: undefined as (() => void) | undefined
  });

  const showAlert = (
    title: string, 
    message: string, 
    type: "success" | "error" | "info" | "warning" = "info",
    showCancel = false, 
    onConfirm?: () => void,
    confirmText = "Entendido",
    cancelText = "Cancelar",
    onCancel?: () => void
  ) => {
      setAlertConfig({ 
        title, 
        message, 
        type, 
        showCancel, 
        onConfirm: () => {
          if (onConfirm) onConfirm();
          setAlertVisible(false);
        }, 
        confirmText, 
        cancelText, 
        onCancel: () => {
          if (onCancel) onCancel();
          setAlertVisible(false);
        }
      });
      setAlertVisible(true);
  };

  // Sale Modal State
  const [saleModalVisible, setSaleModalVisible] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [finalPrice, setFinalPrice] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [submittingSale, setSubmittingSale] = useState(false);

  // Buyer Search State
  const [buyerSearchQuery, setBuyerSearchQuery] = useState("");
  const [buyerSearchResults, setBuyerSearchResults] = useState<any[]>([]);
  const [selectedBuyer, setSelectedBuyer] = useState<any | null>(null);
  const [isSearchingBuyer, setIsSearchingBuyer] = useState(false);
  const [recentBuyers, setRecentBuyers] = useState<any[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [leadToSync, setLeadToSync] = useState<{
    id: string;
    buyerId?: string;
  } | null>(null);

  const [activeFilter, setActiveFilter] = useState<"published" | "review" | "rejected" | "sold">("published");

  // Calculate quota
  
  const getFeaturedLimit = () => {
    const p = profile?.plan || "free";
    if (p.includes("pro_dealer")) return Infinity;
    if (p.includes("pro_plus")) return 15;
    if (p.includes("pro")) return 5;
    return 0;
  };

  const getPublicationLimit = () => {
    const p = profile?.plan || "free";
    if (p.includes("pro_dealer")) return 100;
    if (p.includes("pro_plus")) return 40;
    if (p.includes("pro")) return 15;
    return 1;
  };

  const handleShareProfile = async () => {
    if (!user) return;
    try {
      const name = profile?.agencyName || (profile?.firstName ? `${profile.firstName} ${profile.lastName || ""}`.trim() : "Usuario");
      await shareProfile(user.uid, name);
    } catch (error) {
      console.error(error);
    }
  };

  const getDaysRemaining = (featuredAt: any) => {
    if (!featuredAt) return 0;
    const startDate = featuredAt.toDate ? featuredAt.toDate() : new Date(featuredAt.seconds * 1000);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    const totalDays = 7;
    return Math.max(0, totalDays - diffDays);
  };

  const quotaLimit = getFeaturedLimit();
  const pubLimit = getPublicationLimit();
  // Only count vehicles whose featured status hasn't expired (7-day window)
  const featuredCount = myVehicles.filter(v => {
    if (!v.isFeatured) return false;
    if (quotaLimit === Infinity) return true; // Dealer plans: unlimited, no expiry concern
    return getDaysRemaining((v as any).featuredAt) > 0;
  }).length;
  const totalVehiclesCount = myVehicles.filter(v => {
    const status = v.status || "available";
    if (status === "deleted" || status === "rejected" || status === "rejected_limit" || status === "blocked" || status === "sold" || status === "reserved") return false;
    return true;
  }).length;

  const filteredVehicles = myVehicles.filter((v) => {
    const status = v.status || "available";
    if (activeFilter === "published") {
      if (!v.published) return false;
      if (status === "deleted" || status === "rejected" || status === "rejected_limit" || status === "blocked" || status === "sold" || status === "reserved") return false;
      return true;
    }
    if (activeFilter === "review") {
      if (status === "pending" || status === "pending_review") return true;
      return false;
    }
    if (activeFilter === "rejected") {
      if (status === "rejected" || status === "rejected_limit" || status === "blocked") return true;
      return false;
    }
    if (activeFilter === "sold") {
      // "reserved" = ya se marcó vendido, esperando que el comprador
      // confirme la recepción desde su cuenta — sin esto, un auto en ese
      // estado quedaba sin ninguna pestaña que lo mostrara (no es
      // "published" porque se despublica al vender, y no es "sold" hasta
      // que el comprador confirma).
      return status === "sold" || status === "reserved";
    }
    return true;
  });

  const handleToggleFeature = async (vehicle: Vehicle) => {
    if (!vehicle.id) return;

    // Si ya está destacado, ofrecemos extender/renovar o quitar
    if (vehicle.isFeatured) {
       showAlert(
         "Gestionar Destacado",
         "¿Querés renovar el destacado por 7 días más o quitarlo?",
         "info",
         true,
         async () => {
            // Renovar
            try {
                const ref = doc(db, "vehicles", vehicle.id);
                await updateDoc(ref, { 
                  featuredAt: serverTimestamp()
                });
                showAlert("¡Listo!", "Tu destacado ha sido renovado por 7 días más.", "success");
            } catch (e) {
                showAlert("Error", "No se pudo renovar.", "error");
            }
         },
         "Renovar (7 días)",
         "Quitar Destacado",
         async () => {
             // Quitar
             try {
                const ref = doc(db, "vehicles", vehicle.id);
                await updateDoc(ref, { isFeatured: false });
             } catch (e) {
                showAlert("Error", "No se pudo quitar.", "error");
             }
         }
       );
       return;
    }

    // Si quiere destacar, verificamos cupo
    if (quotaLimit !== Infinity && featuredCount >= quotaLimit) {
      showAlert(
        "Límite alcanzado", 
        `Tu plan permite destacar hasta ${quotaLimit} autos. Podés contratar un Boost individual para destacar este auto.`,
        "info",
        true,
        () => router.push({ pathname: "/(screens)/boost/[id]" as any, params: { id: vehicle.id } }),
        "Ver Boost",
        "Cancelar"
      );
      return;
    }

    try {
      const ref = doc(db, "vehicles", vehicle.id);
      await updateDoc(ref, { 
        isFeatured: true,
        featuredAt: serverTimestamp()
      });
    } catch (e) {
      showAlert("Error", "No se pudo destacar el auto.", "error");
    }
  };

  const openSaleModal = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setFinalPrice(vehicle.price?.toString() || "");
    setBuyerName("");
    setBuyerSearchQuery("");
    setBuyerSearchResults([]);
    setSelectedBuyer(null);
    setSaleModalVisible(true);
  };

  useEffect(() => {
    if (loading) {
      setShowSkeleton(true);
    } else {
      const t = setTimeout(() => setShowSkeleton(false), 500);
      return () => clearTimeout(t);
    }
  }, [loading]);

  useEffect(() => {
    if (!saleVehicleId || !myVehicles.length) return;
    const veh = myVehicles.find((v) => v.id === saleVehicleId);
    if (!veh) return;
    openSaleModal(veh);
  }, [saleVehicleId, myVehicles]);

  const searchBuyers = async (text: string) => {
    setBuyerSearchQuery(text);
    if (text.length < 3) {
      setBuyerSearchResults([]);
      return;
    }
    setIsSearchingBuyer(true);
    try {
      const qEmail = query(collection(db, "users"), where("email", "==", text.toLowerCase()));
      const snapEmail = await getDocs(qEmail);

      const qName = query(collection(db, "users"),
        where("firstName", ">=", text),
        where("firstName", "<=", text + "\uf8ff"),
        limit(5)
      );
      const snapName = await getDocs(qName);

      const results = new Map();
      snapEmail.forEach(d => results.set(d.id, { id: d.id, ...d.data() }));
      snapName.forEach(d => results.set(d.id, { id: d.id, ...d.data() }));

      setBuyerSearchResults(Array.from(results.values()));
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearchingBuyer(false);
    }
  };

  const selectBuyer = (user: any) => {
    setSelectedBuyer(user);
    setBuyerName(`${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email);
    setBuyerSearchQuery("");
    setBuyerSearchResults([]);
  };

  useEffect(() => {
    const preselectBuyer = async () => {
      if (!saleBuyerId || !saleModalVisible || selectedBuyer || !user) return;
      try {
        const buyerDoc = await getDoc(doc(db, "users", saleBuyerId as string));
        if (buyerDoc.exists()) {
          const data = { id: buyerDoc.id, ...buyerDoc.data() };
          setLeadToSync({
            id: (leadId as string) || "",
            buyerId: buyerDoc.id,
          });
          selectBuyer(data);
        }
      } catch (e) {
        console.error("Error preselecting buyer from params", e);
      }
    };
    preselectBuyer();
  }, [saleBuyerId, saleModalVisible, selectedBuyer, user, leadId]);

  useEffect(() => {
    if (saleModalVisible && user) {
        fetchRecentBuyers();
    }
  }, [saleModalVisible, user]);

  const fetchRecentBuyers = async () => {
    setLoadingRecent(true);
    try {
        // Buscar conversaciones recientes
        const q = query(
            collection(db, "conversations"),
            where("members", "array-contains", user!.uid),
            limit(10)
        );
        const snap = await getDocs(q);
        const userIds = new Set<string>();
        
        snap.forEach(d => {
            const data = d.data();
            const other = data.members?.find((id: string) => id !== user!.uid);
            if (other) userIds.add(other);
        });

        const users: any[] = [];
        for (const uid of userIds) {
            // Evitar re-fetchear si ya tenemos muchos, o hacerlo en batch si fuera necesario
            // Aquí lo hacemos simple 1 a 1
            const userDoc = await getDoc(doc(db, "users", uid));
            if (userDoc.exists()) {
                users.push({ id: userDoc.id, ...userDoc.data() });
            }
        }
        setRecentBuyers(users);
    } catch (e) {
        console.error("Error fetching recent buyers", e);
    } finally {
        setLoadingRecent(false);
    }
  };



  const confirmSale = async () => {
    if (!selectedVehicle || !finalPrice || !user) return;

    if (selectedBuyer?.id && selectedBuyer.id === user.uid) {
      showAlert("Error", "No podés registrarte como comprador de tu propio auto.", "error");
      return;
    }
    setSubmittingSale(true);
    try {
      const vehicleSnapshot: any = {
        brand: selectedVehicle.brand || "Desconocido",
        model: selectedVehicle.model || "Desconocido",
        year:
          typeof selectedVehicle.year === "string"
            ? parseInt(selectedVehicle.year) || 0
            : selectedVehicle.year || 0,
      };
      if (selectedVehicle.coverImage) {
        vehicleSnapshot.coverImage = selectedVehicle.coverImage;
      }

      const saleData: any = {
        vehicleId: selectedVehicle.id,
        sellerId: user.uid,
        sellerName: user.displayName || user.email || "Vendedor",
        buyerName: selectedBuyer ? buyerName : buyerSearchQuery || "Comprador Externo",
        finalPrice: parseFloat(finalPrice) || 0,
        currency: (selectedVehicle.currency as "ARS" | "USD") || "USD",
        soldAt: serverTimestamp(),
        source: selectedBuyer ? "matchcars" : "external",
        vehicleSnapshot,
      };

      if (selectedBuyer?.id) {
        saleData.buyerId = selectedBuyer.id;
      }

      // ID = vehicleId → garantiza un único documento de venta por vehículo, sin duplicados
      const saleDocId = selectedVehicle.id;
      await setDoc(doc(db, "sales", saleDocId), saleData, { merge: true });

      try {
        if (saleData.buyerId && saleData.source === "matchcars") {
          const notifRef = doc(collection(db, "users", saleData.buyerId, "rating_notifications"));
          await setDoc(notifRef, {
            type: "rate_seller",
            title: "Calificá tu experiencia",
            message: `Contanos cómo fue la compra de tu ${vehicleSnapshot.brand} ${vehicleSnapshot.model}.`,
            saleId: saleDocId,
            sellerId: saleData.sellerId,
            sellerName: saleData.sellerName,
            vehicleId: saleData.vehicleId,
            vehicle: {
              brand: vehicleSnapshot.brand,
              model: vehicleSnapshot.model,
              year: vehicleSnapshot.year,
              coverImage: vehicleSnapshot.coverImage || null
            },
            read: false,
            createdAt: serverTimestamp()
          });
        }
      } catch (e) {
        console.error("Error creating rating notification", e);
      }

      // 2. Update Vehicle Status
      const vehicleRef = doc(db, "vehicles", selectedVehicle.id);
      await updateDoc(vehicleRef, {
        status: "sold",
        published: false,
        soldAt: serverTimestamp()
      });

      // 2b. Sync lead (if coming from CRM)
      try {
        if (leadToSync?.id) {
          const priceNum = parseFloat(finalPrice);
          const dealPrice = isNaN(priceNum) ? undefined : priceNum;
          const currency = (selectedVehicle.currency as "ARS" | "USD") || "USD";
          const ref = doc(db, "leads", leadToSync.id);
          const updates: any = {
            status: "won",
            wonAt: serverTimestamp(),
          };
          if (dealPrice && dealPrice > 0) updates.dealPrice = dealPrice;
          updates.dealCurrency = currency;
          await updateDoc(ref, updates);
        }
      } catch (e) {
        console.error("Error syncing lead after sale", e);
      }

      // 3. Update User Stats
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        salesCount: increment(1)
      });
      
      // Update trust level
      await refreshTrustLevel();

      setSaleModalVisible(false);
      showAlert("¡Felicitaciones!", "Tu venta ha sido registrada y tu historial actualizado.", "success");
    } catch (error) {
      console.error(error);
      showAlert("Error", "No se pudo registrar la venta.", "error");
    } finally {
      setSubmittingSale(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setMyVehicles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = query(collection(db, "vehicles"), where("userId", "==", user.uid));
    const unsub = onSnapshot(ref, (snap) => {
      const items: Vehicle[] = [];
      snap.forEach((doc) => {
        const data = doc.data() as Vehicle;
        if (data.status === 'deleted') return;
        items.push({ ...data, id: doc.id });
      });
      // Sort: Pending first, then Active, then Sold
      items.sort((a, b) => {
          const aPending = a.status === 'pending' || a.status === 'pending_review';
          const bPending = b.status === 'pending' || b.status === 'pending_review';
          if (aPending && !bPending) return -1;
          if (bPending && !aPending) return 1;
          if (a.status === 'sold' && b.status !== 'sold') return 1;
          if (b.status === 'sold' && a.status !== 'sold') return -1;
          // Then by date
          return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      });
      setMyVehicles(items);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  // Sincronización de likedBy se hace al momento del like (en index/favorites)

  if (!user) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}>
        <WebContainer>
        <Header />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ color: theme.text, fontSize: 16, textAlign: "center" }}>
            Para gestionar tus autos, iniciá sesión o registrate.
          </Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
            <TouchableOpacity onPress={() => router.push("/login")} style={{ backgroundColor: theme.buttonBackground, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 }}>
              <Text style={{ color: theme.buttonText, fontWeight: "700" }}>Iniciar sesión</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/register")} style={{ backgroundColor: theme.accent, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 }}>
              <Text style={{ color: theme.buttonText, fontWeight: "700" }}>Registrarme</Text>
            </TouchableOpacity>
          </View>
        </View>
        </WebContainer>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}>
      <CustomAlert
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={alertConfig.onConfirm || (() => setAlertVisible(false))}
        showCancel={alertConfig.showCancel}
        onCancel={alertConfig.onCancel || (() => setAlertVisible(false))}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
      />
      <WebContainer>
      <Header />
      <View style={{ padding: 16, flex: 1 }}>
        {Platform.OS === 'web' && !isDealerPlan(profile?.plan) && (
            <View style={{ marginBottom: 16 }}>
                <DownloadAppBanner message="Descargá la App para gestionar mejor tus ventas" />
            </View>
        )}
        {/* Stats Bar */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20, backgroundColor: theme.card, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: theme.inputBackground }}>
             <View style={{ alignItems: 'center' }}>
                <Text style={{ color: theme.title, fontSize: 20, fontWeight: '700' }}>{myVehicles.filter(v => v.published).length}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>Publicados</Text>
             </View>
             <View style={{ height: '100%', width: 1, backgroundColor: theme.inputBackground }} />
             <View style={{ alignItems: 'center' }}>
                <Text style={{ color: theme.title, fontSize: 20, fontWeight: '700' }}>{profile?.salesCount || 0}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>Ventas</Text>
             </View>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
            <TouchableOpacity 
              onPress={() => router.push("/(screens)/add-car")} 
              style={{ 
                backgroundColor: theme.accent, 
                borderRadius: 12, 
                paddingVertical: 12, 
                paddingHorizontal: 16, 
                alignItems: "center",
                flexDirection: "row",
                gap: 8,
                flex: 1,
                justifyContent: "center"
              }}
            >
              <Ionicons name="add-circle" size={24} color={theme.buttonText} />
              <Text style={{ color: theme.buttonText, fontWeight: "700", fontSize: 16 }}>Publicar auto</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={handleShareProfile} style={{ backgroundColor: theme.card, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center", borderWidth: 1, borderColor: theme.inputBackground, justifyContent: "center" }}>
              <Ionicons name="share-outline" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "center", marginBottom: 10, backgroundColor: theme.card, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.inputBackground }}>
             <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>Publicaciones:</Text>
                <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13 }}>
                   {pubLimit === Infinity ? "Ilimitadas" : `${totalVehiclesCount} / ${pubLimit}`}
                </Text>
             </View>
             <View style={{ width: 1, height: 16, backgroundColor: theme.inputBackground }} />
             <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>Destacados:</Text>
                <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 13 }}>
                   {quotaLimit === Infinity ? "Ilimitados" : `${featuredCount} / ${quotaLimit}`}
                </Text>
             </View>
        </View>

        <View style={{ flexDirection: "row", marginBottom: 12, backgroundColor: theme.card, borderRadius: 999, padding: 4, borderWidth: 1, borderColor: theme.inputBackground }}>
          <TouchableOpacity
            onPress={() => setActiveFilter("published")}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: activeFilter === "published" ? theme.accent : "transparent",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <Text style={{ color: activeFilter === "published" ? "#FFF" : theme.text, fontSize: 12, fontWeight: "700" }}>
              Publicados
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveFilter("review")}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: activeFilter === "review" ? theme.accent : "transparent",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <Text style={{ color: activeFilter === "review" ? "#FFF" : theme.text, fontSize: 12, fontWeight: "700" }}>
              En revisión
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveFilter("rejected")}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: activeFilter === "rejected" ? theme.accent : "transparent",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <Text style={{ color: activeFilter === "rejected" ? "#FFF" : theme.text, fontSize: 12, fontWeight: "700" }}>
              Rechazados
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveFilter("sold")}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: activeFilter === "sold" ? theme.accent : "transparent",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <Text style={{ color: activeFilter === "sold" ? "#FFF" : theme.text, fontSize: 12, fontWeight: "700" }}>
              Vendidos
            </Text>
          </TouchableOpacity>
        </View>

        {showSkeleton ? (
          <SkeletonList count={4} />
        ) : filteredVehicles.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }}>
             <Ionicons name="car-sport-outline" size={48} color={theme.textMuted} />
             <Text style={{ color: theme.text, marginTop: 12, fontSize: 16, textAlign: "center", fontWeight: "600" }}>
               Todavía no publicaste ningún auto.
             </Text>
             <Text style={{ color: theme.textMuted, marginTop: 8, fontSize: 14, textAlign: "center", lineHeight: 20 }}>
               Publicar es gratis y te ayudamos a llegar a más compradores interesados.
             </Text>
          </View>
        ) : (
          <FlatList
            style={{ marginTop: 12, flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
            data={filteredVehicles}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={{ marginBottom: 12 }}>
                <CarCard
                  vehicle={item}
                  hideLike
                  showEdit
                  showMetrics={item.published && !!(profile?.plan && profile.plan !== 'free')}
                  showPriceAnalysis={item.published && !!(profile?.plan && ['pro_plus', 'pro_dealer'].some(p => profile.plan.includes(p)))}
                />
                {/* Stats row */}
                {item.published && item.status === "available" && (
                  <View style={{ flexDirection: "row", backgroundColor: theme.card, marginHorizontal: 0, marginTop: -4, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, paddingVertical: 8, paddingHorizontal: 16, gap: 20, borderTopWidth: 1, borderTopColor: theme.background }}>
                    {[
                      { icon: "eye-outline", value: (item as any).views ?? 0, label: "vistas" },
                      { icon: "heart-outline", value: item.likesCount ?? 0, label: "likes" },
                      { icon: "pricetag-outline", value: (item as any).offerCount ?? 0, label: "ofertas" },
                    ].map(s => (
                      <View key={s.label} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Ionicons name={s.icon as any} size={14} color={theme.textMuted} />
                        <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13 }}>{s.value}</Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>{s.label}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Status Indicators */}
                {!item.published && (item.status === "pending" || item.status === "pending_review") && (
                   <View style={{ marginTop: 4, marginBottom: 6, backgroundColor: "#F59E0B", padding: 10, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
                      <Ionicons name="time-outline" size={20} color="#FFF" />
                      <Text style={{ color: "#FFF", fontWeight: "700" }}>Pendiente de Aprobación</Text>
                   </View>
                )}
                
                {!item.published && item.status === "rejected" && (
                   <View style={{ marginTop: 4, marginBottom: 6, backgroundColor: "#EF4444", padding: 10, borderRadius: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                          <Ionicons name="alert-circle-outline" size={20} color="#FFF" />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: "#FFF", fontWeight: "700" }}>Publicación rechazada</Text>
                            {item.rejectionReason ? (
                              <Text style={{ color: "#FFF", marginTop: 2, fontSize: 13 }}>
                                Motivo: {item.rejectionReason}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => {
                            router.push({
                              pathname: "/car/[id]" as any,
                              params: { id: item.id, edit: "true" },
                            });
                          }}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 999,
                            backgroundColor: "#FFF"
                          }}
                        >
                          <Text style={{ color: "#EF4444", fontWeight: "700", fontSize: 13 }}>Corregir</Text>
                        </TouchableOpacity>
                      </View>
                   </View>
                )}
                {!item.published && item.status === "rejected_limit" && (
                   <View style={{ marginTop: 4, marginBottom: 6, backgroundColor: "#F97316", padding: 10, borderRadius: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                          <Ionicons name="lock-closed-outline" size={20} color="#FFF" />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: "#FFF", fontWeight: "700" }}>Límite de plan alcanzado</Text>
                            <Text style={{ color: "#FFF", fontSize: 12, marginTop: 2 }}>
                              {item.rejectedReason || "Actualizá tu plan para publicar más autos."}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => router.push("/(screens)/subscribe")}
                          style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "#FFF" }}
                        >
                          <Text style={{ color: "#F97316", fontWeight: "700", fontSize: 13 }}>Mejorar plan</Text>
                        </TouchableOpacity>
                      </View>
                   </View>
                )}
                {!item.published && item.status === "blocked" && (
                   <View style={{ marginTop: 4, marginBottom: 6, backgroundColor: "#EF4444", padding: 10, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
                      <Ionicons name="ban-outline" size={20} color="#FFF" />
                      <Text style={{ color: "#FFF", fontWeight: "700" }}>Bloqueado por Administración</Text>
                   </View>
                )}

                {/* Feature Toggle Control */}
                {item.published && profile?.plan && (
                  <View style={{ 
                    flexDirection: "row", 
                    alignItems: "center", 
                    justifyContent: "space-between", 
                    backgroundColor: theme.card, 
                    marginTop: 4, 
                    marginBottom: 8,
                    padding: 10,
                    borderBottomLeftRadius: 14,
                    borderBottomRightRadius: 14,
                    borderTopWidth: 1,
                    borderTopColor: theme.background
                  }}>
                    <View>
                        <Text style={{ color: item.isFeatured && getDaysRemaining(item.featuredAt) === 0 ? "#FF6B35" : theme.text, fontSize: 12 }}>
                        {item.isFeatured
                            ? getDaysRemaining(item.featuredAt) === 0
                                ? "⚠️ Destacado expirado"
                                : "🌟 Destacado activo"
                            : "☆ Destacar publicación"}
                        </Text>
                        {item.isFeatured && (
                            <Text style={{ color: getDaysRemaining(item.featuredAt) === 0 ? "#FF6B35" : getDaysRemaining(item.featuredAt) <= 1 ? "#FFA500" : theme.textMuted, fontSize: 10, marginTop: 2 }}>
                                {getDaysRemaining(item.featuredAt) === 0
                                    ? "Renovalo para seguir destacado"
                                    : getDaysRemaining(item.featuredAt) === 1
                                        ? "Vence mañana"
                                        : `Quedan ${getDaysRemaining(item.featuredAt)} días`}
                            </Text>
                        )}
                    </View>
                    <TouchableOpacity 
                      onPress={() => handleToggleFeature(item)}
                      style={{ 
                        backgroundColor: item.isFeatured ? theme.inputBackground : theme.accent, 
                        paddingHorizontal: 12, 
                        paddingVertical: 6, 
                        borderRadius: 6 
                      }}
                    >
                      <Text style={{ 
                        color: item.isFeatured ? theme.text : "#FFF", 
                        fontSize: 12, 
                        fontWeight: "700" 
                      }}>
                        {item.isFeatured ? "Quitar" : "Destacar"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Financing Button */}
                {item.published && item.status !== "sold" && (
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: "/(screens)/car-financing/[id]" as any, params: { id: item.id } })}
                    style={{
                      marginTop: 4,
                      marginBottom: 4,
                      backgroundColor: item.financing?.downPayment || item.acceptsFinancing ? "#EFF6FF" : theme.inputBackground,
                      padding: 10,
                      borderRadius: 12,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 6,
                      borderWidth: 1,
                      borderColor: item.financing?.downPayment || item.acceptsFinancing ? "#1D4ED8" : theme.badgeBorder,
                    }}
                  >
                    <Ionicons name="cash-outline" size={16} color={item.financing?.downPayment || item.acceptsFinancing ? "#1D4ED8" : theme.textMuted} />
                    <Text style={{ color: item.financing?.downPayment || item.acceptsFinancing ? "#1D4ED8" : theme.textMuted, fontWeight: "700", fontSize: 13 }}>
                      {item.financing?.downPayment || item.acceptsFinancing ? "Editar Financiación" : "Agregar Financiación"}
                    </Text>
                    {(item.financing?.downPayment || item.financing?.monthlyPayment) && (
                      <View style={{ backgroundColor: "#1D4ED8", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "800" }}>ACTIVA</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}

                {/* Mark as Sold Button */}
                {item.published && item.status !== "sold" && (
                  <TouchableOpacity
                    onPress={() => openSaleModal(item)}
                    style={{
                      marginTop: 4,
                      backgroundColor: "#2ecc71",
                      padding: 10,
                      borderRadius: 12,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 8
                    }}
                  >
                    <Text style={{ color: "#FFF", fontWeight: "700" }}>🤝 Marcar como Vendido</Text>
                  </TouchableOpacity>
                )}
                
                {item.status === "sold" && (
                   <View style={{ marginTop: 4, marginBottom: 6, backgroundColor: theme.card, padding: 10, borderRadius: 12, alignItems: "center" }}>
                      <Text style={{ color: "#2ecc71", fontWeight: "700" }}>✅ Vendido</Text>
                   </View>
                )}

                {item.status === "reserved" && (
                   <View style={{ marginTop: 4, marginBottom: 6, backgroundColor: theme.card, padding: 10, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
                      <Ionicons name="time-outline" size={18} color="#F59E0B" />
                      <Text style={{ color: "#F59E0B", fontWeight: "700" }}>Reservado — esperando que el comprador confirme la entrega</Text>
                   </View>
                )}
              </View>
            )}
          />
        )}

        {/* Sale Modal */}
        <Modal
          visible={saleModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setSaleModalVisible(false)}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 }}
          >
            <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 20, maxWidth: 500, width: "100%", alignSelf: "center" }}>
              <Text style={{ color: theme.title, fontSize: 20, fontWeight: "700", marginBottom: 16, textAlign: "center" }}>
                ¡Felicitaciones por la venta! 🎉
              </Text>
              
              <Text style={{ color: theme.text, marginBottom: 8 }}>Precio final de venta ({selectedVehicle?.currency})</Text>
              <TextInput
                value={finalPrice}
                onChangeText={setFinalPrice}
                keyboardType="numeric"
                style={{
                  backgroundColor: theme.inputBackground,
                  color: theme.text,
                  padding: 12,
                  borderRadius: 10,
                  marginBottom: 16,
                  fontSize: 16
                }}
                placeholder="Ej: 15000"
                placeholderTextColor={theme.textMuted}
              />

              <Text style={{ color: theme.text, marginBottom: 8 }}>Nombre del comprador (opcional)</Text>
              
              {!selectedBuyer ? (
                <View>
                  <TextInput
                    value={buyerSearchQuery}
                    onChangeText={searchBuyers}
                    style={{
                      backgroundColor: theme.inputBackground,
                      color: theme.text,
                      padding: 12,
                      borderRadius: 10,
                      marginBottom: buyerSearchResults.length > 0 ? 0 : 24,
                      fontSize: 16
                    }}
                    placeholder="Buscar usuario (nombre o email)"
                    placeholderTextColor={theme.textMuted}
                  />
                  {isSearchingBuyer && <ActivityIndicator color={theme.accent} style={{ marginTop: 8 }} />}
                  {buyerSearchResults.length > 0 && (
                     <View style={{ backgroundColor: theme.card, maxHeight: 150, borderWidth: 1, borderColor: theme.inputBackground, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }}>
                        <FlatList
                          data={buyerSearchResults}
                          keyExtractor={(item) => item.id}
                          renderItem={({ item }) => (
                            <TouchableOpacity 
                              onPress={() => selectBuyer(item)}
                              style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: theme.background }}
                            >
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: item.avatarColor || theme.accent, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                                        {item.photoURL || item.avatar ? (
                                            <Image source={{ uri: item.photoURL || item.avatar }} style={{ width: 32, height: 32 }} />
                                        ) : (
                                            <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}>
                                                {item.initials || (item.firstName ? item.firstName.charAt(0) : "?")}
                                            </Text>
                                        )}
                                    </View>
                                    <View>
                                        <Text style={{ color: theme.text, fontWeight: "600" }}>{item.firstName} {item.lastName}</Text>
                                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>{item.email}</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                          )}
                        />
                     </View>
                  )}

                  {recentBuyers.length > 0 && !buyerSearchQuery && (
                    <View style={{ marginTop: 16 }}>
                      <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8, fontWeight: "700" }}>SUGERIDOS (CHATS RECIENTES)</Text>
                      {loadingRecent ? (
                          <ActivityIndicator color={theme.accent} />
                      ) : (
                            <View style={{ backgroundColor: theme.inputBackground, borderRadius: 10, overflow: 'hidden' }}>
                                {recentBuyers.map((item, index) => (
                                    <TouchableOpacity 
                                        key={item.id}
                                        onPress={() => selectBuyer(item)}
                                        style={{ 
                                            padding: 12, 
                                            borderBottomWidth: index === recentBuyers.length - 1 ? 0 : 1, 
                                            borderBottomColor: theme.background,
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: 10
                                        }}
                                    >
                                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: item.avatarColor || theme.accent, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                                            {item.photoURL || item.avatar ? (
                                                <Image source={{ uri: item.photoURL || item.avatar }} style={{ width: 32, height: 32 }} />
                                            ) : (
                                                <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}>
                                                    {item.initials || (item.firstName ? item.firstName.charAt(0) : "?")}
                                                </Text>
                                            )}
                                        </View>
                                        <View>
                                            <Text style={{ color: theme.text, fontWeight: "600" }}>{item.firstName} {item.lastName}</Text>
                                            <Text style={{ color: theme.textMuted, fontSize: 12 }}>{item.email}</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>
                  )}

                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4, marginBottom: 16 }}>
                    Si no encontrás al usuario, podés ingresar el nombre manualmente abajo:
                  </Text>
                  <TextInput
                    value={buyerName}
                    onChangeText={setBuyerName}
                    style={{
                      backgroundColor: theme.inputBackground,
                      color: theme.text,
                      padding: 12,
                      borderRadius: 10,
                      marginBottom: 24,
                      fontSize: 16
                    }}
                    placeholder="Nombre manual (si no tiene usuario)"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: theme.inputBackground, padding: 12, borderRadius: 10, marginBottom: 24 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                     <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: selectedBuyer.avatarColor || theme.accent, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                        {selectedBuyer.photoURL || selectedBuyer.avatar ? (
                            <Image source={{ uri: selectedBuyer.photoURL || selectedBuyer.avatar }} style={{ width: 32, height: 32 }} />
                        ) : (
                            <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}>
                                {selectedBuyer.initials || (selectedBuyer.firstName ? selectedBuyer.firstName.charAt(0) : "?")}
                            </Text>
                        )}
                     </View>
                     <View>
                         <Text style={{ color: theme.text, fontWeight: "700" }}>{selectedBuyer.firstName} {selectedBuyer.lastName}</Text>
                         <Text style={{ color: theme.textMuted, fontSize: 12 }}>{selectedBuyer.email}</Text>
                     </View>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedBuyer(null)}>
                    <Text style={{ color: theme.accent, fontWeight: "600" }}>Cambiar</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity 
                  onPress={() => setSaleModalVisible(false)}
                  style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: theme.buttonBackground, alignItems: "center" }}
                >
                  <Text style={{ color: theme.text, fontWeight: "700" }}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  onPress={confirmSale}
                  disabled={submittingSale}
                  style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: "#2ecc71", alignItems: "center" }}
                >
                  {submittingSale ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={{ color: "#FFF", fontWeight: "700" }}>Confirmar Venta</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
      </WebContainer>
    </SafeAreaView>
  );
}
