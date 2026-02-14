import { WebContainer } from "@/components/WebContainer";
import { CarCard } from "@/components/cards/carcard";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { shareProfile } from "@/lib/share";
import type { Vehicle } from "@/types/vehicle";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Linking,
    Platform,
    SafeAreaView,
    ScrollView,
    Text,
    TouchableOpacity,
    View
} from "react-native";

export default function UserProfileScreen() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const router = useRouter();
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  
  // Tabs State
  const [activeTab, setActiveTab] = useState<'active' | 'sold'>('active');

  // User Profile Data
  const [profileName, setProfileName] = useState<string>("");
  const [profileInitials, setProfileInitials] = useState<string>("");
  const [profileColor, setProfileColor] = useState<string>(theme.accent);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<any>(null);

  // Helper Functions for Dealer Links
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

  const openMaps = (address: string) => {
    const query = encodeURIComponent(address);
    const url = Platform.select({
      ios: `maps:0,0?q=${query}`,
      android: `geo:0,0?q=${query}`,
      web: `https://www.google.com/maps/search/?api=1&query=${query}`,
    });
    if (url) {
        Linking.openURL(url).catch(err => console.error("Couldn't open maps", err));
    }
  };

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

  const handleShareProfile = async () => {
    try {
      await shareProfile(uid!, profileName || "este usuario");
    } catch (error) {
      console.error(error);
    }
  };

  const hasUid = typeof uid === "string" && uid.length > 0;
  const isBlocked = profile?.blockedUsers && uid && profile.blockedUsers.includes(uid);

  // Fetch User Data
  useEffect(() => {
    if (!hasUid) return;
    setLoading(true);
    const unsub = onSnapshot(doc(db, "users", uid!), (docSnap) => {
        if (docSnap.exists()) {
            const pd = docSnap.data() as any;
            setProfileData(pd);
            
            // Prioritize agencyName if it exists, otherwise use display name logic
            const name = pd?.agencyName || (pd?.firstName || pd?.lastName ? `${pd?.firstName ?? ""} ${pd?.lastName ?? ""}`.trim() : (pd?.displayName || pd?.email || "Usuario"));
            setProfileName(name);
            
            let initials = String(pd?.initials || "");
            if (!initials) {
                const dn = String(pd?.displayName || "").trim();
                if (dn) {
                    initials = dn.slice(0, 2).toUpperCase();
                } else {
                    initials = "MC";
                }
            }
            setProfileInitials(initials);
            setProfileColor(pd?.avatarColor || theme.accent);
            setProfilePhotoUrl(pd?.photoURL || pd?.avatar || null);
        } else {
            setProfileName("Usuario");
            setProfileInitials("MC");
            setProfileColor(theme.accent);
            setProfilePhotoUrl(null);
        }
        setLoading(false);
    }, (error) => {
        console.error("Error fetching user profile:", error);
        setLoading(false);
    });

    return () => unsub();
  }, [uid, theme.accent]);

  // Fetch Vehicles
  useEffect(() => {
    if (!hasUid) {
      setVehicles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    
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
        if (data.status === 'deleted') return;
        
        // Filter out non-published vehicles (unless sold)
        // Pending, Rejected, or Blocked vehicles should not be visible in public profile
        if (!data.published && data.status !== 'sold') return;
        if (data.status === 'pending' || data.status === 'rejected' || data.status === 'blocked') return;

        const mapped: Vehicle = {
          id: docSnap.id,
          brand: data.brand,
          model: data.model,
          year: data.year,
          price: data.price,
          currency: data.currency,
          km: data.km,
          coverImage: data.coverImage ?? data.images?.cover ?? data.images?.[0] ?? undefined,
          additionalImages: data.additionalImages ?? data.images?.gallery ?? undefined,
          city: data.location?.city ?? data.city,
          province: data.location?.province ?? data.province,
          userId: data.userId,
          userName: data.userName,
          createdAt: data.createdAt,
          published: data.published,
          isFeatured: data.isFeatured,
          status: data.status,
          userPlan: data.userPlan,
          sellerRating: data.sellerRating,
          sellerReviewCount: data.sellerReviewCount,
        } as any;
        items.push(mapped);
      });
      
      // Sort: Sold items last, then by date desc
      items.sort((a, b) => {
          if (a.status === 'sold' && b.status !== 'sold') return 1;
          if (a.status !== 'sold' && b.status === 'sold') return -1;
          const dateA = a.createdAt?.seconds || 0;
          const dateB = b.createdAt?.seconds || 0;
          return dateB - dateA;
      });
      
      setVehicles(items);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [uid, hasUid, isBlocked]);

  // Filter vehicles by tab
  const activeVehicles = vehicles.filter(v => v.status !== 'sold');
  const soldVehicles = vehicles.filter(v => v.status === 'sold');
  const displayedVehicles = activeTab === 'active' ? activeVehicles : soldVehicles;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <WebContainer>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }}>
                <Ionicons name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: theme.text, flex: 1 }} numberOfLines={1}>
                {profileName}
            </Text>
            <View style={{ flexDirection: 'row', gap: 16 }}>
                <TouchableOpacity onPress={() => router.push('/(tabs)')}>
                    <Ionicons name="home-outline" size={24} color={theme.text} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleShareProfile}>
                    <Ionicons name="share-outline" size={24} color={theme.text} />
                </TouchableOpacity>
            </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Cover Image */}
            {profileData?.coverImage || profileData?.bannerUrl ? (
                <View style={{ height: 150, width: '100%' }}>
                    <Image source={{ uri: profileData.coverImage || profileData.bannerUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                </View>
            ) : null}

            <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ 
                    width: 80, height: 80, borderRadius: 40, backgroundColor: profileColor, 
                    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 16
                }}>
                    {profilePhotoUrl ? (
                        <Image source={{ uri: profilePhotoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    ) : (
                        <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#FFF' }}>{profileInitials}</Text>
                    )}
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 22, fontWeight: 'bold', color: theme.text }}>{profileName}</Text>
                    {profileData?.agencyName && (
                        <View style={{ backgroundColor: theme.badgeBackground, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginTop: 4 }}>
                            <Text style={{ fontSize: 12, color: theme.badgeText, fontWeight: 'bold' }}>AGENCIA VERIFICADA</Text>
                        </View>
                    )}
                    {(profileData?.sellerReviewCount ?? 0) > 0 && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Ionicons name="star" size={16} color="#F59E0B" />
                            <Text style={{ color: theme.text, marginLeft: 4, fontWeight: 'bold' }}>
                                {profileData.sellerRating?.toFixed(1) ?? "5.0"}
                            </Text>
                            <Text style={{ color: theme.textMuted, marginLeft: 4 }}>
                                ({profileData.sellerReviewCount} opiniones)
                            </Text>
                        </View>
                    )}
                </View>
            </View>

            {/* Contact Buttons */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 16 }}>
                {profileData?.whatsapp && (
                    <TouchableOpacity 
                        onPress={() => openWhatsApp(profileData.whatsapp)}
                        style={{ flex: 1, backgroundColor: '#25D366', paddingVertical: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                        <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>WhatsApp</Text>
                    </TouchableOpacity>
                )}
                {profileData?.instagram && (
                    <TouchableOpacity 
                        onPress={() => openInstagram(profileData.instagram)}
                        style={{ flex: 1, backgroundColor: '#E1306C', paddingVertical: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                        <Ionicons name="logo-instagram" size={20} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>Instagram</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Location, Schedule & Extra Info */}
            <View style={{ paddingHorizontal: 16, marginBottom: 20, gap: 10 }}>
                {(profileData?.businessAddress || profileData?.address || profileData?.city || profileData?.province) && (
                    <View>
                        <TouchableOpacity 
                            onPress={() => {
                                const fullAddress = profileData.businessAddress || [profileData.address, profileData.city, profileData.province].filter(Boolean).join(', ');
                                openMaps(fullAddress);
                            }}
                            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}
                        >
                            <Ionicons name="location-outline" size={20} color={theme.accent} style={{ marginTop: 2 }} />
                            <Text style={{ color: theme.accent, flex: 1, fontSize: 14, lineHeight: 20, textDecorationLine: 'underline' }}>
                                {profileData.businessAddress || [profileData.address, profileData.city, profileData.province].filter(Boolean).join(', ')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            onPress={() => {
                                const fullAddress = profileData.businessAddress || [profileData.address, profileData.city, profileData.province].filter(Boolean).join(', ');
                                openMaps(fullAddress);
                            }}
                            style={{ marginLeft: 28, marginTop: 4 }}
                        >
                            <Text style={{ color: theme.accent, fontSize: 12, fontWeight: 'bold' }}>Ver en Mapa</Text>
                        </TouchableOpacity>
                    </View>
                )}
                
                {(profileData?.businessHours || profileData?.schedule) && (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                        <Ionicons name="time-outline" size={20} color={theme.textMuted} style={{ marginTop: 2 }} />
                        <Text style={{ color: theme.textMuted, flex: 1, fontSize: 14, lineHeight: 20 }}>
                            {profileData.businessHours || profileData.schedule}
                        </Text>
                    </View>
                )}

                {profileData?.website && (
                    <TouchableOpacity onPress={() => Linking.openURL(profileData.website.startsWith('http') ? profileData.website : `https://${profileData.website}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="globe-outline" size={20} color={theme.accent} />
                        <Text style={{ color: theme.accent, flex: 1, fontSize: 14, fontWeight: '600' }}>
                            Visitar Sitio Web
                        </Text>
                    </TouchableOpacity>
                )}

                {profileData?.description && (
                    <View style={{ marginTop: 8 }}>
                        <Text style={{ color: theme.text, fontSize: 14, lineHeight: 22 }}>
                            {profileData.description}
                        </Text>
                    </View>
                )}
            </View>

            {/* Tabs */}
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.border, marginTop: 8 }}>
                <TouchableOpacity 
                    onPress={() => setActiveTab('active')} 
                    style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: activeTab === 'active' ? 2 : 0, borderBottomColor: theme.accent }}
                >
                    <Text style={{ color: activeTab === 'active' ? theme.text : theme.textMuted, fontWeight: '700' }}>En Venta ({activeVehicles.length})</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    onPress={() => setActiveTab('sold')} 
                    style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: activeTab === 'sold' ? 2 : 0, borderBottomColor: theme.accent }}
                >
                    <Text style={{ color: activeTab === 'sold' ? theme.text : theme.textMuted, fontWeight: '700' }}>Vendidos ({soldVehicles.length})</Text>
                </TouchableOpacity>
            </View>

            {/* List */}
            <View style={{ padding: 16, gap: 16 }}>
                {loading ? (
                    <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 20 }} />
                ) : displayedVehicles.length === 0 ? (
                    <Text style={{ textAlign: 'center', color: theme.textMuted, marginTop: 20 }}>
                        {activeTab === 'active' ? 'No hay vehículos en venta.' : 'No hay vehículos vendidos.'}
                    </Text>
                ) : (
                    displayedVehicles.map(item => (
                        <CarCard key={item.id} vehicle={item} />
                    ))
                )}
            </View>

            <TouchableOpacity 
                onPress={() => router.push('/(tabs)')}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, marginTop: 20, borderTopWidth: 1, borderTopColor: theme.border }}
            >
                <Ionicons name="car-sport-outline" size={20} color={theme.textMuted} style={{ marginRight: 8 }} />
                <Text style={{ color: theme.textMuted, fontSize: 16 }}>Ver todos los autos</Text>
            </TouchableOpacity>

        </ScrollView>
      </WebContainer>
    </SafeAreaView>
  );
}
