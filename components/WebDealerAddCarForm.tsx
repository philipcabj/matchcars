// components/WebDealerAddCarForm.tsx
// Formulario simplificado de "publicar auto" para agencias que operan desde la web.
// A diferencia de app/(screens)/add-car.tsx (mobile), no depende de
// expo-image-manipulator / expo-file-system (sin soporte en web): sube las fotos
// tal cual, sin recorte/rotación ni blur de patente por IA. El resto de la
// experiencia (marca/modelo/versión, precio sugerido, video walkaround) replica
// la app móvil porque son lógica pura / Firestore, sin dependencias nativas.
import { CustomAlert } from "@/components/CustomAlert";
import { Header } from "@/components/Header";
import { SelectionModal } from "@/components/SelectionModal";
import { WebContainer } from "@/components/WebContainer";
import { CAR_MODELS_AR } from "@/config/carModelsAr";
import { CITY_OPTIONS_BY_PROVINCE, PROVINCES } from "@/config/locations";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { usePriceSuggestion } from "@/hooks/usePriceSuggestion";
import { notifyAdminNewVehicle } from "@/lib/admin-notifications";
import { Analytics } from "@/lib/analytics";
import { db, storage } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { canUploadVideo, getMaxCars, isDealerPlan } from "@/lib/planChecks";
import { evaluateVehicleRisk } from "@/lib/riskScoring";
import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Currency = "ARS" | "USD";

const FUEL_OPTIONS = ["Nafta", "Diésel", "Híbrido", "Eléctrico", "GNC"];
const GEARBOX_OPTIONS = ["Manual", "Automática"];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 40 }, (_, i) => String(CURRENT_YEAR - i));
const DEFAULT_MAKES = ["Toyota", "Volkswagen", "Ford", "Chevrolet", "Peugeot", "Renault", "Fiat", "Honda", "Hyundai", "Nissan"];

const TOGGLES: { key: string; label: string }[] = [
  { key: "singleOwner", label: "Único dueño" },
  { key: "serviceRecords", label: "Service oficial al día" },
  { key: "vtvValid", label: "VTV vigente" },
  { key: "papersUpToDate", label: "Papeles al día" },
  { key: "warranty", label: "Con garantía" },
  { key: "acceptsTradeIn", label: "Acepta permuta" },
  { key: "acceptsFinancing", label: "Acepta financiación" },
  { key: "negotiablePrice", label: "Precio conversable" },
  { key: "immediateDelivery", label: "Entrega inmediata" },
];

