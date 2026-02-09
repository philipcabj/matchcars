import { CustomAlert } from "@/components/CustomAlert";
import { Header } from "@/components/Header";
import { CarCard } from "@/components/cards/carcard";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import type { Vehicle } from "@/types/vehicle";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Platform,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function UserProfileScreen() {
  const { theme } = useTheme();
  const { user, profile, blockUser, unblockUser } = useAuth();
  const router = useRouter();
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [likesRemaining, setLikesRemaining] = useState<number>(10);
  
  // User Profile Data
  const [profileName, setProfileName] = useState<string>("");
  const [profileInitials, setProfileInitials] = useState<string>("");
  const [profileColor, setProfileColor] = useState<string>(theme.accent);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<any>(null);

  // Helper Functions for Dealer Links
  const openLink = (url: string) => {
    if (!url) return;
  };

  const openWhatsApp = (phone: string) => {
    if (!phone) return;
    const cleanPhone = phone.replace(/\D/g, '');
    Linking.openURL(`https://wa.me/${cleanPhone}`).catch(err => console.error("Couldn't open whatsapp", err));
  };

  const openInstagram = (username: string) => {
    if (!username) return;
    const cleanUser = username.replace('@', '');
    Linking.openURL(`https://instagram.com/${cleanUser}`).catch(err => console.error("Couldn't open instagram", err));
  };

  // Blocking State
  const [isBlocked, setIsBlocked] = useState(false);

  // Alert State
  const [alertConfig, setAlertConfig] = useState({ 
    visible: false, 
    title: "", 
    message: "", 
    type: "info" as "success" | "error" | "info" | "warning",
    onClose: () => {},
    showCancel: false,
    onCancel: () => {},
    confirmText: "Aceptar",
    cancelText: "Cancelar"
  });

  const showAlert = (
    title: string, 
    message: string, 
    type: "success" | "error" | "info" | "warning" = "info", 
    onClose = () => {}, 
    showCancel = false, 
    onCancel = () => {},
    confirmText = "Aceptar",
    cancelText = "Cancelar"
  ) => {
    setAlertConfig({ visible: true, title, message, type, onClose, showCancel, onCancel, confirmText, cancelText });
  };

  const closeAlert = () => {
    setAlertConfig(prev => ({ ...prev, visible: false }));
  };

  const hasUid = typeof uid === "string" && uid.length > 0;

  // Check if blocked
  useEffect(() => {
    if (profile?.blockedUsers && uid && profile.blockedUsers.includes(uid)) {
        setIsBlocked(true);
    } else {
        setIsBlocked(false);
    }
  }, [profile?.blockedUsers, uid]);

  // Fetch User Data
  useEffect(() => {
    if (!hasUid) return;
    (async () => {
      try {
        const pSnap = await getDoc(doc(db, "users", uid!));
        const pd = pSnap.data() as any;
        setProfileData(pd);
        
        const name = pd?.firstName || pd?.lastName ? `${pd?.firstName ?? ""} ${pd?.lastName ?? ""}`.trim() : (pd?.displayName || pd?.email || "Usuario");
        setProfileName(name);
        
        let initials = String(pd?.initials || "");
        if (!initials) {
          const dn = String(pd?.displayName || "").trim();
          if (dn) {
            const parts = dn.split(/\s+/).filter(Boolean);
            const first = parts[0]?.[0] ?? "";
            const second = parts[1]?.[0] ?? "";
            initials = (first + second) || (parts[0]?.slice(0, 2) ?? "");
          } else {
            const fi = String(pd?.firstName || "").trim()[0] ?? "";
            const li = String(pd?.lastName || "").trim()[0] ?? "";
            initials = (fi + li) || (String(pd?.email || "").slice(0, 2) || "MC");
          }
          initials = initials.toUpperCase();
        }
        setProfileInitials(initials);
        setProfileColor(pd?.avatarColor || theme.accent);
        setProfilePhotoUrl(pd?.photoURL || pd?.avatar || null);
      } catch {
        setProfileName("Usuario");
        setProfileInitials("MC");
        setProfileColor(theme.accent);
        setProfilePhotoUrl(null);
      }
    })();
  }, [uid, theme.accent]);

  // Fetch Vehicles
  useEffect(() => {
    if (!hasUid) {
      setVehicles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    
    // If user is blocked, we don't fetch their vehicles
    if (isBlocked) {
        setVehicles([]);
        setLoading(false);
        return;
    }

    const ref = query(collection(db, "vehicles"), where("userId", "==", String(uid)));
    const unsub = onSnapshot(ref, (snap) => {
      const items: Vehicle[] = [];
      snap.forEach((docSnap) => {
        const data: any = docSnap.data();
        // Filter out sold items
        if (data.status === 'sold') return;

        const mapped: Vehicle = {
          id: docSnap.id,
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
          isFeatured: data.isFeatured,
          status: data.status,
          userPlan: data.userPlan,
        } as any;
        items.push(mapped);
      });
      items.sort((a, b) => {
          // Sold items at the bottom
          if (a.status === 'sold' && b.status !== 'sold') return 1;
          if (a.status !== 'sold' && b.status === 'sold') return -1;
          
          // Secondary sort by createdAt (newest first)
          const dateA = a.createdAt?.seconds || 0;
          const dateB = b.createdAt?.seconds || 0;
          return dateB - dateA;
      });
      setVehicles(items);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [uid, hasUid, isBlocked]);

  const handleBlockUser = async () => {
    if (!user) {
        showAlert("Iniciar sesión", "Debés iniciar sesión para bloquear usuarios.", "info", () => router.push("/login"));
        return;
    }
    
    showAlert(
        "Bloquear usuario",
        `¿Estás seguro de que querés bloquear a ${profileName}? No verás sus publicaciones ni podrás enviarle mensajes.`,
        "warning",
        async () => {
            try {
                if (uid) {
                    await blockUser(uid);
                    showAlert("Usuario bloqueado", "El usuario ha sido bloqueado correctamente.", "success", closeAlert);
                }
            } catch (e) {
                showAlert("Error", "No se pudo bloquear al usuario.", "error", closeAlert);
            }
        },
        true,
        closeAlert,
        "Bloquear",
        "Cancelar"
    );
  };

  const handleUnblockUser = async () => {
     if (!user || !uid) return;
     try {
         await unblockUser(uid);
         showAlert("Usuario desbloqueado", "El usuario ha sido desbloqueado.", "success", closeAlert);
     } catch (e) {
         showAlert("Error", "No se pudo desbloquear al usuario.", "error", closeAlert);
     }
  };

  const handleReportUser = () => {
     if (!user) {
         showAlert("Iniciar sesión", "Debés iniciar sesión para reportar usuarios.", "info", () => router.push("/login"));
         return;
     }
     // Redirect to report screen passing user ID
      router.push({ pathname: "/report/[id]", params: { id: uid, type: "user", name: profileName } });
   };

   // Header Render Helper
  const renderHeader = () => {
    const isDealer = profileData?.plan === 'pro_dealer';

    if (isDealer) {
        return (
            <View style={{ marginBottom: 24, backgroundColor: theme.card, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: theme.inputBackground }}>
                {/* Banner */}
                <View style={{ height: 120, backgroundColor: theme.inputBackground }}>
                    {profileData?.bannerUrl ? (
                        <Image source={{ uri: profileData.bannerUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="image-outline" size={40} color={theme.textMuted} style={{ opacity: 0.3 }} />
                        </View>
                    )}
                </View>

                <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                    {/* Avatar Overlap */}
                    <View style={{ marginTop: -40, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                         <View style={{ 
                            width: 80, 
                            height: 80, 
                            borderRadius: 12, // Square-ish for dealers
                            backgroundColor: profileColor, 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            overflow: "hidden",
                            borderWidth: 4,
                            borderColor: theme.card
                        }}>
                            {profilePhotoUrl ? (
                            <Image 
                                source={{ uri: profilePhotoUrl }} 
                                style={{ width: "100%", height: "100%" }} 
                                resizeMode="cover"
                            />
                            ) : (
                            <Text style={{ color: "#FFF", fontSize: 28, fontWeight: "700" }}>{profileInitials}</Text>
                            )}
                        </View>

                        {/* Dealer Badge */}
                        <View style={{ backgroundColor: '#9013FE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                            <Ionicons name="shield-checkmark" size={12} color="#FFF" />
                            <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "700", textTransform: 'uppercase' }}>Agencia Verificada</Text>
                        </View>
                    </View>

                    <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text }}>
                        {profileName}
                    </Text>

                    {/* Dealer Info */}
                    <View style={{ marginTop: 12, gap: 8 }}>
                        {profileData?.businessAddress && (
                             <TouchableOpacity 
                                onPress={() => {
                                    if (profileData.businessCoordinates) {
                                        const { latitude, longitude } = profileData.businessCoordinates;
                                        const label = encodeURIComponent(profileData.businessAddress);
                                        const url = Platform.select({
                                            ios: `maps:0,0?q=${label}@${latitude},${longitude}`,
                                            android: `geo:0,0?q=${latitude},${longitude}(${label})`
                                        });
                                        Linking.openURL(url || `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
                                    } else {
                                        const query = encodeURIComponent(profileData.businessAddress);
                                        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
                                    }
                                }}
                                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, width: '100%' }}
                             >
                                <Ionicons name="location-outline" size={16} color={theme.accent} style={{ marginTop: 2 }} />
                                <Text style={{ color: theme.accent, fontSize: 14, textDecorationLine: 'underline', flex: 1 }}>{profileData.businessAddress}</Text>
                             </TouchableOpacity>
                        )}
                         {profileData?.businessHours && (
                             <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Ionicons name="time-outline" size={16} color={theme.textMuted} />
                                <Text style={{ color: theme.text, fontSize: 14 }}>{profileData.businessHours}</Text>
                             </View>
                        )}
                    </View>

                    {/* Social / Contact Actions */}
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                        {profileData?.whatsapp && (
                            <TouchableOpacity onPress={() => openWhatsApp(profileData.whatsapp)} style={{ flex: 1, backgroundColor: '#25D366', paddingVertical: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                <Ionicons name="logo-whatsapp" size={18} color="#FFF" />
                                <Text style={{ color: '#FFF', fontWeight: '700' }}>WhatsApp</Text>
                            </TouchableOpacity>
                        )}
                        {profileData?.website && (
                             <TouchableOpacity onPress={() => openLink(profileData.website)} style={{ width: 44, height: 44, backgroundColor: theme.inputBackground, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.likeBoxBackground }}>
                                <Ionicons name="globe-outline" size={20} color={theme.text} />
                            </TouchableOpacity>
                        )}
                        {profileData?.instagram && (
                             <TouchableOpacity onPress={() => openInstagram(profileData.instagram)} style={{ width: 44, height: 44, backgroundColor: theme.inputBackground, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.likeBoxBackground }}>
                                <Ionicons name="logo-instagram" size={20} color={theme.text} />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Stats */}
                    <View style={{ marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.inputBackground, flexDirection: 'row', justifyContent: 'space-around' }}>
                         <View style={{ alignItems: 'center' }}>
                            <Text style={{ color: theme.title, fontSize: 18, fontWeight: '700' }}>{vehicles.length}</Text>
                            <Text style={{ color: theme.textMuted, fontSize: 12 }}>Autos</Text>
                         </View>
                    </View>
                </View>
            </View>
        );
    }

    return (
        <View style={{ alignItems: "center", marginBottom: 24 }}>
          <View style={{ 
            width: 100, 
            height: 100, 
            borderRadius: 50, 
            backgroundColor: profileColor, 
            alignItems: "center", 
            justifyContent: "center",
            marginBottom: 16,
            overflow: "hidden"
          }}>
            {profilePhotoUrl ? (
              <Image 
                source={{ uri: profilePhotoUrl }} 
                style={{ width: "100%", height: "100%" }} 
                resizeMode="cover"
              />
            ) : (
              <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 32 }}>{profileInitials}</Text>
            )}
          </View>
          
          <Text style={{ fontSize: 24, fontWeight: "800", color: theme.text, textAlign: "center", marginBottom: 4 }}>
            {profileName}
          </Text>
          
          <Text style={{ fontSize: 14, color: theme.textLight }}>
             Miembro desde {profileData?.createdAt?.toDate ? profileData.createdAt.toDate().getFullYear() : new Date().getFullYear()}
          </Text>

          {/* Trust Badge if available */}
            {profileData?.trustLevel === 'verified' && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#34C75920", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginTop: 8 }}>
                    <Ionicons name="checkmark-circle" size={14} color="#34C759" />
                    <Text style={{ color: "#34C759", fontSize: 12, fontWeight: "700" }}>Usuario Verificado</Text>
                </View>
            )}
             {profileData?.trustLevel === 'active' && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#007AFF20", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginTop: 8 }}>
                    <Ionicons name="flash" size={14} color="#007AFF" />
                    <Text style={{ color: "#007AFF", fontSize: 12, fontWeight: "700" }}>Usuario Activo</Text>
                </View>
            )}
            {(!profileData?.trustLevel || profileData?.trustLevel === 'new') && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#8E8E9320", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginTop: 8 }}>
                    <Ionicons name="leaf" size={14} color="#8E8E93" />
                    <Text style={{ color: "#8E8E93", fontSize: 12, fontWeight: "700" }}>Usuario Nuevo</Text>
                </View>
            )}

        <View style={{ flexDirection: 'row', gap: 24, marginTop: 24 }}>
             <View style={{ alignItems: 'center' }}>
                <Text style={{ color: theme.title, fontSize: 18, fontWeight: '700' }}>{vehicles.length}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>Publicaciones</Text>
             </View>
        </View>

        {/* Action Buttons: Report & Block */}
        {user && user.uid !== uid && (
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                <TouchableOpacity 
                    onPress={handleReportUser}
                    style={{ 
                        flexDirection: 'row', 
                        alignItems: 'center', 
                        gap: 6,
                        backgroundColor: theme.inputBackground,
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: theme.likeBox
                    }}
                >
                    <Ionicons name="flag-outline" size={16} color={theme.text} />
                    <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14 }}>Reportar</Text>
                </TouchableOpacity>

                {isBlocked ? (
                    <TouchableOpacity 
                        onPress={handleUnblockUser}
                        style={{ 
                            flexDirection: 'row', 
                            alignItems: 'center', 
                            gap: 6,
                            backgroundColor: theme.inputBackground,
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: theme.likeBox
                        }}
                    >
                        <Ionicons name="eye-outline" size={16} color={theme.text} />
                        <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14 }}>Desbloquear</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity 
                        onPress={handleBlockUser}
                        style={{ 
                            flexDirection: 'row', 
                            alignItems: 'center', 
                            gap: 6,
                            backgroundColor: theme.inputBackground,
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: theme.likeBox
                        }}
                    >
                        <Ionicons name="ban-outline" size={16} color="#FF3B30" />
                        <Text style={{ color: "#FF3B30", fontWeight: '600', fontSize: 14 }}>Bloquear</Text>
                    </TouchableOpacity>
                )}
            </View>
        )}
        </View>
    );
  };

  if (loading) {
    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
            <Header showBack={true} title="Perfil Público" />
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={theme.primary} />
            </View>
        </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header showBack={true} title="Perfil Público" />

      <FlatList
        data={vehicles}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={{ padding: 10, gap: 10, paddingBottom: 100 }}
        columnWrapperStyle={{ gap: 10 }}
        ListHeaderComponent={renderHeader}
        renderItem={({ item }) => (
            <View style={{ flex: 1, maxWidth: "50%" }}>
                <CarCard vehicle={{ ...item, userName: profileName || item.userName }} compact={true} />
            </View>
        )}
        ListEmptyComponent={
            <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: theme.textLight }}>Este usuario no tiene publicaciones activas.</Text>
            </View>
        }
      />

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
      />
    </SafeAreaView>
  );
}