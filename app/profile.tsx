// app/profile.tsx
import { CustomAlert } from "@/components/CustomAlert";
import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db, storage } from "@/lib/firebase";
import { TrustLevel } from "@/types/commerce";
import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ProfileScreen() {
  const { theme, themeName, setThemeName } = useTheme();
  const { user, profile, deleteAccount } = useAuth();
  const router = useRouter();
  const [dealerStats, setDealerStats] = useState({ cars: 0, views: 0, likes: 0 });
  const [purchases, setPurchases] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]); // New: Sales State
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [activeTab, setActiveTab] = useState<"purchases" | "sales">("purchases"); // New: Tab State
  const [uploadingImage, setUploadingImage] = useState(false);
  
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
    console.log("Attempting to scroll to transactions. Y:", transactionsY);
    if (scrollViewRef.current && transactionsY > 0) {
        // Scroll with offset to ensure header visibility
        scrollViewRef.current.scrollTo({ y: transactionsY - 100, animated: true }); 
    } else {
        console.warn("Scroll failed: Ref null or Y invalid", transactionsY);
    }
  };
  
  // Rating State
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<any>(null);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);

  useEffect(() => {
    if (user && profile?.plan === 'pro_dealer') {
      const fetchStats = async () => {
        try {
          const q = query(collection(db, "vehicles"), where("userId", "==", user.uid));
          const snap = await getDocs(q);
          let totalViews = 0;
          let totalLikes = 0;
          snap.forEach(d => {
            const data = d.data();
            totalViews += (data.views || 0);
            totalLikes += (data.likesCount || 0);
          });
          setDealerStats({ cars: snap.size, views: totalViews, likes: totalLikes });
        } catch (e) {
          console.error("Error fetching dealer stats", e);
        }
      };
      fetchStats();
    }
  }, [user, profile]);

  useEffect(() => {
    if (user) {
        fetchTransactions();
    }
  }, [user]);

  const fetchTransactions = async () => {
    setLoadingTransactions(true);
    console.log("DEBUG: Fetching transactions for user:", user?.uid);
    
    try {
        if (!user?.uid) {
            console.error("DEBUG: No user UID available for transactions");
            setLoadingTransactions(false);
            return;
        }

        // Fetch Purchases and Sales in parallel, handling errors independently
        const [purchasesResult, salesResult] = await Promise.allSettled([
            getDocs(query(collection(db, "sales"), where("buyerId", "==", user.uid))),
            getDocs(query(collection(db, "sales"), where("sellerId", "==", user.uid)))
        ]);

        // Process Purchases
        if (purchasesResult.status === "fulfilled") {
            const snapPurchases = purchasesResult.value;
            console.log("DEBUG: Purchases query success, docs found:", snapPurchases.size);
            
            const purchaseItems: any[] = [];
            const missingSellerIds = new Set<string>();

            snapPurchases.forEach(d => {
                const data = d.data();
                // Check if seller name is missing OR looks like an ID (long alphanumeric without spaces)
                const nameIsId = data.sellerName && /^[a-zA-Z0-9]{20,}$/.test(data.sellerName) && !data.sellerName.includes(" ");
                
                if ((!data.sellerName || nameIsId) && data.sellerId) {
                    missingSellerIds.add(data.sellerId);
                }
                purchaseItems.push({ id: d.id, ...data });
            });

            // Fetch missing seller names
            if (missingSellerIds.size > 0) {
                console.log("DEBUG: Fetching missing seller names for IDs:", Array.from(missingSellerIds));
                try {
                    const sellerPromises = Array.from(missingSellerIds).map(id => getDoc(doc(db, "users", id)));
                    const sellerSnaps = await Promise.all(sellerPromises);
                    const sellerMap = new Map<string, string>();
                    
                    sellerSnaps.forEach((s: any) => {
                        if (s.exists()) {
                            const u = s.data();
                            const name = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.displayName || "Vendedor";
                            sellerMap.set(s.id, name);
                        }
                    });

                    // Update items with fetched names
                    purchaseItems.forEach(item => {
                        const nameIsId = item.sellerName && /^[a-zA-Z0-9]{20,}$/.test(item.sellerName) && !item.sellerName.includes(" ");
                        if ((!item.sellerName || nameIsId) && item.sellerId && sellerMap.has(item.sellerId)) {
                            item.sellerName = sellerMap.get(item.sellerId);
                        }
                    });
                } catch (err) {
                    console.error("Error fetching seller details:", err);
                }
            }

            setPurchases(purchaseItems);
        } else {
            console.error("DEBUG: Error fetching purchases:", purchasesResult.reason);
        }

        // Process Sales
        if (salesResult.status === "fulfilled") {
            const snapSales = salesResult.value;
            console.log("DEBUG: Sales query success, docs found:", snapSales.size);
            
            const saleItems: any[] = [];
            snapSales.forEach(d => saleItems.push({ id: d.id, ...d.data() }));
            setSales(saleItems);
        } else {
            console.error("DEBUG: Error fetching sales:", salesResult.reason);
        }

    } catch (e: any) {
        console.error("DEBUG: General Error details:", e);
    } finally {
        setLoadingTransactions(false);
    }
  };

  const openRatingModal = (purchase: any) => {
    setSelectedPurchase(purchase);
    setRating(5);
    setReview("");
    setRatingModalVisible(true);
  };

  const submitRating = async () => {
    if (!selectedPurchase) return;
    setSubmittingRating(true);
    try {
        const saleRef = doc(db, "sales", selectedPurchase.id);
        await updateDoc(saleRef, {
            rating: rating,
            review: review
        });
        
        // Update local state
        setPurchases(prev => prev.map(p => p.id === selectedPurchase.id ? { ...p, rating, review } : p));
        setRatingModalVisible(false);
        showAlert("Gracias", "Tu calificación ha sido enviada.", "success");
    } catch (e) {
        console.error("Error submitting rating", e);
        showAlert("Error", "No se pudo enviar la calificación.", "error");
    } finally {
        setSubmittingRating(false);
    }
  };

  const handleUpdateAvatar = async () => {
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
            console.log(e);
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
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header />
      <ScrollView ref={scrollViewRef} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
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
               {profile?.plan === 'pro_dealer' ? "Configurar Agencia" : "Editar Perfil"}
             </Text>
          </TouchableOpacity>

          {profile?.plan === 'pro_dealer' && (
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
          {profile?.plan === 'pro_dealer' && (
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
                <View style={{ width: 1, backgroundColor: theme.likeBoxBackground }} />
                <TouchableOpacity onPress={() => router.push("/(tabs)/mycars")} style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800' }}>{dealerStats.views}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>Vistas</Text>
                </TouchableOpacity>
                <View style={{ width: 1, backgroundColor: theme.likeBoxBackground }} />
                <TouchableOpacity onPress={() => router.push("/(tabs)/interesados")} style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800' }}>{dealerStats.likes}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>Likes</Text>
                </TouchableOpacity>
              </View>
              
              <View style={{ height: 1, backgroundColor: theme.likeBoxBackground }} />
              
              <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-around' }}>
                <TouchableOpacity onPress={() => scrollToTransactions("sales")} style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800' }}>{sales.length}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>Ventas</Text>
                </TouchableOpacity>
                <View style={{ width: 1, backgroundColor: theme.likeBoxBackground }} />
                <TouchableOpacity onPress={() => scrollToTransactions("purchases")} style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800' }}>{purchases.length}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>Compras</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={() => router.push("/(tabs)/mycars")} style={{ borderTopWidth: 1, borderTopColor: theme.likeBoxBackground, padding: 12, alignItems: 'center' }}>
                <Text style={{ color: '#9013FE', fontWeight: '700', fontSize: 12 }}>GESTIONAR INVENTARIO COMPLETO →</Text>
              </TouchableOpacity>
            </View>
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
                  {isPro ? "Beneficios activos" : "Límite: 2 autos"}
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
                        style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.background }}
                        onPress={() => router.push(`/car/${purchase.vehicleId}`)}
                    >
                        <Text style={{ color: theme.text, fontWeight: "600" }}>
                            {purchase.vehicleSnapshot?.brand} {purchase.vehicleSnapshot?.model} {purchase.vehicleSnapshot?.year}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                            Vendedor: {purchase.sellerName || "Vendedor"}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                            Precio: {purchase.currency} {purchase.finalPrice}
                        </Text>
                        
                        {purchase.rating ? (
                            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                                <Text style={{ color: "#F59E0B", fontSize: 12 }}>{'★'.repeat(purchase.rating)}</Text>
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
                            style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.background }}
                            onPress={() => router.push(`/car/${sale.vehicleId}`)}
                        >
                            <Text style={{ color: theme.text, fontWeight: "600" }}>
                                {sale.vehicleSnapshot?.brand} {sale.vehicleSnapshot?.model} {sale.vehicleSnapshot?.year}
                            </Text>
                            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                                Comprador: {sale.buyerName || "Externo / No registrado"}
                            </Text>
                            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                                Precio Final: {sale.currency} {sale.finalPrice}
                            </Text>
                            {sale.rating && (
                                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                                    <Text style={{ color: "#F59E0B", fontSize: 12 }}>{'★'.repeat(sale.rating)}</Text>
                                    <Text style={{ color: theme.textMuted, fontSize: 12, marginLeft: 4 }}>
                                        "{sale.review || "Sin comentario"}"
                                    </Text>
                                </View>
                            )}
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
                true,
                undefined,
                "Eliminar",
                "Cancelar"
              );
            }}
            activeOpacity={0.8}
            style={{ padding: 8 }}
          >
            <Text style={{ color: theme.removeButton, fontWeight: "600", fontSize: 12 }}>Eliminar mi cuenta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Rating Modal */}
      <Modal
        visible={ratingModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRatingModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 }}>
            <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 20 }}>
                <Text style={{ color: theme.title, fontSize: 18, fontWeight: "700", marginBottom: 16, textAlign: "center" }}>
                    Calificar al Vendedor
                </Text>
                
                <View style={{ flexDirection: "row", justifyContent: "center", marginBottom: 20, gap: 10 }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                        <TouchableOpacity key={star} onPress={() => setRating(star)}>
                            <Text style={{ fontSize: 32, color: star <= rating ? "#F59E0B" : theme.textMuted }}>★</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <TextInput
                    value={review}
                    onChangeText={setReview}
                    style={{
                        backgroundColor: theme.inputBackground,
                        color: theme.text,
                        padding: 12,
                        borderRadius: 10,
                        height: 100,
                        textAlignVertical: "top",
                        marginBottom: 20
                    }}
                    placeholder="Escribí una reseña sobre tu experiencia..."
                    placeholderTextColor={theme.textMuted}
                    multiline
                />

                <View style={{ flexDirection: "row", gap: 12 }}>
                    <TouchableOpacity 
                        onPress={() => setRatingModalVisible(false)}
                        style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: theme.buttonBackground, alignItems: "center" }}
                    >
                        <Text style={{ color: theme.text, fontWeight: "700" }}>Cancelar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        onPress={submitRating}
                        disabled={submittingRating || rating === 0}
                        style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: rating > 0 ? theme.accent : theme.textMuted, alignItems: "center" }}
                    >
                        {submittingRating ? (
                            <ActivityIndicator color="#FFF" />
                        ) : (
                            <Text style={{ color: "#FFF", fontWeight: "700" }}>Enviar</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </View>
          </Modal>

          <CustomAlert {...alertConfig} />
    </SafeAreaView>
  );
}