export function WebDealerAddCarForm() {
  const { theme } = useTheme();
  const router = useRouter();
  const { user, profile, refreshTrustLevel } = useAuth();
  const userId = user?.uid || "anon";
  const plan = profile?.plan || "free";

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [version, setVersion] = useState("");
  const [year, setYear] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<Currency>("ARS");
  const [km, setKm] = useState("");
  const [fuelType, setFuelType] = useState("");
  const [gearbox, setGearbox] = useState("");
  const [description, setDescription] = useState("");
  const [province, setProvince] = useState(profile?.province || "");
  const [city, setCity] = useState(profile?.city || "");

  const [brandOpen, setBrandOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [yearOpen, setYearOpen] = useState(false);
  const [fuelOpen, setFuelOpen] = useState(false);
  const [gearboxOpen, setGearboxOpen] = useState(false);
  const [provinceOpen, setProvinceOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);

  const [makesRemote, setMakesRemote] = useState<string[]>([]);
  const [modelsRemote, setModelsRemote] = useState<string[]>([]);
  const [versionsRemote, setVersionsRemote] = useState<string[]>([]);
  const [citiesList, setCitiesList] = useState<string[]>([]);

  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  const [coverImage, setCoverImage] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);
  const [gallery, setGallery] = useState<string[]>([]);
  const [galleryUploading, setGalleryUploading] = useState(false);

  const [videoUri, setVideoUri] = useState("");
  const [videoUploading, setVideoUploading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: "error" | "success" | "info";
    onClose?: () => void;
  }>({ visible: false, title: "", message: "", type: "info" });

  const showAlert = (title: string, message: string, type: "error" | "success" | "info" = "error", onClose?: () => void) => {
    setAlertConfig({ visible: true, title, message, type, onClose });
  };
  const hideAlert = () => {
    const cb = alertConfig.onClose;
    setAlertConfig((prev) => ({ ...prev, visible: false }));
    if (cb) cb();
  };

  const priceSuggestion = usePriceSuggestion(brand, model, year, currency);

  // Marca / Modelo: catálogo local (CAR_MODELS_AR) + catálogo remoto (Firestore),
  // mismo mecanismo que add-car.tsx.
  const makes = useMemo(
    () => (CAR_MODELS_AR.length ? Array.from(new Set(CAR_MODELS_AR.map((x) => x.make))).sort() : DEFAULT_MAKES),
    []
  );
  const modelsByMake: Record<string, string[]> = useMemo(
    () =>
      CAR_MODELS_AR.reduce((acc, item) => {
        const list = acc[item.make] || [];
        if (!list.includes(item.model)) list.push(item.model);
        acc[item.make] = list;
        return acc;
      }, {} as Record<string, string[]>),
    []
  );
  const brandOptions = useMemo(() => Array.from(new Set([...makes, ...makesRemote])).sort(), [makes, makesRemote]);
  const modelOptions = useMemo(() => {
    const local = modelsByMake[brand] || [];
    return Array.from(new Set([...local, ...modelsRemote])).sort();
  }, [brand, modelsByMake, modelsRemote]);

  const loadMakes = async () => {
    try {
      const snap = await getDocs(collection(db, "catalog", "default", "makes"));
      const arr: string[] = [];
      snap.forEach((d) => arr.push((d.data() as any)?.name || d.id));
      setMakesRemote(arr);
    } catch {
      setMakesRemote([]);
    }
  };

  const loadModels = async (make: string) => {
    try {
      const snap = await getDocs(collection(db, "catalog", "default", "makes", make, "models"));
      const arr: string[] = [];
      snap.forEach((d) => arr.push((d.data() as any)?.name || d.id));
      setModelsRemote(arr.length ? arr : modelsByMake[make] || []);
    } catch {
      setModelsRemote(modelsByMake[make] || []);
    }
  };

  useEffect(() => {
    if (!brand || !model) {
      setVersionsRemote([]);
      return;
    }
    (async () => {
      try {
        const snap = await getDoc(doc(db, "catalog", "default", "makes", brand, "models", model));
        const remoteVersions = snap.exists() ? (snap.data() as any)?.versions : null;
        if (Array.isArray(remoteVersions) && remoteVersions.length > 0) {
          setVersionsRemote(remoteVersions);
          return;
        }
      } catch (e) {
        logger.log("Error loading versions:", e);
      }
      const local = CAR_MODELS_AR.find((x) => x.make === brand && x.model === model);
      setVersionsRemote(local?.versions || []);
    })();
  }, [brand, model]);

  useEffect(() => {
    if (!province) {
      setCitiesList([]);
      return;
    }
    const defaults = CITY_OPTIONS_BY_PROVINCE[province] || [];
    (async () => {
      try {
        const snap = await getDoc(doc(db, "catalog", "default", "provinces", province));
        const remoteCities: string[] = snap.exists() && Array.isArray((snap.data() as any)?.cities) ? (snap.data() as any).cities : [];
        setCitiesList(Array.from(new Set([...defaults, ...remoteCities])).sort());
      } catch {
        setCitiesList(defaults.sort());
      }
    })();
  }, [province]);

  async function uploadPhoto(uri: string): Promise<string> {
    const response = await fetch(uri);
    const blob = await response.blob();
    const filename = `${Date.now()}_${Math.floor(Math.random() * 1e6)}.jpg`;
    const path = `uploads/${userId}/${filename}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob, { contentType: blob.type || "image/jpeg" });
    return getDownloadURL(storageRef);
  }

  const pickCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert("Permiso requerido", "Necesitamos acceso a tus fotos para subir la portada.", "info");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (res.canceled || !res.assets?.[0]) return;
    setCoverUploading(true);
    try {
      const url = await uploadPhoto(res.assets[0].uri);
      setCoverImage(url);
    } catch (e) {
      logger.log("Error subiendo portada:", e);
      showAlert("Error", "No se pudo subir la foto de portada.", "error");
    } finally {
      setCoverUploading(false);
    }
  };

  const pickGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert("Permiso requerido", "Necesitamos acceso a tus fotos para subir la galería.", "info");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.9,
    });
    if (res.canceled || !res.assets?.length) return;
    setGalleryUploading(true);
    try {
      const urls = await Promise.all(res.assets.map((a) => uploadPhoto(a.uri)));
      setGallery((prev) => [...prev, ...urls]);
    } catch (e) {
      logger.log("Error subiendo galería:", e);
      showAlert("Error", "No se pudieron subir algunas fotos.", "error");
    } finally {
      setGalleryUploading(false);
    }
  };

  const removeGalleryPhoto = (url: string) => {
    setGallery((prev) => prev.filter((g) => g !== url));
  };

  const pickVideo = async () => {
    if (!canUploadVideo(plan)) {
      showAlert("Función Premium", "El video walkaround es exclusivo para planes pagos.", "info", () => router.push("/(screens)/subscribe"));
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert("Permiso requerido", "Necesitamos acceso a tu galería.", "info");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoQuality: 1,
      allowsMultipleSelection: false,
    });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    const asset = res.assets[0];
    if (asset.duration && asset.duration > 60000) {
      showAlert("Video muy largo", "El video no puede durar más de 60 segundos.", "info");
      return;
    }

    setVideoUploading(true);
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const filename = `${Date.now()}_video.mp4`;
      const path = `uploads/${userId}/videos/${filename}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, blob, { contentType: "video/mp4" });
      const url = await getDownloadURL(storageRef);
      setVideoUri(url);
    } catch (e) {
      console.error("Upload video error", e);
      showAlert("Error", "No se pudo subir el video.", "error");
    } finally {
      setVideoUploading(false);
    }
  };

  const removeVideo = () => setVideoUri("");

  const handleSubmit = async () => {
    if (!user) {
      showAlert("Sesión requerida", "Iniciá sesión para publicar.", "info");
      return;
    }

    const limit = getMaxCars(plan);
    if (limit !== Infinity) {
      try {
        const qAll = query(collection(db, "vehicles"), where("userId", "==", userId));
        const snapshot = await getDocs(qAll);
        const EXCLUDED_STATUSES = ["deleted", "rejected", "blocked", "sold"];
        const activeCount = snapshot.docs.filter((d) => {
          const status = (d.data().status as string) || "available";
          return !EXCLUDED_STATUSES.includes(status);
        }).length;
        if (activeCount >= limit) {
          showAlert(
            "Límite alcanzado",
            `Tu plan actual permite hasta ${limit} autos activos. Tenés ${activeCount} (incluyendo los pendientes de aprobación). Actualizá tu plan para publicar más.`,
            "info",
            () => router.push("/(screens)/subscribe")
          );
          return;
        }
      } catch (e) {
        console.error("Error checking limit", e);
        showAlert("Error", "No se pudo verificar el límite de publicaciones. Intentá de nuevo.", "error");
        return;
      }
    }

    if (!brand.trim() || !model.trim() || !year || !price) {
      showAlert("Faltan datos", "Marca, modelo, año y precio son obligatorios.", "info");
      return;
    }
    if (!coverImage || coverUploading || galleryUploading || videoUploading) {
      showAlert("Carga en proceso", "Esperá a que termine de subir la foto de portada.", "info");
      return;
    }

    const yearNum = Number(year);
    const priceNum = Number(price);
    const kmNum = km ? Number(km) : 0;

    try {
      setLoading(true);

      if (priceSuggestion.avg > 0 && priceNum > priceSuggestion.avg * 1.5) {
        showAlert(
          "Precio muy alto",
          "El precio que cargaste está más de 50% por encima del valor de mercado estimado. Revisá el precio sugerido y ajustalo para publicar.",
          "info"
        );
        setLoading(false);
        return;
      }

      let risk = { flags: [] as string[], score: 0 };
      try {
        risk = await evaluateVehicleRisk({
          brand,
          model,
          year: yearNum,
          price: priceNum,
          currency,
          description,
          userId,
          trustLevel: profile?.trustLevel || "new",
          coverImage,
        });
      } catch (e) {
        console.error("Error evaluando riesgo (no bloqueante):", e);
      }

      const isDealer = isDealerPlan(plan);
      const userName = isDealer && profile?.agencyName ? profile.agencyName : (user.displayName || user.email || "Agencia");

      const vehicleData = {
        userId,
        userName,
        userPlan: plan,
        sellerTrustLevel: profile?.trustLevel || "new",
        brand: brand.trim(),
        model: model.trim(),
        version: version || null,
        year: yearNum,
        price: priceNum,
        currency,
        km: kmNum,
        fuelType: fuelType || null,
        gearbox: gearbox || null,
        doors: null,
        description: description || null,

        singleOwner: !!toggles.singleOwner,
        serviceRecords: !!toggles.serviceRecords,
        vtvValid: !!toggles.vtvValid,
        papersUpToDate: !!toggles.papersUpToDate,
        warranty: !!toggles.warranty,

        location: {
          province: province || profile?.province || null,
          city: city || profile?.city || null,
        },
        images: {
          cover: coverImage,
          gallery,
        },
        video: videoUri || null,
        acceptsFinancing: !!toggles.acceptsFinancing,
        negotiablePrice: !!toggles.negotiablePrice,
        immediateDelivery: !!toggles.immediateDelivery,
        sellingReason: null,
        originalPrice: priceNum,
        priceHistory: [{ price: priceNum, currency, changedAt: Timestamp.now() }],
        updatedAt: serverTimestamp(),
        financing: null,
        published: false,
        status: "pending_review",
        likedBy: [],
        isFeatured: isDealer,
        featuredAt: isDealer ? serverTimestamp() : null,
        views: 0,
        likesCount: 0,
        flags: {
          forSale: true,
          tradeIn: !!toggles.acceptsTradeIn,
        },
        riskFlags: risk.flags,
        riskScore: risk.score,
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "vehicles"), vehicleData);

      Analytics.logCarPublished(brand, model, priceNum, currency);

      try {
        await notifyAdminNewVehicle(docRef.id, vehicleData);
      } catch (e) {
        console.error("Error notifying admin:", e);
      }

      try {
        const brandRef = doc(db, "catalog", "default", "makes", brand);
        await setDoc(brandRef, { name: brand }, { merge: true });
        const modelRef = doc(db, "catalog", "default", "makes", brand, "models", model);
        await setDoc(modelRef, { name: model }, { merge: true });
        if (version) {
          await setDoc(modelRef, { versions: arrayUnion(version) }, { merge: true });
        }
        if (province && city) {
          const provRef = doc(db, "catalog", "default", "provinces", province);
          await setDoc(provRef, { name: province, cities: arrayUnion(city) }, { merge: true });
        }
      } catch (e) {
        console.error("Error updating catalog:", e);
      }

      await refreshTrustLevel();

      showAlert("Publicación pendiente", "Tu auto fue enviado a moderación. Te avisaremos cuando sea aprobado.", "success", () =>
        router.push("/(tabs)/mycars")
      );
    } catch (e: any) {
      showAlert("Error", e.message ?? "No se pudo publicar el auto.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header title="Publicar auto" showBack showHome />
      <WebContainer>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          <Text style={{ color: theme.textMuted, marginBottom: 20, lineHeight: 20 }}>
            Formulario simplificado para agencias. Para recorte de fotos, blur de patente y otras
            herramientas de edición, usá la app móvil.
          </Text>

          {/* Marca / Modelo / Versión */}
          <SelectField
            label="Marca *"
            value={brand}
            placeholder="Seleccionar marca"
            onPress={() => {
              setBrandOpen(true);
              loadMakes();
            }}
            theme={theme}
          />
          <SelectionModal
            visible={brandOpen}
            title="Seleccionar Marca"
            options={brandOptions}
            value={brand}
            onSelect={(m) => {
              setBrand(m);
              setModel("");
              setVersion("");
              setVersionsRemote([]);
              loadModels(m);
            }}
            onClose={() => setBrandOpen(false)}
            placeholder="Buscar marca"
            variant="inline"
            allowAdd
          />

          <SelectField
            label="Modelo *"
            value={model}
            placeholder={brand ? "Seleccionar modelo" : "Elegí primero una marca"}
            disabled={!brand}
            onPress={async () => {
              if (!brand) return;
              await loadModels(brand);
              setModelOpen(true);
            }}
            theme={theme}
          />
          <SelectionModal
            visible={modelOpen}
            title="Seleccionar Modelo"
            options={modelOptions}
            value={model}
            onSelect={(m) => {
              setModel(m);
              setVersion("");
              setVersionsRemote([]);
            }}
            onClose={() => setModelOpen(false)}
            placeholder="Buscar modelo"
            variant="inline"
            allowAdd
          />

          <SelectField
            label="Versión"
            value={version}
            placeholder={model ? "Seleccionar versión" : "Elegí primero un modelo"}
            disabled={!model}
            onPress={() => model && setVersionOpen(true)}
            theme={theme}
          />
          <SelectionModal
            visible={versionOpen}
            title="Seleccionar Versión"
            options={versionsRemote}
            value={version}
            onSelect={(v) => setVersion(v)}
            onClose={() => setVersionOpen(false)}
            placeholder="Buscar versión"
            variant="inline"
            allowAdd
          />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <SelectField label="Año *" value={year} placeholder="Seleccionar año" onPress={() => setYearOpen(true)} theme={theme} />
              <SelectionModal
                visible={yearOpen}
                title="Seleccionar Año"
                options={YEAR_OPTIONS}
                value={year}
                onSelect={(y) => setYear(y)}
                onClose={() => setYearOpen(false)}
                placeholder="Buscar año"
                variant="inline"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Kilómetros" value={km} onChangeText={setKm} theme={theme} keyboardType="numeric" />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label="Precio *" value={price} onChangeText={setPrice} theme={theme} keyboardType="numeric" />
            </View>
            <View style={{ width: 110 }}>
              <Text style={{ color: theme.text, marginBottom: 4, fontSize: 14 }}>Moneda</Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {(["ARS", "USD"] as Currency[]).map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setCurrency(c)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 8,
                      alignItems: "center",
                      backgroundColor: currency === c ? theme.accent : theme.inputBackground,
                      borderWidth: 1,
                      borderColor: currency === c ? theme.accent : theme.border,
                    }}
                  >
                    <Text style={{ color: currency === c ? "#fff" : theme.text, fontWeight: "700", fontSize: 12 }}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {priceSuggestion.loading && brand && model && year && (
            <Text style={{ marginBottom: 12, color: theme.textMuted, fontSize: 12, fontStyle: "italic" }}>
              Calculando precio de mercado...
            </Text>
          )}
          {priceSuggestion.count > 0 && !priceSuggestion.loading && (
            <TouchableOpacity
              onPress={() => setPrice(Math.round(priceSuggestion.avg).toString())}
              style={{ marginBottom: 16, flexDirection: "row", alignItems: "center", backgroundColor: theme.card, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.border }}
            >
              <Ionicons name="bar-chart-outline" size={15} color={theme.textMuted} style={{ marginRight: 6 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700" }}>
                  Promedio de mercado: {currency} {Math.round(priceSuggestion.avg).toLocaleString("es-AR")}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 10 }}>
                  {priceSuggestion.count} publicaciones similares · Min {priceSuggestion.min.toLocaleString("es-AR")} – Max {priceSuggestion.max.toLocaleString("es-AR")}
                </Text>
              </View>
              <Text style={{ color: theme.textMuted, fontSize: 10 }}>Tocar para aplicar</Text>
            </TouchableOpacity>
          )}

          <SelectField label="Combustible" value={fuelType} placeholder="Seleccionar" onPress={() => setFuelOpen(true)} theme={theme} />
          <SelectionModal
            visible={fuelOpen}
            title="Seleccionar Combustible"
            options={FUEL_OPTIONS}
            value={fuelType}
            onSelect={(f) => setFuelType(f)}
            onClose={() => setFuelOpen(false)}
            searchable={false}
            variant="inline"
          />

          <SelectField label="Caja" value={gearbox} placeholder="Seleccionar" onPress={() => setGearboxOpen(true)} theme={theme} />
          <SelectionModal
            visible={gearboxOpen}
            title="Seleccionar Caja"
            options={GEARBOX_OPTIONS}
            value={gearbox}
            onSelect={(g) => setGearbox(g)}
            onClose={() => setGearboxOpen(false)}
            searchable={false}
            variant="inline"
          />

          {/* Ubicación */}
          <SelectField label="Provincia" value={province} placeholder="Seleccionar provincia" onPress={() => setProvinceOpen(true)} theme={theme} />
          <SelectionModal
            visible={provinceOpen}
            title="Seleccionar Provincia"
            options={PROVINCES}
            value={province}
            onSelect={(p) => {
              setProvince(p);
              setCity("");
            }}
            onClose={() => setProvinceOpen(false)}
            placeholder="Buscar provincia"
            variant="inline"
          />

          <SelectField
            label="Ciudad"
            value={city}
            placeholder={province ? "Seleccionar ciudad" : "Elegí provincia primero"}
            disabled={!province}
            onPress={() => province && setCityOpen(true)}
            theme={theme}
          />
          <SelectionModal
            visible={cityOpen}
            title="Seleccionar Ciudad"
            options={citiesList}
            value={city}
            onSelect={(c) => setCity(c)}
            onClose={() => setCityOpen(false)}
            placeholder="Buscar ciudad"
            variant="inline"
            allowAdd
          />

          <Text style={{ color: theme.text, marginBottom: 4, fontSize: 14, marginTop: 4 }}>Descripción</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Detalles del vehículo, estado, equipamiento..."
            placeholderTextColor={theme.textMuted}
            multiline
            numberOfLines={4}
            style={{
              backgroundColor: theme.inputBackground,
              color: theme.inputText,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 16,
              minHeight: 90,
              textAlignVertical: "top",
            }}
          />

          {/* Toggles */}
          <Text style={{ color: theme.text, fontWeight: "700", fontSize: 15, marginBottom: 10 }}>Características</Text>
          <View style={{ marginBottom: 20, gap: 4 }}>
            {TOGGLES.map((t) => (
              <View
                key={t.key}
                style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }}
              >
                <Text style={{ color: theme.text, fontSize: 14 }}>{t.label}</Text>
                <Switch
                  value={!!toggles[t.key]}
                  onValueChange={(v) => setToggles((prev) => ({ ...prev, [t.key]: v }))}
                  trackColor={{ false: theme.border, true: theme.accent }}
                />
              </View>
            ))}
          </View>

          {/* Fotos */}
          <Text style={{ color: theme.text, fontWeight: "700", fontSize: 15, marginBottom: 10 }}>Fotos</Text>
          <TouchableOpacity
            onPress={pickCover}
            disabled={coverUploading}
            style={{
              backgroundColor: theme.card,
              borderRadius: 12,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: theme.border,
              padding: 16,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            {coverUploading ? (
              <ActivityIndicator color={theme.accent} />
            ) : coverImage ? (
              <Image source={{ uri: coverImage }} style={{ width: "100%", height: 180, borderRadius: 10 }} resizeMode="cover" />
            ) : (
              <>
                <Ionicons name="image-outline" size={28} color={theme.accent} />
                <Text style={{ color: theme.text, marginTop: 6 }}>Subir foto de portada *</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={pickGallery}
            disabled={galleryUploading}
            style={{
              backgroundColor: theme.card,
              borderRadius: 12,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: theme.border,
              padding: 16,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            {galleryUploading ? (
              <ActivityIndicator color={theme.accent} />
            ) : (
              <>
                <Ionicons name="images-outline" size={28} color={theme.accent} />
                <Text style={{ color: theme.text, marginTop: 6 }}>Agregar más fotos ({gallery.length})</Text>
              </>
            )}
          </TouchableOpacity>

          {gallery.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 20 }}>
              {gallery.map((url) => (
                <View key={url} style={{ position: "relative" }}>
                  <Image source={{ uri: url }} style={{ width: 80, height: 80, borderRadius: 8 }} />
                  <TouchableOpacity
                    onPress={() => removeGalleryPhoto(url)}
                    style={{ position: "absolute", top: -6, right: -6, backgroundColor: theme.background, borderRadius: 10 }}
                  >
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Video walkaround */}
          <View style={{ marginTop: 4, marginBottom: 20, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 16 }}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600", marginBottom: 10 }}>Video Walkaround</Text>
            {!videoUri ? (
              <TouchableOpacity
                onPress={pickVideo}
                disabled={videoUploading}
                style={{
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderStyle: "dashed",
                  backgroundColor: theme.card,
                  paddingVertical: 24,
                  alignItems: "center",
                  borderRadius: 12,
                }}
              >
                {videoUploading ? (
                  <ActivityIndicator size="large" color={theme.accent} />
                ) : (
                  <Ionicons name="videocam-outline" size={28} color={theme.accent} />
                )}
                <Text style={{ color: theme.text, marginTop: 8 }}>
                  {videoUploading ? "Subiendo video..." : "Subir video (máx 60s)"}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: "100%", height: 220, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: theme.border, backgroundColor: "#000" }}>
                <Video
                  source={{ uri: videoUri }}
                  style={{ width: "100%", height: "100%" }}
                  useNativeControls
                  resizeMode={ResizeMode.COVER}
                  isLooping={false}
                  isMuted
                />
                <TouchableOpacity
                  onPress={removeVideo}
                  style={{ position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12, padding: 4 }}
                >
                  <Ionicons name="close" size={20} color="#FFF" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading}
            style={{
              backgroundColor: loading ? theme.textMuted : theme.accent,
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: "center",
              marginTop: 10,
            }}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Publicar auto</Text>}
          </TouchableOpacity>
        </ScrollView>
      </WebContainer>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={hideAlert}
      />
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  theme,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  theme: any;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: theme.text, marginBottom: 4, fontSize: 14 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        keyboardType={keyboardType || "default"}
        style={{
          backgroundColor: theme.inputBackground,
          color: theme.inputText,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      />
    </View>
  );
}

function SelectField({
  label,
  value,
  placeholder,
  onPress,
  theme,
  disabled,
}: {
  label: string;
  value: string;
  placeholder: string;
  onPress: () => void;
  theme: any;
  disabled?: boolean;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: theme.text, marginBottom: 4, fontSize: 14 }}>{label}</Text>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        style={{
          backgroundColor: theme.inputBackground,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 12,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <Text style={{ color: value ? theme.inputText : theme.textMuted, fontWeight: value ? "700" : "400" }}>{value || placeholder}</Text>
        <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
      </TouchableOpacity>
    </View>
  );
}
