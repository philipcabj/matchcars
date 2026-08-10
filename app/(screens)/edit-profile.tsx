import { CustomAlert } from "@/components/CustomAlert";
import { WebContainer } from "@/components/WebContainer";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useDebounce } from "@/hooks/useDebounce";
import { Analytics } from "@/lib/analytics";
import { db, storage } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { canUseWatermark } from "@/lib/planChecks";
import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { collection, doc, getDocs, limit, query, updateDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

let MapView: any = null;
let Marker: any = null;

if (Platform.OS !== 'web') {
    try {
        const Maps = require("react-native-maps");
        MapView = Maps.default;
        Marker = Maps.Marker;
    } catch (e) {
        logger.log("Maps module not found", e);
    }
}

// Dummy type for web
type Region = {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
};

export default function EditProfileScreen() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const router = useRouter();

  const isDealer = profile?.plan && (profile.plan.includes("pro_dealer") || profile.plan.includes("dealer_pro_plus"));
  const canWatermark = canUseWatermark(profile?.plan || "free");

  const [firstName, setFirstName] = useState(profile?.firstName || "");
  const [lastName, setLastName] = useState(profile?.lastName || "");
  
  // Dealer Fields
  const [description, setDescription] = useState((profile as any)?.description || "");
  const [agencyName, setAgencyName] = useState(profile?.agencyName || "");

  // Vidriera Digital: friendly link (slug) + embeddable widget snippet
  const [slug, setSlug] = useState(profile?.slug || "");
  const [slugTouched, setSlugTouched] = useState(!!profile?.slug);
  const [slugCheck, setSlugCheck] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [embedCopied, setEmbedCopied] = useState(false);
  const debouncedSlug = useDebounce(slug, 500);

  const [businessAddress, setBusinessAddress] = useState(profile?.businessAddress || "");
  const [businessCoordinates, setBusinessCoordinates] = useState<{latitude: number, longitude: number} | null>(profile?.businessCoordinates || null);
  const [businessHours, setBusinessHours] = useState(profile?.businessHours || "");
  const [website, setWebsite] = useState(profile?.website || "");
  const [instagram, setInstagram] = useState(profile?.instagram || "");
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp || "");
  
  const [bannerUrl, setBannerUrl] = useState(profile?.bannerUrl || "");
  const [bannerUploading, setBannerUploading] = useState(false);
  const [locating, setLocating] = useState(false);

  // Logo / marca de agua (planes pagos)
  const [logoUrl, setLogoUrl] = useState(profile?.logoUrl || "");
  const [logoUploading, setLogoUploading] = useState(false);
  const [watermarkEnabled, setWatermarkEnabled] = useState(profile?.watermarkEnabled || false);

  // Extended dealer fields
  const [phone, setPhone] = useState(profile?.phone || "");
  const [foundedYear, setFoundedYear] = useState(
    profile?.foundedYear ? String(profile.foundedYear) : ""
  );
  const [brandSpecialties, setBrandSpecialties] = useState<string[]>(
    profile?.brandSpecialties || []
  );
  const [showroomGallery, setShowroomGallery] = useState<string[]>(
    profile?.showroomGallery || []
  );
  const [galleryUploading, setGalleryUploading] = useState(false);

  // Address Autocomplete
  const [suggestions, setSuggestions] = useState<Location.LocationGeocodedAddress[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Map State
  const [mapVisible, setMapVisible] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region>({
      latitude: profile?.businessCoordinates?.latitude || -34.603722,
      longitude: profile?.businessCoordinates?.longitude || -58.381592,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
  });

  const [loading, setLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info" as "success" | "error" | "info" | "warning",
    onClose: () => {},
    options: undefined as undefined | Array<{ text: string, onPress?: () => void, style?: "default" | "cancel" | "destructive" }>
  });

  const showAlert = (title: string, message: string, type: "success" | "error" | "info" | "warning" = "info", onClose = () => {}, options?: any[]) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
      onClose: () => {
        setAlertConfig((prev) => ({ ...prev, visible: false }));
        onClose();
      },
      options
    });
  };

  const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  const slugify = (input: string) =>
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40);

  // Suggest a slug from the agency name until the dealer types their own.
  useEffect(() => {
    if (!isDealer || slugTouched || !agencyName) return;
    setSlug(slugify(agencyName));
  }, [agencyName, isDealer, slugTouched]);

  // Check slug format + uniqueness (client-side only — see plan notes on the accepted race-condition tradeoff).
  useEffect(() => {
    if (!isDealer) return;
    if (!debouncedSlug) {
      setSlugCheck("idle");
      return;
    }
    if (debouncedSlug.length < 3 || !SLUG_REGEX.test(debouncedSlug)) {
      setSlugCheck("invalid");
      return;
    }
    if (debouncedSlug === profile?.slug) {
      setSlugCheck("available");
      return;
    }
    let cancelled = false;
    setSlugCheck("checking");
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "users"), where("slug", "==", debouncedSlug), limit(1))
        );
        if (cancelled) return;
        const takenByOther = !snap.empty && snap.docs[0].id !== user?.uid;
        setSlugCheck(takenByOther ? "taken" : "available");
      } catch {
        if (!cancelled) setSlugCheck("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSlug, isDealer, profile?.slug, user?.uid]);

  const embedSnippet = `<iframe src="https://matchcars.app/embed/${slug || user?.uid || ""}" width="100%" height="480" style="border:0;border-radius:12px;" loading="lazy"></iframe>`;

  const handleCopyEmbed = async () => {
    if (Platform.OS !== "web") return;
    try {
      await (navigator as any).clipboard.writeText(embedSnippet);
      setEmbedCopied(true);
      if (user?.uid) Analytics.logShare("embed_copy", user.uid);
      setTimeout(() => setEmbedCopied(false), 2200);
    } catch {}
  };

  const formatAddress = (addr: Location.LocationGeocodedAddress) => {
      const street = addr.street || addr.name || "";
      const number = addr.streetNumber || "";
      const city = addr.city || addr.subregion || "";
      const region = addr.region || "";
      const country = addr.country || "";
      
      let parts = [];
      if (street) parts.push(`${street} ${number}`.trim());
      if (city) parts.push(city);
      if (region) parts.push(region);
      if (parts.length < 2 && country) parts.push(country);
      
      return parts.join(", ");
  };

  const handleAddressChange = (text: string) => {
    setBusinessAddress(text);
    setIsSearching(true);
    
    if (typingTimeout) clearTimeout(typingTimeout);

    if (text.length > 3) {
        const timeout = setTimeout(async () => {
            try {
                const results = await Location.geocodeAsync(text);
                const detailedSuggestions: Location.LocationGeocodedAddress[] = [];
                
                if (results.length > 0) {
                     for (let i = 0; i < Math.min(results.length, 5); i++) {
                         const reverse = await Location.reverseGeocodeAsync({
                             latitude: results[i].latitude,
                             longitude: results[i].longitude
                         });
                         if (reverse.length > 0) {
                             detailedSuggestions.push({ ...reverse[0], ...results[i] } as any);
                         }
                     }
                }
                setSuggestions(detailedSuggestions);
                setShowSuggestions(true);
            } catch (e) {
                logger.log("Geocode error", e);
                setSuggestions([]);
            } finally {
                setIsSearching(false);
            }
        }, 800); 
        setTypingTimeout(timeout);
    } else {
        setSuggestions([]);
        setShowSuggestions(false);
        setIsSearching(false);
    }
  };

  const handleSelectSuggestion = (suggestion: any) => {
      const formatted = formatAddress(suggestion);
      setBusinessAddress(formatted);
      setShowSuggestions(false);
      
      // Update coordinates
      if (suggestion.latitude && suggestion.longitude) {
          const newCoords = { latitude: suggestion.latitude, longitude: suggestion.longitude };
          setBusinessCoordinates(newCoords);
          setMapRegion({
              ...newCoords,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005
          });
      }
  };

  const handleSave = async () => {
    if (!user) return;

    if (isDealer && slug && (slugCheck === "taken" || slugCheck === "invalid" || slugCheck === "checking")) {
      showAlert(
        "Link no disponible",
        "Elegí un link válido y disponible antes de guardar, o dejá el campo vacío.",
        "warning"
      );
      return;
    }

    setLoading(true);
    try {
      const updateData: any = {
        firstName,
        lastName,
        description,
        whatsapp,
        phone,
      };

      if (isDealer) {
        updateData.agencyName = agencyName;
        updateData.slug = slug || null;
        updateData.businessAddress = businessAddress;
        updateData.businessCoordinates = businessCoordinates;
        updateData.businessHours = businessHours;
        updateData.website = website;
        updateData.instagram = instagram;
        updateData.bannerUrl = bannerUrl;
        updateData.foundedYear = foundedYear ? Number(foundedYear) : null;
        updateData.brandSpecialties = brandSpecialties;
        updateData.showroomGallery = showroomGallery;
      }

      if (canWatermark) {
        updateData.logoUrl = logoUrl;
        updateData.watermarkEnabled = watermarkEnabled;
      }

      await updateDoc(doc(db, "users", user.uid), updateData);
      // await refreshProfile(); // Context updates automatically via onSnapshot
      showAlert("Éxito", "Perfil actualizado correctamente.", "success", () => router.back());
    } catch (e) {
      console.error("Error updating profile", e);
      showAlert("Error", "No se pudo actualizar el perfil.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleGeolocate = async () => {
    setLocating(true);
    try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            showAlert("Permiso denegado", "Necesitamos acceso a tu ubicación para completar la dirección.", "warning");
            setLocating(false);
            return;
        }

        const enabled = await Location.hasServicesEnabledAsync();
        if (!enabled) {
            showAlert("Ubicación desactivada", "Por favor activá el GPS.", "warning");
            setLocating(false);
            return;
        }

        // MODE 1: VALIDATION (If user typed something)
        if (businessAddress.trim().length > 3) {
             const geocoded = await Location.geocodeAsync(businessAddress);
             if (geocoded.length > 0) {
                 const { latitude, longitude } = geocoded[0];
                 const reverse = await Location.reverseGeocodeAsync({ latitude, longitude });
                 
                 if (reverse.length > 0) {
                     const formatted = formatAddress(reverse[0]);
                     
                     // If it's basically the same, just notify success
                     if (formatted.toLowerCase().includes(businessAddress.toLowerCase()) || businessAddress.toLowerCase().includes(formatted.toLowerCase())) {
                         showAlert("Dirección Verificada", `La dirección "${formatted}" es válida.`, "success");
                         setBusinessAddress(formatted); // Update with clean format
                     } else {
                         // Offer to replace
                         showAlert(
                             "Sugerencia de Dirección", 
                             `Encontramos una coincidencia más precisa:\n"${formatted}"\n\n¿Deseas reemplazar lo que escribiste?`, 
                             "info", 
                             () => {}, 
                             [
                                 { text: "No, mantener", style: "cancel", onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) },
                                 { text: "Sí, actualizar", onPress: () => {
                                     setBusinessAddress(formatted);
                                     setAlertConfig(prev => ({ ...prev, visible: false }));
                                 }}
                             ]
                         );
                     }
                 } else {
                     showAlert("No encontrada", "No pudimos validar los detalles de esa dirección.", "warning");
                 }
             } else {
                 showAlert("No encontrada", "No encontramos coordenadas para esa dirección. Intenta agregar la ciudad o provincia.", "warning");
             }
        } 
        // MODE 2: DETECTION (If empty)
        else {
            const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
            const reverse = await Location.reverseGeocodeAsync({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude
            });

            if (reverse.length > 0) {
                const formatted = formatAddress(reverse[0]);
                setBusinessAddress(formatted);
                showAlert("Ubicación Detectada", `Hemos completado la dirección:\n"${formatted}"`, "success");
            } else {
                 showAlert("Sin resultados", "No pudimos encontrar una dirección precisa.", "info");
            }
        }
    } catch (e) {
        console.error("Geolocate Error:", e);
        showAlert("Error", "No pudimos obtener la ubicación.", "error");
    } finally {
        setLocating(false);
    }
  };

  const handleOpenMap = async () => {
      // Try to get current location to center map, otherwise use default
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
          try {
              const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              setMapRegion({
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
              });
          } catch (e) {
              logger.log("Could not get current location for map", e);
          }
      }
      setMapVisible(true);
  };

  const handleMapConfirm = async () => {
      setLocating(true);
      try {
          const reverse = await Location.reverseGeocodeAsync({
              latitude: mapRegion.latitude,
              longitude: mapRegion.longitude
          });

          if (reverse.length > 0) {
              const formatted = formatAddress(reverse[0]);
              setBusinessAddress(formatted);
              setBusinessCoordinates({ latitude: mapRegion.latitude, longitude: mapRegion.longitude });
              setMapVisible(false);
              
              // Clear any existing suggestions or search state
              setSuggestions([]);
              setShowSuggestions(false);
              setIsSearching(false);
              if (typingTimeout) clearTimeout(typingTimeout);
          } else {
              showAlert("Error", "No pudimos obtener la dirección de este punto.", "error");
          }
      } catch (e) {
          console.error("Map Reverse Geocode Error:", e);
          showAlert("Error", "Ocurrió un error al obtener la dirección.", "error");
      } finally {
          setLocating(false);
      }
  };

  const pickBanner = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 1], // Wide aspect ratio for banner
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0].uri) {
        setBannerUploading(true);
        const uri = result.assets[0].uri;
        
        // Resize
        const manipulated = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 1200 } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );

        const blob: Blob = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.onload = function () {
            resolve(xhr.response);
          };
          xhr.onerror = function (e) {
            reject(new TypeError("Network request failed"));
          };
          xhr.responseType = "blob";
          xhr.open("GET", manipulated.uri, true);
          xhr.send(null);
        });

        const storageRef = ref(storage, `banners/${user?.uid}_${Date.now()}.jpg`);
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);
        setBannerUrl(url);
      }
    } catch (e) {
      console.error(e);
      showAlert("Error", "No se pudo subir el banner.", "error");
    } finally {
      setBannerUploading(false);
    }
  };

  const pickLogo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled && result.assets[0].uri) {
        setLogoUploading(true);
        const uri = result.assets[0].uri;

        // PNG para preservar transparencia si el logo la tiene
        const manipulated = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 500 } }],
            { format: ImageManipulator.SaveFormat.PNG }
        );

        const blob: Blob = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.onload = function () {
            resolve(xhr.response);
          };
          xhr.onerror = function (e) {
            reject(new TypeError("Network request failed"));
          };
          xhr.responseType = "blob";
          xhr.open("GET", manipulated.uri, true);
          xhr.send(null);
        });

        const storageRef = ref(storage, `logos/${user?.uid}_${Date.now()}.png`);
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);
        setLogoUrl(url);
      }
    } catch (e) {
      console.error(e);
      showAlert("Error", "No se pudo subir el logo.", "error");
    } finally {
      setLogoUploading(false);
    }
  };

  const addGalleryImage = async () => {
    if (showroomGallery.length >= 6) {
      showAlert("Límite alcanzado", "Podés subir hasta 6 fotos del local.", "info");
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0].uri) {
        setGalleryUploading(true);
        const uri = result.assets[0].uri;
        const manipulated = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 900 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );
        const blob: Blob = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.onload = () => resolve(xhr.response);
          xhr.onerror = () => reject(new TypeError("Network request failed"));
          xhr.responseType = "blob";
          xhr.open("GET", manipulated.uri, true);
          xhr.send(null);
        });
        const storageRef = ref(storage, `showroom_gallery/${user?.uid}_${Date.now()}.jpg`);
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);
        setShowroomGallery((prev) => [...prev, url]);
      }
    } catch (e) {
      showAlert("Error", "No se pudo subir la foto.", "error");
    } finally {
      setGalleryUploading(false);
    }
  };

  const removeGalleryImage = (index: number) => {
    setShowroomGallery((prev) => prev.filter((_, i) => i !== index));
  };

  const BRANDS = [
    "Toyota", "Volkswagen", "Chevrolet", "Ford", "Renault", "Fiat", "Peugeot",
    "Citroën", "Honda", "Nissan", "Hyundai", "Kia", "Suzuki", "Jeep", "RAM",
    "BMW", "Mercedes-Benz", "Audi", "Volvo", "Land Rover", "Lexus", "Mazda",
    "Mitsubishi", "Subaru", "Chery", "BYD", "MG", "Dodge",
  ];

  const toggleBrand = (brand: string) => {
    setBrandSpecialties((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <WebContainer>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: theme.inputBackground }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700", marginLeft: 8 }}>
            Editar Perfil {isDealer ? "Agencia" : ""}
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        
        {isDealer && (
            <View style={{ marginBottom: 24 }}>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600", marginBottom: 12 }}>Banner de Portada</Text>
                <TouchableOpacity 
                    onPress={pickBanner}
                    style={{ 
                        height: 120, 
                        backgroundColor: theme.inputBackground, 
                        borderRadius: 12, 
                        overflow: 'hidden', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: theme.likeBoxBackground,
                        borderStyle: 'dashed'
                    }}
                >
                    {bannerUrl ? (
                        <Image source={{ uri: bannerUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                        <View style={{ alignItems: 'center' }}>
                            <Ionicons name="image-outline" size={32} color={theme.textMuted} />
                            <Text style={{ color: theme.textMuted, marginTop: 8 }}>Tocar para subir banner</Text>
                        </View>
                    )}
                    {bannerUploading && (
                        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                            <ActivityIndicator color="#FFF" />
                        </View>
                    )}
                </TouchableOpacity>
            </View>
        )}

        <View style={{ marginBottom: 20 }}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600", marginBottom: 16 }}>Información Personal</Text>
            
            <View style={{ marginBottom: 12 }}>
                <Text style={{ color: theme.textMuted, marginBottom: 6 }}>Nombre</Text>
                <TextInput
                    value={firstName}
                    onChangeText={setFirstName}
                    style={{ backgroundColor: theme.inputBackground, color: theme.inputText, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.likeBoxBackground }}
                />
            </View>
            <View style={{ marginBottom: 12 }}>
                <Text style={{ color: theme.textMuted, marginBottom: 6 }}>Apellido</Text>
                <TextInput
                    value={lastName}
                    onChangeText={setLastName}
                    style={{ backgroundColor: theme.inputBackground, color: theme.inputText, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.likeBoxBackground }}
                />
            </View>
            <View style={{ marginBottom: 12 }}>
                <Text style={{ color: theme.textMuted, marginBottom: 6 }}>Descripción / Bio</Text>
                <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Contá algo sobre vos o tu experiencia vendiendo autos..."
                    placeholderTextColor={theme.textMuted}
                    multiline
                    numberOfLines={4}
                    maxLength={300}
                    style={{ backgroundColor: theme.inputBackground, color: theme.inputText, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.likeBoxBackground, minHeight: 90, textAlignVertical: 'top' }}
                />
                <Text style={{ color: theme.textMuted, fontSize: 11, textAlign: 'right', marginTop: 4 }}>
                    {description.length}/300
                </Text>
            </View>
        </View>

        <View style={{ marginBottom: 20 }}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600", marginBottom: 16 }}>Contacto</Text>

            <View style={{ marginBottom: 12 }}>
                <Text style={{ color: theme.textMuted, marginBottom: 6 }}>WhatsApp</Text>
                <TextInput
                    value={whatsapp}
                    onChangeText={setWhatsapp}
                    placeholder="+54911..."
                    placeholderTextColor={theme.textMuted}
                    keyboardType="phone-pad"
                    style={{ backgroundColor: theme.inputBackground, color: theme.inputText, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.likeBoxBackground }}
                />
                <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>
                    Así los compradores te pueden escribir directo, incluso desde la web sin cuenta.
                </Text>
            </View>

            <View style={{ marginBottom: 12 }}>
                <Text style={{ color: theme.textMuted, marginBottom: 6 }}>Teléfono directo</Text>
                <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+54911..."
                    placeholderTextColor={theme.textMuted}
                    keyboardType="phone-pad"
                    style={{ backgroundColor: theme.inputBackground, color: theme.inputText, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.likeBoxBackground }}
                />
            </View>
        </View>

        {canWatermark && (
            <View style={{ marginBottom: 20 }}>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600", marginBottom: 4 }}>Logo / Marca de agua</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 16 }}>
                    Subí tu logo para estamparlo automáticamente en las fotos de tus autos.
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                    <TouchableOpacity
                        onPress={pickLogo}
                        style={{
                            width: 90,
                            height: 90,
                            backgroundColor: theme.inputBackground,
                            borderRadius: 12,
                            overflow: 'hidden',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1,
                            borderColor: theme.likeBoxBackground,
                            borderStyle: 'dashed'
                        }}
                    >
                        {logoUrl ? (
                            <Image source={{ uri: logoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                        ) : (
                            <View style={{ alignItems: 'center' }}>
                                <Ionicons name="image-outline" size={24} color={theme.textMuted} />
                                <Text style={{ color: theme.textMuted, marginTop: 4, fontSize: 10, textAlign: 'center' }}>Subir logo</Text>
                            </View>
                        )}
                        {logoUploading && (
                            <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                                <ActivityIndicator color="#FFF" size="small" />
                            </View>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setWatermarkEnabled((prev) => !prev)}
                        disabled={!logoUrl}
                        style={{
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: watermarkEnabled ? theme.accent : theme.likeBoxBackground,
                            backgroundColor: watermarkEnabled ? theme.accent + "20" : theme.inputBackground,
                            opacity: logoUrl ? 1 : 0.5,
                        }}
                    >
                        <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600", flex: 1, marginRight: 8 }}>
                            Aplicar marca de agua en mis fotos
                        </Text>
                        <Ionicons
                            name={watermarkEnabled ? "checkmark-circle" : "ellipse-outline"}
                            size={22}
                            color={watermarkEnabled ? theme.accent : theme.textMuted}
                        />
                    </TouchableOpacity>
                </View>
                {!logoUrl && (
                    <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                        Subí un logo primero para poder activar la marca de agua.
                    </Text>
                )}
            </View>
        )}

        {isDealer && (
            <View style={{ marginBottom: 20 }}>
                <Text style={{ color: theme.accent, fontSize: 16, fontWeight: "600", marginBottom: 16 }}>Información de Agencia</Text>

                <View style={{ marginBottom: 12 }}>
                    <Text style={{ color: theme.textMuted, marginBottom: 6 }}>Nombre de la Agencia</Text>
                    <TextInput
                        value={agencyName}
                        onChangeText={setAgencyName}
                        placeholder="Ej. Automotores Pilar"
                        placeholderTextColor={theme.textMuted}
                        style={{ backgroundColor: theme.inputBackground, color: theme.inputText, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.likeBoxBackground }}
                    />
                </View>

                <View style={{ marginBottom: 12 }}>
                    <Text style={{ color: theme.textMuted, marginBottom: 6 }}>Tu link personalizado (Vidriera Digital)</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.inputBackground, borderRadius: 8, borderWidth: 1, borderColor: theme.likeBoxBackground }}>
                        <Text style={{ paddingLeft: 12, color: theme.textMuted, fontSize: 13 }}>matchcars.app/agencia/</Text>
                        <TextInput
                            value={slug}
                            onChangeText={(v) => {
                                setSlugTouched(true);
                                setSlug(slugify(v));
                            }}
                            placeholder="mi-agencia"
                            placeholderTextColor={theme.textMuted}
                            autoCapitalize="none"
                            style={{ flex: 1, color: theme.inputText, padding: 12 }}
                        />
                    </View>
                    {!!slug && (
                        <Text
                            style={{
                                marginTop: 6,
                                fontSize: 12,
                                fontWeight: '600',
                                color:
                                    slugCheck === "available"
                                        ? "#10B981"
                                        : slugCheck === "taken" || slugCheck === "invalid"
                                        ? (theme.error || "#EF4444")
                                        : theme.textMuted,
                            }}
                        >
                            {slugCheck === "checking" && "Verificando disponibilidad..."}
                            {slugCheck === "available" && "✓ Disponible"}
                            {slugCheck === "taken" && "Ese link ya está en uso por otra agencia"}
                            {slugCheck === "invalid" && "Usá minúsculas, números y guiones (mínimo 3 caracteres)"}
                        </Text>
                    )}
                </View>

                <View style={{ marginBottom: 12, zIndex: 10 }}>
                    <Text style={{ color: theme.textMuted, marginBottom: 6 }}>Dirección del Local</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.inputBackground, borderRadius: 8, borderWidth: 1, borderColor: theme.likeBoxBackground }}>
                        <TextInput
                            value={businessAddress}
                            onChangeText={handleAddressChange}
                            placeholder="Av. Libertador 1234, CABA"
                            placeholderTextColor={theme.textMuted}
                            style={{ flex: 1, color: theme.inputText, padding: 12 }}
                        />
                        <TouchableOpacity onPress={handleOpenMap} style={{ padding: 12, borderLeftWidth: 1, borderLeftColor: theme.likeBoxBackground }}>
                             <Ionicons name="map-outline" size={24} color={theme.accent} />
                        </TouchableOpacity>
                    </View>
                    
                    {/* Inline Suggestions */}
                    {showSuggestions && (
                        <View style={{ 
                            marginTop: 4,
                            backgroundColor: theme.card, 
                            borderRadius: 8, 
                            borderWidth: 1,
                            borderColor: theme.likeBoxBackground,
                        }}>
                            {isSearching ? (
                                <View style={{ padding: 16, alignItems: 'center' }}>
                                    <ActivityIndicator color={theme.accent} />
                                    <Text style={{ color: theme.textMuted, marginTop: 8, fontSize: 12 }}>Buscando...</Text>
                                </View>
                            ) : (
                                <>
                                    {suggestions.length > 0 ? (
                                        suggestions.map((item, index) => (
                                            <TouchableOpacity 
                                                key={index} 
                                                onPress={() => handleSelectSuggestion(item)}
                                                style={{ 
                                                    padding: 12, 
                                                    borderBottomWidth: 1, 
                                                    borderBottomColor: theme.likeBoxBackground,
                                                    flexDirection: 'row',
                                                    alignItems: 'center'
                                                }}
                                            >
                                                <Ionicons name="location-outline" size={18} color={theme.textMuted} style={{ marginRight: 8 }} />
                                                <Text style={{ color: theme.text, fontSize: 14, flex: 1 }}>{formatAddress(item)}</Text>
                                            </TouchableOpacity>
                                        ))
                                    ) : (
                                        <View style={{ padding: 16 }}>
                                            <Text style={{ color: theme.textMuted, textAlign: 'center', marginBottom: 12 }}>
                                                No encontramos esa dirección.
                                            </Text>
                                            <TouchableOpacity 
                                                onPress={handleOpenMap}
                                                style={{ 
                                                    backgroundColor: theme.inputBackground, 
                                                    padding: 10, 
                                                    borderRadius: 8, 
                                                    alignItems: 'center',
                                                    flexDirection: 'row',
                                                    justifyContent: 'center'
                                                }}
                                            >
                                                <Ionicons name="map" size={18} color={theme.accent} style={{ marginRight: 8 }} />
                                                <Text style={{ color: theme.text, fontWeight: '600' }}>Buscar en el mapa</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                    
                                    {/* Always show manual map option at bottom if there are results too */}
                                    {suggestions.length > 0 && (
                                         <TouchableOpacity 
                                            onPress={handleOpenMap}
                                            style={{ 
                                                padding: 12, 
                                                backgroundColor: theme.inputBackground,
                                                borderBottomLeftRadius: 8,
                                                borderBottomRightRadius: 8,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                        >
                                            <Text style={{ color: theme.textMuted, fontSize: 12 }}>¿No está en la lista? </Text>
                                            <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '700' }}>Buscar en mapa</Text>
                                        </TouchableOpacity>
                                    )}
                                </>
                            )}
                        </View>
                    )}
                    {businessCoordinates && (
                        <View style={{ marginTop: 12, height: 150, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: theme.likeBoxBackground }}>
                             {Platform.OS !== 'web' && MapView ? (
                                 <MapView 
                                    style={{ flex: 1 }}
                                    region={{
                                        ...businessCoordinates,
                                        latitudeDelta: 0.005,
                                        longitudeDelta: 0.005
                                    }}
                                    scrollEnabled={false}
                                    zoomEnabled={false}
                                    pitchEnabled={false}
                                    rotateEnabled={false}
                                >
                                    <Marker coordinate={businessCoordinates} />
                                </MapView>
                             ) : (
                                 <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.inputBackground }}>
                                     <Ionicons name="map" size={32} color={theme.textMuted} />
                                     <Text style={{ color: theme.textMuted, marginTop: 8 }}>Mapa no disponible en web</Text>
                                 </View>
                             )}
                            <TouchableOpacity 
                                onPress={handleOpenMap}
                                style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: theme.accent, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                            >
                                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Editar en Mapa</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                <View style={{ marginBottom: 12 }}>
                    <Text style={{ color: theme.textMuted, marginBottom: 6 }}>Horarios de Atención</Text>
                    <TextInput
                        value={businessHours}
                        onChangeText={setBusinessHours}
                        placeholder="Lun a Vie 9-18hs"
                        placeholderTextColor={theme.textMuted}
                        style={{ backgroundColor: theme.inputBackground, color: theme.inputText, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.likeBoxBackground }}
                    />
                </View>

                <View style={{ marginBottom: 12 }}>
                    <Text style={{ color: theme.textMuted, marginBottom: 6 }}>Sitio Web</Text>
                    <TextInput
                        value={website}
                        onChangeText={setWebsite}
                        placeholder="https://miagencia.com"
                        placeholderTextColor={theme.textMuted}
                        autoCapitalize="none"
                        keyboardType="url"
                        style={{ backgroundColor: theme.inputBackground, color: theme.inputText, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.likeBoxBackground }}
                    />
                </View>

                <View style={{ marginBottom: 12 }}>
                    <Text style={{ color: theme.textMuted, marginBottom: 6 }}>Instagram (Usuario)</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.inputBackground, borderRadius: 8, borderWidth: 1, borderColor: theme.likeBoxBackground }}>
                        <Text style={{ paddingLeft: 12, color: theme.textMuted }}>@</Text>
                        <TextInput
                            value={instagram}
                            onChangeText={setInstagram}
                            placeholder="usuario"
                            placeholderTextColor={theme.textMuted}
                            autoCapitalize="none"
                            style={{ flex: 1, color: theme.inputText, padding: 12 }}
                        />
                    </View>
                </View>

                <View style={{ marginBottom: 12 }}>
                    <Text style={{ color: theme.textMuted, marginBottom: 6 }}>Año de fundación</Text>
                    <TextInput
                        value={foundedYear}
                        onChangeText={(v) => setFoundedYear(v.replace(/\D/g, "").slice(0, 4))}
                        placeholder="2005"
                        placeholderTextColor={theme.textMuted}
                        keyboardType="numeric"
                        maxLength={4}
                        style={{ backgroundColor: theme.inputBackground, color: theme.inputText, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.likeBoxBackground }}
                    />
                </View>

                {/* Brand specialties */}
                <View style={{ marginBottom: 16 }}>
                    <Text style={{ color: theme.textMuted, marginBottom: 8 }}>
                        Marcas en las que se especializan ({brandSpecialties.length} seleccionadas)
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {BRANDS.map((brand) => {
                            const selected = brandSpecialties.includes(brand);
                            return (
                                <TouchableOpacity
                                    key={brand}
                                    onPress={() => toggleBrand(brand)}
                                    style={{
                                        paddingHorizontal: 12,
                                        paddingVertical: 6,
                                        borderRadius: 999,
                                        backgroundColor: selected ? theme.accent : theme.inputBackground,
                                        borderWidth: 1,
                                        borderColor: selected ? theme.accent : theme.likeBoxBackground,
                                    }}
                                >
                                    <Text style={{ color: selected ? "#fff" : theme.inputText, fontSize: 13, fontWeight: "600" }}>
                                        {brand}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {/* Showroom gallery */}
                <View style={{ marginBottom: 16 }}>
                    <Text style={{ color: theme.textMuted, marginBottom: 8 }}>
                        Galería del local ({showroomGallery.length}/6 fotos)
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                        {showroomGallery.map((uri, i) => (
                            <View key={i} style={{ position: "relative" }}>
                                <Image
                                    source={{ uri }}
                                    style={{ width: 110, height: 80, borderRadius: 10 }}
                                    resizeMode="cover"
                                />
                                <TouchableOpacity
                                    onPress={() => removeGalleryImage(i)}
                                    style={{
                                        position: "absolute",
                                        top: 4,
                                        right: 4,
                                        backgroundColor: "rgba(0,0,0,0.6)",
                                        borderRadius: 999,
                                        padding: 3,
                                    }}
                                >
                                    <Ionicons name="close" size={14} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        ))}
                        {showroomGallery.length < 6 && (
                            <TouchableOpacity
                                onPress={addGalleryImage}
                                disabled={galleryUploading}
                                style={{
                                    width: 110,
                                    height: 80,
                                    borderRadius: 10,
                                    borderWidth: 1.5,
                                    borderColor: theme.accent,
                                    borderStyle: "dashed",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 4,
                                    backgroundColor: theme.inputBackground,
                                }}
                            >
                                {galleryUploading ? (
                                    <ActivityIndicator color={theme.accent} size="small" />
                                ) : (
                                    <>
                                        <Ionicons name="add-circle-outline" size={24} color={theme.accent} />
                                        <Text style={{ color: theme.accent, fontSize: 11, fontWeight: "600" }}>
                                            Agregar
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        )}
                    </ScrollView>
                </View>

                {/* Embeddable widget snippet — web-only, matches the web-only dealer panel */}
                {Platform.OS === "web" && (
                    <View style={{ marginBottom: 4 }}>
                        <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600", marginBottom: 4 }}>
                            Widget para tu propia web
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 10 }}>
                            Pegá este código en tu sitio para mostrar tu stock en vivo de Matchcars.
                        </Text>
                        <View
                            style={{
                                backgroundColor: theme.inputBackground,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: theme.likeBoxBackground,
                                padding: 12,
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.textMuted,
                                    fontSize: 12,
                                    fontFamily: "monospace",
                                }}
                                selectable
                            >
                                {embedSnippet}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={handleCopyEmbed}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                marginTop: 10,
                                backgroundColor: embedCopied ? "#10B981" : theme.accent,
                                paddingVertical: 12,
                                borderRadius: 8,
                            }}
                        >
                            <Ionicons name={embedCopied ? "checkmark" : "copy-outline"} size={16} color="#fff" />
                            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
                                {embedCopied ? "¡Copiado!" : "Copiar código para tu web"}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        )}

        <TouchableOpacity
            onPress={handleSave}
            disabled={loading}
            style={{
                backgroundColor: theme.accent,
                padding: 16,
                borderRadius: 999,
                alignItems: "center",
                marginTop: 20,
                marginBottom: 40
            }}
        >
            {loading ? (
                <ActivityIndicator color="#FFF" />
            ) : (
                <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 16 }}>Guardar Cambios</Text>
            )}
        </TouchableOpacity>

      </ScrollView>
      </KeyboardAvoidingView>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={alertConfig.onClose}
        options={alertConfig.options}
      />
      </WebContainer>

      <Modal visible={mapVisible} animationType="slide" onRequestClose={() => setMapVisible(false)}>
        <View style={{ flex: 1 }}>
            {Platform.OS !== 'web' && MapView ? (
                <MapView 
                    style={{ flex: 1 }}
                    region={mapRegion}
                    onRegionChangeComplete={setMapRegion}
                    showsUserLocation
                    showsMyLocationButton
                />
            ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
                    <Text style={{ color: theme.text }}>El mapa no está disponible en la versión web.</Text>
                    <TouchableOpacity onPress={() => setMapVisible(false)} style={{ marginTop: 20, padding: 10, backgroundColor: theme.accent, borderRadius: 8 }}>
                        <Text style={{ color: '#fff' }}>Cerrar</Text>
                    </TouchableOpacity>
                </View>
            )}
            
            {/* Fixed Center Marker */}
            <View style={{ 
                position: 'absolute', 
                top: '50%', 
                left: '50%', 
                marginLeft: -24, 
                marginTop: -48, 
                pointerEvents: 'none' 
            }}>
                <Ionicons name="location" size={48} color={theme.accent} />
            </View>

            {/* Header / Close */}
            <View style={{ position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, left: 20, zIndex: 10 }}>
                <TouchableOpacity 
                    onPress={() => setMapVisible(false)}
                    style={{ backgroundColor: theme.card, padding: 10, borderRadius: 50, shadowColor: "#000", shadowOffset: {width:0,height:2}, shadowOpacity:0.25, shadowRadius:3.84, elevation:5 }}
                >
                    <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
            </View>
            
            {/* Title */}
            <View style={{ position: 'absolute', top: Platform.OS === 'ios' ? 60 : 30, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Mueve el mapa para ubicar</Text>
            </View>

            {/* Confirm Button */}
            <View style={{ position: 'absolute', bottom: 40, left: 20, right: 20 }}>
                <TouchableOpacity 
                    onPress={handleMapConfirm}
                    style={{ backgroundColor: theme.accent, padding: 16, borderRadius: 12, alignItems: 'center', shadowColor: "#000", shadowOffset: {width:0,height:2}, shadowOpacity:0.25, shadowRadius:3.84, elevation:5 }}
                >
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Confirmar Ubicación</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
