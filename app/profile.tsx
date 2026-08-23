// app/profile.tsx
import { CustomAlert } from "@/components/CustomAlert";
import { DownloadAppBanner } from "@/components/DownloadAppBanner";
import { Header } from "@/components/Header";
import { PriceRecommendation } from "@/components/PriceRecommendation";
import { WebContainer } from "@/components/WebContainer";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db, storage } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { analyzeMarketPrice } from "@/lib/pricing";
import { canAccessCRM, isDealerPlan } from "@/lib/planChecks";
import { fetchDealerReportData, generateCSV, generatePDF, shareFile } from "@/lib/reporting";
import { submitSellerRating } from "@/lib/ratings";
import { TrustLevel } from "@/types/commerce";
import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { collection, doc, documentId, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { formatNumber } from "@/utils/format";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ProfileScreen() {
  const { theme, themeName, setThemeName } = useTheme();
  const { user, profile, deleteAccount } = useAuth();
  const router = useRouter();
  const [dealerStats, setDealerStats] = useState({ cars: 0, views: 0, likes: 0 });
  const [leadStats, setLeadStats] = useState({
    total: 0,
    nuevo: 0,
    negociacion: 0,
    vendido: 0,
    perdido: 0,
  });
  const [purchases, setPurchases] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]); // New: Sales State
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [activeTab, setActiveTab] = useState<"purchases" | "sales">("purchases"); // New: Tab State
  const [uploadingImage, setUploadingImage] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  
  // Price Suggestion State
  const [topSuggestion, setTopSuggestion] = useState<any>(null);
  const [, setSuggestionLoading] = useState(false);
  const [hideDashboardSuggestion, setHideDashboardSuggestion] = useState(false);

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

  
  // Navigation Refs
  const scrollViewRef = useRef<ScrollView>(null);
  const [transactionsY, setTransactionsY] = useState(0);

  const scrollToTransactions = (tab: "purchases" | "sales") => {
    setActiveTab(tab);
    if (scrollViewRef.current && transactionsY > 0) {
        // Scroll with offset to ensure header visibility
        scrollViewRef.current.scrollTo({ y: transactionsY - 100, animated: true }); 
    } else {
        logger.warn("Scroll failed: Ref null or Y invalid", transactionsY);
    }
  };
  
  // Rating State
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<any>(null);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);

  const findTopSuggestion = useCallback(
    async (vehicles: any[]) => {
      if (hideDashboardSuggestion) return;
      setSuggestionLoading(true);
      let maxDiff = 0;
      let bestCandidate: any = null;
      let bestAnalysis: any = null;

      const candidates = vehicles
        .filter((v) => v.status !== "sold" && v.status !== "deleted")
        .slice(0, 10);

      for (const v of candidates) {
        if (!v.brand || !v.model || !v.year || !v.price) continue;

        try {
          const analysis = await analyzeMarketPrice(
            v.brand,
            v.model,
            Number(v.year),
            v.currency || "ARS"
          );
          if (analysis.avg > 0 && v.price > analysis.avg) {
            const diff = ((v.price - analysis.avg) / analysis.avg) * 100;
            if (diff > 5 && diff > maxDiff) {
              maxDiff = diff;
              bestCandidate = v;
              bestAnalysis = analysis;
            }
          }
        } catch {}
      }

      if (bestCandidate && bestAnalysis) {
        setTopSuggestion({ vehicle: bestCandidate, analysis: bestAnalysis });
      }
      setSuggestionLoading(false);
    },
    [hideDashboardSuggestion]
  );

  const handleDashboardPriceUpdate = async (targetPrice: number) => {
      if (!topSuggestion) return;
      try {
          const ref = doc(db, "vehicles", topSuggestion.vehicle.id);
          await updateDoc(ref, {
              price: targetPrice,
              updatedAt: serverTimestamp()
          });
          showAlert("Precio actualizado", "El precio se ha actualizado correctamente.", "success");
          setTopSuggestion(null); // Remove suggestion after action
      } catch (e) {
          logger.log(e);
          showAlert("Error", "No se pudo actualizar el precio.", "error");
      }
  };

  useEffect(() => {
    if (user && profile?.plan && profile.plan.includes("pro_dealer")) {
      const fetchStats = async () => {
        try {
          const vehiclesQuery = query(
            collection(db, "vehicles"),
            where("userId", "==", user.uid)
          );
          const leadsQuery = query(
            collection(db, "leads"),
            where("sellerId", "==", user.uid)
          );

          const [vehiclesSnap, leadsSnap]: any = await Promise.all([
            getDocs(vehiclesQuery),
            getDocs(leadsQuery),
          ]);

          let totalViews = 0;
          let totalLikes = 0;
          const vehicles: any[] = [];
          const vehicleDocs: any[] = vehiclesSnap?.docs ?? [];
          for (const d of vehicleDocs) {
            const data = d.data();
            vehicles.push({ id: d.id, ...data });
            totalViews += data.views || 0;
            totalLikes += data.likesCount || 0;
          }
          setDealerStats({
            cars: vehicleDocs.length,
            views: totalViews,
            likes: totalLikes,
          });

          const leadDocs: any[] = leadsSnap?.docs ?? [];
          const stats = {
            total: leadDocs.length,
            nuevo: 0,
            negociacion: 0,
            vendido: 0,
            perdido: 0,
          };
          for (const d of leadDocs) {
            const data: any = d.data();
            if (data.status === "new") stats.nuevo += 1;
            else if (data.status === "negotiation") stats.negociacion += 1;
            else if (data.status === "won") stats.vendido += 1;
            else if (data.status === "lost") stats.perdido += 1;
          }
          setLeadStats(stats);

          findTopSuggestion(vehicles);
        } catch (e) {
          logger.log("Error fetching dealer stats", e);
        }
      };
      fetchStats();
    }
  }, [user, profile, findTopSuggestion]);

  const fetchTransactions = useCallback(async () => {
    setLoadingTransactions(true);

    let pendingPurchases: any[] = [];
    let pendingSales: any[] = [];

    try {
        if (!user?.uid) {
            setLoadingTransactions(false);
            return;
        }

        // Fetch Purchases and Sales in parallel, handling errors independently
        const [purchasesResult, salesResult] = await Promise.allSettled([
            getDocs(query(collection(db, "sales"), where("buyerId", "==", user.uid))),
            getDocs(query(collection(db, "sales"), where("sellerId", "==", user.uid)))
        ]);

        // Process Purchases
        if (purchasesResult.status === "fulfilled" && purchasesResult.value) {
            const snapPurchases: any = purchasesResult.value;
            const docsPurchases: any[] = snapPurchases?.docs ?? [];
            logger.log("DEBUG: Purchases query success, docs found:", docsPurchases.length);
            
            const purchaseItems: any[] = [];
            const missingSellerIds = new Set<string>();

            for (const d of docsPurchases) {
              const data = d.data();
              const nameIsId =
                data.sellerName &&
                /^[a-zA-Z0-9]{20,}$/.test(data.sellerName) &&
                !data.sellerName.includes(" ");
              
              if ((!data.sellerName || nameIsId) && data.sellerId) {
                missingSellerIds.add(data.sellerId);
              }
              purchaseItems.push({ id: d.id, ...data });
            }

            // Fetch missing seller names
            if (missingSellerIds.size > 0) {
                logger.log("DEBUG: Fetching missing seller names for IDs:", Array.from(missingSellerIds));
                try {
                    const sellerPromises = Array.from(missingSellerIds).map(id => getDoc(doc(db, "users", id)));
                    const sellerSnaps = await Promise.all(sellerPromises);
                    const sellerMap = new Map<string, string>();
                    
                    const snapsArr: any[] = Array.isArray(sellerSnaps) ? sellerSnaps : [];
                    for (const s of snapsArr) {
                      if (s && typeof s.exists === "function" && s.exists()) {
                        const u = s.data();
                        const name =
                          `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
                          u.displayName ||
                          "Vendedor";
                        sellerMap.set(s.id, name);
                      }
                    }

                    // Update items with fetched names
                    for (const item of purchaseItems) {
                        const nameIsId =
                          item.sellerName &&
                          /^[a-zA-Z0-9]{20,}$/.test(item.sellerName) &&
                          !item.sellerName.includes(" ");
                        if ((!item.sellerName || nameIsId) && item.sellerId && sellerMap.has(item.sellerId)) {
                            item.sellerName = sellerMap.get(item.sellerId);
                        }
                    }
                } catch (err) {
                    logger.log("Error fetching seller details:", err);
                }
            }

            // Dedup por vehicleId — igual que ventas
            pendingPurchases = Object.values(
              purchaseItems.reduce((acc: Record<string, any>, item: any) => {
                const vid = item.vehicleId ?? item.id;
                const existing = acc[vid];
                if (!existing || (item.soldAt?.seconds ?? 0) > (existing.soldAt?.seconds ?? 0)) acc[vid] = item;
                return acc;
              }, {})
            ) as any[];
        }

        // Process Sales
        if (salesResult.status === "fulfilled" && salesResult.value) {
            const snapSales: any = salesResult.value;
            const docsSales: any[] = snapSales?.docs ?? [];
            logger.log("DEBUG: Sales query success, docs found:", docsSales.length);
            
            const saleItems: any[] = [];
            const missingBuyerIds = new Set<string>();

            for (const d of docsSales) {
              const data = d.data();
              const nameIsId =
                data.buyerName &&
                /^[a-zA-Z0-9]{20,}$/.test(data.buyerName) &&
                !data.buyerName.includes(" ");
              const nameIsEmail = data.buyerName && data.buyerName.includes("@");
              
              if ((!data.buyerName || nameIsId || nameIsEmail) && data.buyerId) {
                missingBuyerIds.add(data.buyerId);
              }
              saleItems.push({ id: d.id, ...data });
            }

            // Fetch missing buyer names
            if (missingBuyerIds.size > 0) {
                 try {
                    const buyerPromises = Array.from(missingBuyerIds).map(id => getDoc(doc(db, "users", id)));
                    const buyerSnaps = await Promise.all(buyerPromises);
                    const buyerMap = new Map<string, string>();
                    
                    const buyersArr: any[] = Array.isArray(buyerSnaps) ? buyerSnaps : [];
                    for (const s of buyersArr) {
                      if (s && typeof s.exists === "function" && s.exists()) {
                        const u = s.data();
                        const name =
                          (u.firstName && u.lastName)
                            ? `${u.firstName} ${u.lastName}`.trim()
                            : (u.firstName || u.displayName || "Comprador");
                        buyerMap.set(s.id, name);
                      }
                    }

                    // Update items with fetched names
                    for (const item of saleItems) {
                        const nameIsId =
                          item.buyerName &&
                          /^[a-zA-Z0-9]{20,}$/.test(item.buyerName) &&
                          !item.buyerName.includes(" ");
                        const nameIsEmail = item.buyerName && item.buyerName.includes("@");
                        
                        if ((!item.buyerName || nameIsId || nameIsEmail) && item.buyerId && buyerMap.has(item.buyerId)) {
                            item.buyerName = buyerMap.get(item.buyerId);
                        }
                    }
                } catch (err) {
                    logger.log("Error fetching buyer details:", err);
                }
            }

            // Deduplicar por vehicleId — si hay múltiples ventas del mismo auto, mostrar solo la más reciente
            const dedupedSales = Object.values(
              saleItems.reduce((acc: Record<string, any>, item: any) => {
                const vid = item.vehicleId ?? item.id;
                const existing = acc[vid];
                if (!existing || (item.soldAt?.seconds ?? 0) > (existing.soldAt?.seconds ?? 0)) {
                  acc[vid] = item;
                }
                return acc;
              }, {})
            ) as any[];
            pendingSales = dedupedSales;
        }

        // Filter out transactions whose vehicle is no longer sold (e.g. reactivated)
        const allVehicleIds = [
          ...new Set([
            ...pendingPurchases.map((i: any) => i.vehicleId).filter(Boolean),
            ...pendingSales.map((i: any) => i.vehicleId).filter(Boolean),
          ]),
        ];

        if (allVehicleIds.length > 0) {
          const vehicleStatuses = new Map<string, string>();
          for (let i = 0; i < allVehicleIds.length; i += 30) {
            try {
              const chunk = allVehicleIds.slice(i, i + 30);
              const vSnap = await getDocs(
                query(collection(db, "vehicles"), where(documentId(), "in", chunk))
              );
              vSnap.forEach((d) => vehicleStatuses.set(d.id, d.data().status));
            } catch { /* silent — show all if lookup fails */ }
          }
          if (vehicleStatuses.size > 0) {
            pendingPurchases = pendingPurchases.filter(
              (i: any) => vehicleStatuses.get(i.vehicleId) === "sold"
            );
            pendingSales = pendingSales.filter(
              (i: any) => vehicleStatuses.get(i.vehicleId) === "sold"
            );
          }
        }

        setPurchases(pendingPurchases);
        setSales(pendingSales);

    } catch (e: any) {
        logger.log("DEBUG: General Error details:", e);
    } finally {
        setLoadingTransactions(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchTransactions();
    }
  }, [user, fetchTransactions]);

  useFocusEffect(
    useCallback(() => {
      if (user) fetchTransactions();
    }, [user, fetchTransactions])
  );

  const openRatingModal = (purchase: any) => {
    setSelectedPurchase(purchase);
    setRating(5);
    setReview("");
    setRatingModalVisible(true);
  };

  const submitRating = async () => {
    if (!selectedPurchase || !user) return;
    setSubmittingRating(true);
    try {
        // Escribe en sales/{vehicleId} (canónico, así el chat lo ve igual),
        // en `reviews`, y recalcula sellerRating/sellerReviewCount — ver
        // lib/ratings.ts, mismo camino que usa la calificación desde el chat
        // justo después de confirmar la entrega.
        const canonicalSaleId = selectedPurchase.vehicleId || selectedPurchase.id;
        await submitSellerRating({
          vehicleId: canonicalSaleId,
          sellerId: selectedPurchase.sellerId,
          reviewerId: user.uid,
          reviewerName: (profile as any)?.displayName || (profile as any)?.firstName
            ? `${(profile as any)?.firstName ?? ""} ${(profile as any)?.lastName ?? ""}`.trim()
            : user.displayName || user.email || "Anónimo",
          reviewerPhotoUrl: (profile as any)?.photoURL || user.photoURL || null,
          vehicleBrand: selectedPurchase.vehicleBrand || null,
          vehicleModel: selectedPurchase.vehicleModel || null,
          score: rating,
          comment: review,
        });

        // Update local state — match on vehicleId so dedup'd item gets updated
        const canonicalId = selectedPurchase.vehicleId || selectedPurchase.id;
        setPurchases(prev => prev.map(p =>
          (p.vehicleId === canonicalId || p.id === selectedPurchase.id)
            ? { ...p, ratingByBuyer: { score: rating, comment: review }, rating, review }
            : p
        ));
        setRatingModalVisible(false);
        showAlert("Gracias", "Tu calificación ha sido enviada.", "success");
    } catch (e) {
        logger.log("Error submitting rating", e);
        showAlert("Error", "No se pudo enviar la calificación.", "error");
    } finally {
        setSubmittingRating(false);
    }
  };

  const handleUpdateAvatar = () => {
    if (!user) return;
    
    showAlert(
      "Actualizar Foto de Perfil",
      "Seleccioná una opción",
      "info",
      undefined,
      false,
      undefined,
      undefined,
      undefined,
      [
        {
          text: "Tomar Foto",
          onPress: () => {
            setTimeout(() => pickImage("camera"), 1000);
          },
        },
        {
          text: "Elegir de Galería",
          onPress: () => {
            setTimeout(() => pickImage("gallery"), 1000);
          },
        },
        {
          text: "Cancelar",
          style: "cancel",
        },
      ]
    );
  };

  const handleDownloadReport = async (type: 'pdf' | 'csv') => {
    if (!user) return;
    setReportLoading(true);
    try {
        const data = await fetchDealerReportData(user.uid);
        const userName = fullName || "Dealer";
        
        let uri = "";
        let mimeType = "";
        let filename = "";

        if (type === 'pdf') {
            uri = await generatePDF(data, userName);
            mimeType = "application/pdf";
            filename = "Reporte_Matchcars.pdf";
        } else {
            uri = await generateCSV(data, userName);
            mimeType = "text/csv";
            filename = "Reporte_Matchcars.csv";
        }

        await shareFile(uri, mimeType, filename);
    } catch (e) {
        console.error(e);
        showAlert("Error", "No se pudo generar el reporte.", "error");
    } finally {
        setReportLoading(false);
    }
  };

  const pickImage = async (mode: "camera" | "gallery") => {
    try {
      let result;
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      };

      if (mode === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== "granted") {
          showAlert("Permiso denegado", "Se necesita acceso a la cámara para tomar fotos. Por favor revisá la configuración de tu dispositivo.", "error");
          return;
        }
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== "granted") {
          showAlert("Permiso denegado", "Se necesita acceso a la galería. Por favor revisá la configuración de tu dispositivo.", "error");
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync(options);
      }

      if (!result.canceled) {
        setUploadingImage(true);
        const originalUri = result.assets[0].uri;
        
        // Optimization: Resize to max 800px and compress
        const manipulated = await ImageManipulator.manipulateAsync(
            originalUri,
            [{ resize: { width: 800 } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );

        // Robust Blob creation for React Native (fixes "Network request failed" on some Android devices)
        const blob: Blob = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.onload = function () {
            resolve(xhr.response);
          };
          xhr.onerror = function (e) {
            logger.log(e);
            reject(new TypeError("Network request failed"));
          };
          xhr.responseType = "blob";
          xhr.open("GET", manipulated.uri, true);
          xhr.send(null);
        });

        const storageRef = ref(storage, `profile_images/${user!.uid}`);
        const metadata = { contentType: 'image/jpeg' };
        await uploadBytes(storageRef, blob, metadata);
        const downloadURL = await getDownloadURL(storageRef);

        await updateDoc(doc(db, "users", user!.uid), {
          photoURL: downloadURL
        });
      }
    } catch (error: any) {
      console.error("Error uploading avatar:", error);
      const msg = error?.message || String(error);
      showAlert("Error", `No se pudo actualizar la foto de perfil. ${msg}`, "error");
    } finally {
      setUploadingImage(false);
    }
  };

  const getTrustBadge = (level?: TrustLevel) => {
    switch (level) {
      case "verified": return { label: "Verificado", color: "#3B82F6", icon: "checkmark-circle" };
      case "active": return { label: "Frecuente", color: "#10B981", icon: "shield-checkmark" };
      default: return { label: "Nuevo", color: "#9CA3AF", icon: "leaf" };
    }
  };

  const trustBadge = getTrustBadge(profile?.trustLevel);

  const planLabels: Record<string, string> = {
    free: "Plan Gratuito",
    pro_monthly: "PRO Mensual",
    pro_annual: "PRO Anual",
    pro_plus_monthly: "PRO Plus Mensual",
    pro_plus_annual: "PRO Plus Anual",
    pro_dealer_monthly: "PRO Dealer Mensual",
    pro_dealer_annual: "PRO Dealer Anual",
    pro_dealer: "PRO Dealer",
  };

  const planName = profile?.plan ? planLabels[profile.plan] || "Plan Gratuito" : "Plan Gratuito";
  const isPro = profile?.plan && profile.plan !== "free";

  const fullName = (profile?.firstName || profile?.lastName)
    ? `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim()
    : user?.displayName || "";

  const initials =
    profile?.initials ||
    (profile?.firstName && profile?.lastName
      ? `${profile.firstName[0]}${profile.lastName[0]}`
      : user?.email
      ? user.email.slice(0, 2).toUpperCase()
      : "MC");

  const avatarColor = profile?.avatarColor || theme.accent;

  const createdAtDate = profile?.createdAt && (profile as any).createdAt?.toDate
    ? (profile as any).createdAt.toDate()
    : null;
  const createdAtLabel = createdAtDate
    ? createdAtDate.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <WebContainer>
          <Header />
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
            <Text style={{ color: theme.text, fontSize: 16, textAlign: "center" }}>
              Para ver tu perfil, iniciá sesión o registrate.
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <WebContainer>
        <Header />
        <ScrollView ref={scrollViewRef} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {Platform.OS === 'web' && !profile?.plan?.includes('pro_dealer') && (
            <View style={{ marginBottom: 16 }}>
              <DownloadAppBanner message="Descargá la App para la mejor experiencia" />
            </View>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <TouchableOpacity onPress={() => router.back()} style={{ borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.inputBackground }}>
              <Text style={{ color: theme.text, fontSize: 12 }}>← Volver</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/(tabs)")} style={{ borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.inputBackground }}>
              <Ionicons name="home" size={16} color={theme.text} />
            </TouchableOpacity>
          </View>
        <View style={{ alignItems: "center", marginTop: 8 }}>
          <TouchableOpacity onPress={handleUpdateAvatar} activeOpacity={0.8} style={{ position: "relative" }}>
            {profile?.photoURL ? (
              <Image
                source={{ uri: profile.photoURL }}
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: avatarColor,
                }}
              />
            ) : (
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: avatarColor,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 24 }}>{initials}</Text>
              </View>
            )}
            
            {uploadingImage && (
              <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 40, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color="#FFF" />
              </View>
            )}

            <View style={{ position: "absolute", bottom: 0, right: 0, backgroundColor: theme.card, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: theme.inputBackground }}>
              <Ionicons name="camera" size={12} color={theme.text} />
            </View>
          </TouchableOpacity>

          <Text style={{ color: theme.text, fontSize: 20, fontWeight: "800", marginTop: 8 }}>
            {fullName || profile?.email || user.email || "Usuario"}
          </Text>
          
          {trustBadge && (
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.card, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 6, borderWidth: 1, borderColor: trustBadge.color }}>
              <Ionicons name={trustBadge.icon as any} size={14} color={trustBadge.color} style={{ marginRight: 4 }} />
              <Text style={{ color: trustBadge.color, fontSize: 12, fontWeight: "700" }}>{trustBadge.label}</Text>
            </View>
          )}

          {profile?.kycStatus === "verified" && (
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#10B98122", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 6, borderWidth: 1, borderColor: "#10B981" }}>
              <Ionicons name="shield-checkmark" size={14} color="#10B981" style={{ marginRight: 4 }} />
              <Text style={{ color: "#10B981", fontSize: 12, fontWeight: "700" }}>Identidad verificada</Text>
            </View>
          )}

          <Text style={{ color: theme.textLight, marginTop: 2, fontSize: 12 }}>{profile?.email ?? user.email ?? ""}</Text>
          {profile?.role && (
            <Text style={{ color: theme.subtext, marginTop: 2, fontSize: 12 }}>Rol: {profile.role}</Text>
          )}

          <TouchableOpacity 
            onPress={() => router.push("/edit-profile" as any)}
            style={{ 
              marginTop: 12, 
              backgroundColor: theme.card, 
              paddingVertical: 8, 
              paddingHorizontal: 20, 
              borderRadius: 999, 
              borderWidth: 1, 
              borderColor: theme.inputBackground,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8
            }}
          >
             <Ionicons name="create-outline" size={16} color={theme.text} />
             <Text style={{ color: theme.text, fontWeight: "600", fontSize: 14 }}>
               {profile?.plan && profile.plan.includes('pro_dealer') ? "Configurar Agencia" : "Editar Perfil"}
             </Text>
          </TouchableOpacity>

          {profile?.plan && profile.plan.includes('pro_dealer') && (
             <TouchableOpacity 
                onPress={() => router.push(`/(screens)/user-profile/${user.uid}` as any)}
                style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
             >
                <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '600' }}>Ver cómo me ven</Text>
                <Ionicons name="eye-outline" size={16} color={theme.accent} />
             </TouchableOpacity>
          )}
        </View>

        <View style={{ marginTop: 16, gap: 12 }}>
          {profile?.plan && profile.plan.includes('pro_dealer') && (
            <View style={{ backgroundColor: theme.card, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#9013FE' }}>
              <View style={{ backgroundColor: '#9013FE', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                 <Ionicons name="bar-chart" size={20} color="#FFF" />
                 <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 14, textTransform: 'uppercase' }}>Dealer Dashboard</Text>
              </View>
              <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
                <TouchableOpacity onPress={() => router.push("/(tabs)/mycars")} style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800' }}>{dealerStats.cars}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>Autos</Text>
                </TouchableOpacity>
                <View style={{ width: 1, backgroundColor: theme.border }} />
                <TouchableOpacity onPress={() => router.push("/(tabs)/mycars")} style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800' }}>{dealerStats.views}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>Vistas</Text>
                </TouchableOpacity>
                <View style={{ width: 1, backgroundColor: theme.border }} />
                <TouchableOpacity onPress={() => router.push("/(tabs)/interesados")} style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800' }}>{dealerStats.likes}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>Likes</Text>
                </TouchableOpacity>
              </View>

              <View style={{ height: 1, backgroundColor: theme.border, marginTop: 4 }} />

              <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
                <Text style={{ color: theme.textMuted, fontSize: 11, marginBottom: 6, fontWeight: "600" }}>
                  Leads / CRM
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                  }}
                >
                  {[
                    { label: "Total", value: leadStats.total },
                    { label: "Nuevos", value: leadStats.nuevo },
                    { label: "En negociación", value: leadStats.negociacion },
                    { label: "Vendidos", value: leadStats.vendido },
                    { label: "Perdidos", value: leadStats.perdido },
                  ].map((s) => (
                    <View
                      key={s.label}
                      style={{
                        width: "48%",
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderRadius: 10,
                        backgroundColor: theme.inputBackground,
                        marginBottom: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: theme.textMuted,
                          fontSize: 11,
                          marginBottom: 2,
                        }}
                      >
                        {s.label}
                      </Text>
                      <Text
                        style={{
                          color: theme.text,
                          fontSize: 15,
                          fontWeight: "700",
                        }}
                      >
                        {s.value}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {topSuggestion && !hideDashboardSuggestion && (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                    <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>
                        Sugerencia para: <Text style={{ fontWeight: '700' }}>{topSuggestion.vehicle.brand} {topSuggestion.vehicle.model}</Text>
                    </Text>
                    <PriceRecommendation
                        currentPrice={Number(topSuggestion.vehicle.price)}
                        avgPrice={topSuggestion.analysis.avg}
                        currency={topSuggestion.vehicle.currency || "ARS"}
                        onLowerPrice={handleDashboardPriceUpdate}
                        onIgnore={() => {
                            setHideDashboardSuggestion(true);
                            setTopSuggestion(null);
                        }}
                    />
                  </View>
              )}
              
              <View style={{ height: 1, backgroundColor: theme.border }} />

              <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-around' }}>
                <TouchableOpacity onPress={() => scrollToTransactions("sales")} style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800' }}>{sales.length}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>Ventas</Text>
                </TouchableOpacity>
                <View style={{ width: 1, backgroundColor: theme.border }} />
                <TouchableOpacity onPress={() => scrollToTransactions("purchases")} style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800' }}>{purchases.length}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>Compras</Text>
                </TouchableOpacity>
              </View>

              <View style={{ height: 1, backgroundColor: theme.border }} />
              
              <View style={{ padding: 16 }}>
                 <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8, fontWeight: '600' }}>REPORTES DE RENDIMIENTO</Text>
                 <View style={{ flexDirection: 'row', gap: 12 }}>
                   <TouchableOpacity 
                      onPress={() => handleDownloadReport('pdf')}
                      disabled={reportLoading}
                      style={{ flex: 1, backgroundColor: theme.inputBackground, paddingVertical: 10, borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                   >
                      {reportLoading ? <ActivityIndicator color={theme.text} size="small" /> : <Ionicons name="document-text-outline" size={16} color={theme.text} />}
                      <Text style={{ color: theme.text, fontWeight: '600', fontSize: 12 }}>PDF</Text>
                   </TouchableOpacity>

                   <TouchableOpacity 
                      onPress={() => handleDownloadReport('csv')}
                      disabled={reportLoading}
                      style={{ flex: 1, backgroundColor: theme.inputBackground, paddingVertical: 10, borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                   >
                      {reportLoading ? <ActivityIndicator color={theme.text} size="small" /> : <Ionicons name="download-outline" size={16} color={theme.text} />}
                      <Text style={{ color: theme.text, fontWeight: '600', fontSize: 12 }}>CSV</Text>
                   </TouchableOpacity>
                 </View>
              </View>

              <View style={{ height: 1, backgroundColor: theme.likeBoxBackground }} />

              <View style={{ padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <TouchableOpacity onPress={() => router.push("/(tabs)/mycars")} style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ color: '#9013FE', fontWeight: '700', fontSize: 12 }}>GESTIONAR INVENTARIO</Text>
                </TouchableOpacity>
                <View style={{ width: 1, backgroundColor: theme.likeBoxBackground }} />
                <TouchableOpacity onPress={() => router.push("/(screens)/leads" as any)} style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ color: '#9013FE', fontWeight: '700', fontSize: 12 }}>VER LEADS / CRM</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* CRM personal — Pro Plus lo tiene sin ser agencia (sin el resto
              del Dealer Dashboard: sin inventario/reportes, eso sigue siendo
              exclusivo Dealer). El bloque de arriba ya cubre a los dealers. */}
          {profile?.plan && canAccessCRM(profile.plan) && !isDealerPlan(profile.plan) && (
            <TouchableOpacity
              onPress={() => router.push("/(screens)/leads" as any)}
              style={{
                marginTop: 12,
                backgroundColor: theme.card,
                borderRadius: 12,
                padding: 14,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Ionicons name="chatbubbles-outline" size={20} color={theme.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14 }}>Mis consultas (CRM)</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>Organizá y seguí las consultas de tus autos.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          )}

          {(profile?.role === 'admin' || profile?.role === 'moderator') && (
            <View style={{ gap: 12, marginTop: 12 }}>
              <TouchableOpacity 
                onPress={() => router.push("/(admin)/dashboard")}
                style={{ backgroundColor: "#10B981", padding: 12, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                <Ionicons name="shield-checkmark" size={20} color="#FFF" />
                <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 14 }}>PANEL DE ADMIN (UNIFICADO)</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ backgroundColor: theme.card, borderRadius: 12, padding: 12 }}>
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14 }}>Suscripción</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: isPro ? theme.accent : theme.textMuted, fontSize: 16, fontWeight: "800" }}>
                  {planName}
                </Text>
                <Text style={{ color: theme.textLight, fontSize: 12 }}>
                  {isPro ? "Beneficios activos" : "Límite: 1 auto"}
                </Text>
              </View>
              <TouchableOpacity 
                onPress={() => router.push("/(screens)/subscribe")}
                style={{ 
                  backgroundColor: isPro ? theme.card : theme.accent,
                  borderWidth: isPro ? 1 : 0,
                  borderColor: theme.accent,
                  paddingHorizontal: 12, 
                  paddingVertical: 6, 
                  borderRadius: 8 
                }}
              >
                <Text style={{ color: isPro ? theme.accent : "#FFF", fontSize: 12, fontWeight: "700" }}>
                  {isPro ? "Gestionar Plan" : "Mejorar Plan"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ backgroundColor: theme.card, borderRadius: 12, padding: 12 }}>
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14 }}>Información</Text>
            <View style={{ marginTop: 4, gap: 2 }}>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>Nombre: {fullName || "—"}</Text>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>Correo: {profile?.email ?? user.email ?? "—"}</Text>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>Registrado: {createdAtLabel}</Text>
            </View>
          </View>

          {/* Mis Compras / Ventas */}
          <View 
            onLayout={(event) => {
                const layout = event.nativeEvent.layout;
                setTransactionsY(layout.y);
            }}
            style={{ backgroundColor: theme.card, borderRadius: 12, padding: 12 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 12 }}>
                <TouchableOpacity 
                    onPress={() => setActiveTab("purchases")}
                    style={{ 
                        borderBottomWidth: activeTab === "purchases" ? 2 : 0, 
                        borderBottomColor: theme.accent,
                        paddingBottom: 4
                    }}
                >
                    <Text style={{ 
                        color: activeTab === "purchases" ? theme.text : theme.textMuted, 
                        fontWeight: "700", 
                        fontSize: 14 
                    }}>
                        Mis Compras
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    onPress={() => setActiveTab("sales")}
                    style={{ 
                        borderBottomWidth: activeTab === "sales" ? 2 : 0, 
                        borderBottomColor: theme.accent,
                        paddingBottom: 4
                    }}
                >
                    <Text style={{ 
                        color: activeTab === "sales" ? theme.text : theme.textMuted, 
                        fontWeight: "700", 
                        fontSize: 14 
                    }}>
                        Mis Ventas
                    </Text>
                </TouchableOpacity>
            </View>

            {loadingTransactions ? (
              <ActivityIndicator color={theme.accent} />
            ) : activeTab === "purchases" ? (
                // --- PURCHASES LIST ---
                purchases.length === 0 ? (
                    <Text style={{ color: theme.textMuted, fontSize: 12, fontStyle: 'italic' }}>
                        Aún no registraste compras en la plataforma.
                    </Text>
                ) : (
                purchases.map((purchase) => (
                    <TouchableOpacity 
                        key={purchase.id} 
                        style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}
                        onPress={() => router.push(`/car/${purchase.vehicleId}`)}
                    >
                        <Text style={{ color: theme.text, fontWeight: "600" }}>
                            {purchase.vehicleSnapshot?.brand} {purchase.vehicleSnapshot?.model} {purchase.vehicleSnapshot?.year}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                            Vendedor: {purchase.sellerName || "Vendedor"}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                            Precio: {purchase.currency} {formatNumber(purchase.finalPrice)}
                        </Text>
                        
                        {(purchase.ratingByBuyer?.score ?? purchase.rating) ? (
                            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                                <Text style={{ color: "#F59E0B", fontSize: 12 }}>{'★'.repeat(purchase.ratingByBuyer?.score ?? purchase.rating)}</Text>
                                <Text style={{ color: theme.textMuted, fontSize: 12, marginLeft: 4 }}>Calificado</Text>
                            </View>
                        ) : (
                            <TouchableOpacity
                                onPress={() => openRatingModal(purchase)}
                                style={{ marginTop: 8, backgroundColor: theme.accent, padding: 8, borderRadius: 8, alignItems: "center" }}
                            >
                                <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}>Calificar Vendedor</Text>
                            </TouchableOpacity>
                        )}
                    </TouchableOpacity>
                ))
                )
            ) : (
                // --- SALES LIST ---
                sales.length === 0 ? (
                    <Text style={{ color: theme.textMuted, fontSize: 12, fontStyle: 'italic' }}>
                        Aún no registraste ventas en la plataforma.
                    </Text>
                ) : (
                    sales.map((sale) => (
                        <TouchableOpacity 
                            key={sale.id} 
                            style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}
                            onPress={() => router.push(`/car/${sale.vehicleId}`)}
                        >
                            <Text style={{ color: theme.text, fontWeight: "600" }}>
                                {sale.vehicleSnapshot?.brand} {sale.vehicleSnapshot?.model} {sale.vehicleSnapshot?.year}
                            </Text>
                            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                                Comprador: {sale.buyerName || "Externo / No registrado"}
                            </Text>
                            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                                Precio Final: {sale.currency} {formatNumber(sale.finalPrice)}
                            </Text>
                            {(sale.ratingByBuyer?.score ?? sale.rating) ? (
                                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                                    <Text style={{ color: "#F59E0B", fontSize: 12 }}>{'★'.repeat(sale.ratingByBuyer?.score ?? sale.rating)}</Text>
                                    <Text style={{ color: theme.textMuted, fontSize: 12, marginLeft: 4 }}>
                                      {"\""}
                                      {sale.ratingByBuyer?.comment ?? sale.review ?? "Sin comentario"}
                                      {"\""}
                                    </Text>
                                </View>
                            ) : null}
                        </TouchableOpacity>
                    ))
                )
            )}
          </View>
        </View>

        <View style={{ marginTop: 12, gap: 12 }}>
          <View style={{ backgroundColor: theme.card, borderRadius: 12, padding: 12 }}>
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14 }}>Configuración y Accesos</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <TouchableOpacity
                onPress={() => setThemeName(themeName === "light" ? "dark" : "light")}
                style={{
                  backgroundColor: theme.badgeBackground,
                  borderRadius: 999,
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                }}
              >
                <Text style={{ color: theme.text, fontWeight: "600", fontSize: 12 }}>
                  Tema: {themeName === "light" ? "Claro ☀️" : "Oscuro 🌙"}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={() => router.push("/(tabs)/mycars")}
                style={{ backgroundColor: theme.buttonBackground, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}
              >
                <Text style={{ color: theme.buttonText, fontWeight: "600", fontSize: 12 }}>Mis autos</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={() => router.push("/(tabs)/favorites")}
                style={{ backgroundColor: theme.accent, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}
              >
                <Text style={{ color: theme.buttonText, fontWeight: "600", fontSize: 12 }}>Favoritos</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push("/(screens)/recently-viewed" as any)}
                style={{ backgroundColor: theme.buttonBackground, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}
              >
                <Text style={{ color: theme.buttonText, fontWeight: "600", fontSize: 12 }}>Historial</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  if (!user?.uid) return;
                  const next = !profile?.hideHomeRecentlyViewed;
                  try {
                    await updateDoc(doc(db, "users", user.uid), {
                      hideHomeRecentlyViewed: next,
                    });
                  } catch (e) {
                    console.error("Error updating hideHomeRecentlyViewed", e);
                  }
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: profile?.hideHomeRecentlyViewed ? theme.card : theme.accent,
                  borderRadius: 999,
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 16,
                    borderRadius: 999,
                    backgroundColor: profile?.hideHomeRecentlyViewed ? theme.inputBackground : "#22C55E",
                    marginRight: 8,
                    justifyContent: "center",
                    paddingHorizontal: 2,
                  }}
                >
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 999,
                      backgroundColor: "#FFF",
                      alignSelf: profile?.hideHomeRecentlyViewed ? "flex-start" : "flex-end",
                    }}
                  />
                </View>
                <Text style={{ color: theme.buttonText, fontWeight: "600", fontSize: 12 }}>
                  {profile?.hideHomeRecentlyViewed ? "Seguí viendo oculto" : "Seguí viendo activo"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
onPress={() => router.push("/(screens)/alerts" as any)}
                style={{ backgroundColor: theme.buttonBackground, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}
              >
                <Text style={{ color: theme.buttonText, fontWeight: "600", fontSize: 12 }}>Alertas</Text>
              </TouchableOpacity>

              {profile?.kycStatus !== "verified" ? (
                <TouchableOpacity
                  onPress={() => router.push("/(screens)/verify-identity" as any)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#10B98122", borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: "#10B981" }}
                >
                  <Ionicons name="shield-checkmark-outline" size={14} color="#10B981" />
                  <Text style={{ color: "#10B981", fontWeight: "600", fontSize: 12 }}>Verificar identidad</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#10B98122", borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: "#10B981" }}>
                  <Ionicons name="shield-checkmark" size={14} color="#10B981" />
                  <Text style={{ color: "#10B981", fontWeight: "600", fontSize: 12 }}>Identidad verificada</Text>
                </View>
              )}

              {isPro && (
                <TouchableOpacity
                  onPress={() => Linking.openURL("https://portal.matchcars.app").catch(() => {})}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.buttonBackground, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}
                >
                  <Ionicons name="business-outline" size={14} color={theme.buttonText} />
                  <Text style={{ color: theme.buttonText, fontWeight: "600", fontSize: 12 }}>Portal de Agencias</Text>
                </TouchableOpacity>
              )}

              {(isPro || profile?.role === "admin") && (
                Platform.OS === "web" ? (
                  <TouchableOpacity
                    onPress={() => router.push("/(screens)/bulk-import" as any)}
                    style={{ backgroundColor: theme.accent, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}
                  >
                    <Text style={{ color: theme.buttonText, fontWeight: "600", fontSize: 12 }}>Importar Stock</Text>
                  </TouchableOpacity>
                ) : (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: theme.buttonBackground,
                      borderRadius: 999,
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      opacity: 0.5,
                    }}
                  >
                    <Text style={{ color: theme.buttonText, fontWeight: "600", fontSize: 12, marginRight: 8 }}>
                      Importar Stock
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 10 }}>Solo disponible en web</Text>
                  </View>
                )
              )}
            </View>
          </View>
        </View>

        <View style={{ marginTop: 20, alignItems: "center" }}>
          <TouchableOpacity
            onPress={() => {
              showAlert(
                "Eliminar cuenta",
                "Esto eliminará tu cuenta y todas tus publicaciones. ¿Deseás continuar?",
                "warning",
                async () => {
                  try {
                    await deleteAccount();
                    router.replace("/login");
                  } catch {
                    showAlert("Error", "No se pudo eliminar la cuenta. Intentá nuevamente.", "error");
                  }
                },
                true
              );
            }}
            style={{ padding: 12 }}
          >
            <Text style={{ color: theme.error || "#EF4444", fontSize: 14 }}>Eliminar cuenta</Text>
          </TouchableOpacity>

          {Platform.OS === 'web' && (
            <View style={{ marginTop: 20 }}>
              <DownloadAppBanner message="Descargá nuestra App para la mejor experiencia" />
            </View>
          )}
        </View>
      </ScrollView>

      {/* RATING MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={ratingModalVisible}
        onRequestClose={() => setRatingModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 }}>
            <View style={{ backgroundColor: theme.card, borderRadius: 16, padding: 20, alignItems: "center" }}>
                <Text style={{ color: theme.text, fontSize: 18, fontWeight: "bold", marginBottom: 16 }}>Calificar Vendedor</Text>
                
                <Text style={{ color: theme.textMuted, fontSize: 14, marginBottom: 12 }}>
                    ¿Cómo fue tu experiencia con {selectedPurchase?.sellerName || "el vendedor"}?
                </Text>

                <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                        <TouchableOpacity key={star} onPress={() => setRating(star)}>
                            <Ionicons 
                                name={star <= rating ? "star" : "star-outline"} 
                                size={32} 
                                color="#F59E0B" 
                            />
                        </TouchableOpacity>
                    ))}
                </View>

                <TextInput
                    style={{ 
                        width: "100%", 
                        backgroundColor: theme.inputBackground, 
                        color: theme.text, 
                        borderRadius: 8, 
                        padding: 12, 
                        minHeight: 80, 
                        textAlignVertical: "top",
                        marginBottom: 20
                    }}
                    placeholder="Escribí un comentario (opcional)..."
                    placeholderTextColor={theme.textMuted}
                    multiline
                    value={review}
                    onChangeText={setReview}
                />

                <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
                    <TouchableOpacity 
                        onPress={() => setRatingModalVisible(false)}
                        style={{ flex: 1, padding: 12, alignItems: "center", borderRadius: 8, backgroundColor: theme.inputBackground }}
                    >
                        <Text style={{ color: theme.text, fontWeight: "600" }}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={submitRating}
                        disabled={submittingRating}
                        style={{ flex: 1, padding: 12, alignItems: "center", borderRadius: 8, backgroundColor: theme.accent }}
                    >
                        {submittingRating ? (
                            <ActivityIndicator color="#FFF" size="small" />
                        ) : (
                            <Text style={{ color: "#FFF", fontWeight: "600" }}>Enviar</Text>
                        )}
                    </TouchableOpacity>
                </View>
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
      </WebContainer>
    </SafeAreaView>
  );
}
