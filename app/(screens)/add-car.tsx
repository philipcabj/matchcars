// app/(screens)/add-car.tsx
import { CustomAlert } from "@/components/CustomAlert";
import { SelectionModal } from "@/components/SelectionModal";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db, storage } from "@/lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes, uploadBytesResumable, uploadString } from "firebase/storage";
import React, { useEffect, useRef, useState } from "react";
import type { KeyboardTypeOptions } from "react-native";
import {
  Button,
  Image,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CAR_MODELS_AR } from "../../config/carModelsAr";
type InputProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: KeyboardTypeOptions;
  placeholder?: string;
};

const Input = ({
  label,
  value,
  onChangeText,
  keyboardType = "default",
  placeholder,
}: InputProps) => {
  const { theme } = useTheme();
  const inputRef = useRef<TextInput>(null);
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: theme.text, marginBottom: 4, fontSize: 14 }}>
        {label}
      </Text>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => {
          onChangeText(text);
        }}
        onFocus={() => {}}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        blurOnSubmit={true}
        returnKeyType={keyboardType === "numeric" || keyboardType === "number-pad" ? "done" : "next"}
        onSubmitEditing={() => Keyboard.dismiss()}
        autoCorrect={false}
        autoCapitalize="none"
        style={{
          borderRadius: 10,
          borderWidth: 1,
          borderColor: theme.likeBoxBackground,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: theme.inputText,
          backgroundColor: theme.inputBackground,
        }}
      />
    </View>
  );
};

export default function AddCarScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();

  const userId = user?.uid || "anon";
  const userName = user?.displayName || user?.email || "usuario";

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [version, setVersion] = useState("");
  const [year, setYear] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<"ARS" | "USD">("ARS");
  const [km, setKm] = useState("");
  const [province, setProvince] = useState("");

  const [coverImage, setCoverImage] = useState("");
  const [coverLocalUri, setCoverLocalUri] = useState<string>("");
  const [coverUploading, setCoverUploading] = useState<boolean>(false);
  const [coverProgress, setCoverProgress] = useState<number>(0);
  const [gallery, setGallery] = useState<{ localUri: string; base64?: string; url?: string; uploading: boolean; progress?: number }[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [makesRemote, setMakesRemote] = useState<string[]>([]);
  const [yearOpen, setYearOpen] = useState(false);
  type CarArItem = { make: string; model: string; versions?: string[] };
  const [modelsRemote, setModelsRemote] = useState<string[]>([]);
  const [versionsRemote, setVersionsRemote] = useState<string[]>([]);
  const [brandOpen, setBrandOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [provinceOpen, setProvinceOpen] = useState(false);
  const [fuelType, setFuelType] = useState("");
  const [gearbox, setGearbox] = useState("");
  const [fuelOpen, setFuelOpen] = useState(false);
  const [gearboxOpen, setGearboxOpen] = useState(false);
  const [acceptsFinancing, setAcceptsFinancing] = useState(false);
  const [finRate, setFinRate] = useState("");
  const [finMonths, setFinMonths] = useState("");
  const [details, setDetails] = useState("");
  const MODELS_AR: CarArItem[] = Array.isArray(CAR_MODELS_AR) ? CAR_MODELS_AR : [];

  const [alertConfig, setAlertConfig] = useState<{ 
    visible: boolean; 
    title: string; 
    message: string; 
    type: "error" | "success" | "info";
    showCancel?: boolean;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
  }>({ visible: false, title: "", message: "", type: "info" });
  const [successAction, setSuccessAction] = useState<(() => void) | null>(null);

  const showAlert = (
    title: string, 
    message: string, 
    type: "error" | "success" | "info" = "error", 
    onOk?: () => void,
    options?: { showCancel?: boolean; onCancel?: () => void; confirmText?: string; cancelText?: string }
  ) => {
    setSuccessAction(() => onOk || null);
    setAlertConfig({ 
      visible: true, 
      title, 
      message, 
      type,
      showCancel: options?.showCancel,
      onCancel: () => {
        if (options?.onCancel) options.onCancel();
        setAlertConfig((prev) => ({ ...prev, visible: false }));
      },
      confirmText: options?.confirmText,
      cancelText: options?.cancelText
    });
  };

  const hideAlert = () => {
    setAlertConfig((prev) => ({ ...prev, visible: false }));
    if (successAction) {
      successAction();
      setSuccessAction(null);
    }
  };

  useEffect(() => {
    if (brand && model) {
      loadVersions(brand, model);
    } else {
      setVersionsRemote([]);
    }
  }, [brand, model]);

  const DEFAULT_MAKES: string[] = [
    "Toyota",
    "Volkswagen",
    "Ford",
    "Chevrolet",
    "Peugeot",
    "Renault",
    "Fiat",
    "Honda",
    "Hyundai",
    "Nissan",
  ];
  const DEFAULT_MODELS_BY_MAKE: Record<string, string[]> = {
    Toyota: ["Corolla", "Hilux", "Yaris", "Etios"],
    Volkswagen: ["Gol", "Polo", "Virtus", "T-Cross"],
    Ford: ["Fiesta", "Focus", "Ka", "Ranger"],
    Chevrolet: ["Onix", "Cruze", "S10", "Tracker"],
    Peugeot: ["208", "308", "2008", "Partner"],
    Renault: ["Sandero", "Logan", "Kwid", "Duster"],
    Fiat: ["Argo", "Cronos", "Uno", "Toro"],
    Honda: ["Civic", "Fit", "HR-V", "City"],
    Hyundai: ["HB20", "i20", "Creta", "Tucson"],
    Nissan: ["Versa", "March", "Sentra", "Frontier"],
  };
  const makes: string[] = MODELS_AR.length
    ? Array.from(new Set(MODELS_AR.map((x) => x.make))).sort()
    : DEFAULT_MAKES;
  const modelsByMake: Record<string, string[]> = MODELS_AR.length ? MODELS_AR.reduce((acc, item) => {
    const list = acc[item.make] || [];
    if (!list.includes(item.model)) list.push(item.model);
    acc[item.make] = list;
    return acc;
  }, {} as Record<string, string[]>) : DEFAULT_MODELS_BY_MAKE;
  const modelOptions = modelsRemote.length > 0 ? modelsRemote : (modelsByMake[brand] || []);
  const CURRENT_YEAR = new Date().getFullYear();
  const yearOptions = Array.from({ length: 40 }, (_, i) => String(CURRENT_YEAR - i));
  const PROVINCES: string[] = [
    "Buenos Aires",
    "CABA",
    "Catamarca",
    "Chaco",
    "Chubut",
    "Córdoba",
    "Corrientes",
    "Entre Ríos",
    "Formosa",
    "Jujuy",
    "La Pampa",
    "La Rioja",
    "Mendoza",
    "Misiones",
    "Neuquén",
    "Río Negro",
    "Salta",
    "San Juan",
    "San Luis",
    "Santa Cruz",
    "Santa Fe",
    "Santiago del Estero",
    "Tierra del Fuego",
    "Tucumán",
  ];

  

  async function loadMakes() {
    try {
      const snap = await getDocs(collection(db, "catalog", "default", "makes"));
      const arr: string[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        const name = data?.name || d.id;
        if (name) arr.push(name);
      });
      setMakesRemote(arr);
    } catch {
      setMakesRemote([]);
    }
  }

  async function loadModels(make: string) {
    try {
      const snap = await getDocs(collection(db, "catalog", "default", "makes", make, "models"));
      const arr: string[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        const name = data?.name || d.id;
        if (name) arr.push(name);
      });
      setModelsRemote(arr.length ? arr : (modelsByMake[make] || []));
    } catch {
      setModelsRemote(modelsByMake[make] || []);
    }
  }

  async function loadVersions(make: string, model: string) {
    console.log("loadVersions called for:", make, model);
    try {
      const docRef = doc(db, "catalog", "default", "makes", make, "models", model);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data?.versions && Array.isArray(data.versions) && data.versions.length > 0) {
          console.log("Remote versions found:", data.versions);
          setVersionsRemote(data.versions);
          return;
        }
      }
      // Fallback local if remote not found
      console.log("Fallback to local versions");
      const item = MODELS_AR.find((x) => x.make === make && x.model === model);
      console.log("Local item found:", item);
      setVersionsRemote(item?.versions || []);
    } catch (e) {
      // console.error("Error loading versions:", e);
      const item = MODELS_AR.find((x) => x.make === make && x.model === model);
      setVersionsRemote(item?.versions || []);
    }
  }

  async function uploadCatalogToFirestore() {
    const makesList: string[] = Array.from(new Set(MODELS_AR.map((x) => x.make)));
    for (const mk of makesList) {
      await setDoc(doc(db, "catalog", "default", "makes", mk), { name: mk });
      
      const itemsForMake = MODELS_AR.filter(x => x.make === mk);
      for (const item of itemsForMake) {
        const mo = item.model;
        const versions = item.versions || [];
        await setDoc(doc(db, "catalog", "default", "makes", mk, "models", mo), { 
          name: mo,
          versions: versions 
        });
      }
    }
    await loadMakes();
    if (brand) await loadModels(brand);
  }


  async function uploadWithRetry(storageRef: any, base64: string, onProgress?: (p: number) => void, storagePath?: string) {
    const delays = [800, 1600];
    for (let i = 0; i <= delays.length; i++) {
      try {
        const url = await uploadImage(storageRef, undefined, base64, onProgress, storagePath);
        return url;
      } catch (e) {
        if (i === delays.length) throw e;
        await new Promise((r) => setTimeout(r, delays[i]));
      }
    }
    throw new Error("retry failed");
  }

  const uploadImage = async (
    storageRef: any,
    blob?: Blob,
    base64?: string,
    onProgress?: (p: number) => void,
    storagePath?: string
  ) => {
    if (blob) {
      try {
        console.log("Starting uploadBytesResumable to:", storageRef.fullPath);
        // Forzamos un objeto Blob nuevo para evitar problemas de tipos
        const cleanBlob = blob; // En Expo el blob ya viene bien del XHR
        const task = uploadBytesResumable(storageRef, cleanBlob, { contentType: "image/jpeg" });
        task.on("state_changed", (snap) => {
          if (onProgress) {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            onProgress(pct);
          }
        });
        await new Promise<void>((resolve, reject) => {
          task.on("state_changed", undefined, reject, resolve);
        });
        const url = await getDownloadURL(task.snapshot.ref);
        return url;
      } catch (e: any) {
        console.error("uploadBytesResumable failed:", e);
        // fallback sin progreso
        try {
            console.log("Falling back to uploadBytes");
            await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
            const url = await getDownloadURL(storageRef);
            if (onProgress) onProgress(100);
            return url;
        } catch (e2) {
             console.error("uploadBytes failed as well:", e2);
             throw e2;
        }
      }
    }
    if (base64) {
      const isExpoGo = Constants.appOwnership === "expo";
      if (!isExpoGo && Platform.OS !== "web") {
        try {
          const rnStorage = require("@react-native-firebase/storage").default;
          if (rnStorage && storagePath) {
            const nativeRef = rnStorage().ref(storagePath);
            const task = nativeRef.putString(base64, "base64", { contentType: "image/jpeg" });
            task.on("state_changed", (snap: any) => {
              if (onProgress) {
                const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
                onProgress(pct);
              }
            });
            await task;
            const url = await nativeRef.getDownloadURL();
            return url;
          }
        } catch {}
      }
      const dataUrl = `data:image/jpeg;base64,${base64}`;
      await uploadString(storageRef, dataUrl, "data_url");
      const url = await getDownloadURL(storageRef);
      if (onProgress) onProgress(100);
      return url;
    }
    if (!blob) throw new Error("No image content provided");
    const task = uploadBytesResumable(storageRef, blob, { contentType: "image/jpeg" });
    task.on("state_changed", (snap) => {
      if (onProgress) {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        onProgress(pct);
      }
    });
    await new Promise<void>((resolve, reject) => {
      task.on("state_changed", undefined, reject, resolve);
    });
    const url = await getDownloadURL(task.snapshot.ref);
    return url;
  };



  async function pickImageAndUpload(type: "cover" | "gallery") {
    if (!user) {
      showAlert("Sesión requerida", "Iniciá sesión para subir fotos.", "info");
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert("Permiso requerido", "Necesitamos acceso a tus fotos.", "info");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
      allowsMultipleSelection: type === "gallery",
      selectionLimit: type === "gallery" ? Math.max(1, 8 - gallery.length) : 1,
    });
    if (res.canceled) return;
    const assets = type === "gallery" ? (res.assets || []) : (res.assets || []).slice(0, 1);
    const baseIndex = gallery.length;
    let localIdx = 0;

    for (const asset of assets) {
      if (!asset?.uri) continue;
      const manipulated = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: 1200 } }], {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      let uri = manipulated.uri;
      let blob: Blob | undefined;
      try {
        blob = await new Promise((resolve, reject) => {
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
        // Explicit cast for TS
        blob = blob as Blob;
      } catch (e) {
        showAlert("Error", "No se pudo procesar la imagen.", "error");
        continue;
      }
      const filename = `${Date.now()}_${Math.floor(Math.random() * 1e6)}.jpg`;
      const path = `uploads/${userId}/${filename}`;
      const storageRef = ref(storage, path);

            if (type === "cover") {
        setCoverLocalUri(uri);
        setCoverUploading(true);
        setCoverProgress(0);
        try {
          console.log("user in upload", user?.uid);
          console.log("storage debug bucket:", (storage as any)?._bucket?.bucket || (storage as any)?.app?.options?.storageBucket);
          
          // Test direct upload string to verify permissions/connectivity
          // const testRef = ref(storage, `test/${Date.now()}.txt`);
          // await uploadString(testRef, "test", "raw");
          
          const url = await uploadImage(
            storageRef,
            blob!,
            undefined,
            (p) => setCoverProgress(p),
            path
          );
          setCoverImage(url);
        } catch (e: any) {
          console.error("upload cover error", {
            code: e?.code,
            message: e?.message,
            name: e?.name,
            customData: e?.customData,
            full: JSON.stringify(e, null, 2),
          });
          const code = e?.code || "storage/unknown";
          const srv = e?.customData?.serverResponse;
          showAlert(
            "Error",
            srv
              ? `No se pudo subir la portada (${code}).`
              : `No se pudo subir la portada (${code}).`,
            "error"
          );
        } finally {
          setCoverUploading(false);
        }
      }
 else {
        if (gallery.length >= 8) {
          showAlert("Límite de galería", "Podés agregar hasta 8 fotos.", "info");
          break;
        }
        const idx = baseIndex + localIdx;
        setGallery((prev) => [...prev, { localUri: uri, uploading: true, progress: 0 }]);
        try {
          blob = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.onload = function () {
              resolve(xhr.response);
            };
            xhr.onerror = function (e) {
              console.log(e);
              reject(new TypeError("Network request failed"));
            };
            xhr.responseType = "blob";
            xhr.open("GET", uri, true);
            xhr.send(null);
          });
          blob = blob as Blob;
          const url = await uploadImage(storageRef, blob!, undefined, (p) => {
            setGallery((prev) => prev.map((g, i) => (i === idx ? { ...g, progress: p } : g)));
          }, path);
          setGallery((prev) => prev.map((g, i) => (i === idx ? { ...g, url, uploading: false, progress: 100 } : g)));
        } catch (e: any) {
          // console.error("upload gallery error", e?.code, e?.message, e?.customData);
          const code = e?.code || "storage/unknown";
          const srv = e?.customData?.serverResponse;
          showAlert("Error", srv ? `No se pudo subir una imagen (${code})` : `No se pudo subir una imagen (${code}).`, "error");
          setGallery((prev) => prev.map((g, i) => (i === idx ? { ...g, uploading: false, progress: 0 } : g)));
        }
        localIdx++;
      }
    }
  }

  async function retryGalleryUpload(index: number) {
    const item = gallery[index];
    if (!item || item.url || item.uploading) return;
    try {
      setGallery((prev) => prev.map((g, i) => (i === index ? { ...g, uploading: true, progress: 0 } : g)));
      const blob = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = function () {
          resolve(xhr.response);
        };
        xhr.onerror = function (e) {
          reject(new TypeError("Network request failed"));
        };
        xhr.responseType = "blob";
        xhr.open("GET", item.localUri, true);
        xhr.send(null);
      }) as Blob;
      const filename = `${Date.now()}_${Math.floor(Math.random() * 1e6)}.jpg`;
      const path = `uploads/${userId}/${filename}`;
      const storageRef = ref(storage, path);
      
      const url = await uploadImage(storageRef, blob, undefined, (p) => {
        setGallery((prev) => prev.map((g, i) => (i === index ? { ...g, progress: p } : g)));
      }, path);
      setGallery((prev) => prev.map((g, i) => (i === index ? { ...g, url, uploading: false, progress: 100 } : g)));
    } catch (e) {
      setGallery((prev) => prev.map((g, i) => (i === index ? { ...g, uploading: false, progress: 0 } : g)));
      showAlert("Error", "No se pudo reintentar la subida.", "error");
    }
  }

  async function handleSubmit() {
    if (!user) {
      showAlert("Sesión requerida", "Iniciá sesión para publicar.", "info");
      return;
    }
    if (!brand || !model || !year || !price) {
      showAlert("Faltan datos", "Marca, modelo, año y precio son obligatorios.", "info");
      return;
    }
    if (!coverImage || coverUploading || gallery.some((g) => g.uploading)) {
      showAlert("Carga en proceso", "Esperá a que terminen de subir las fotos.", "info");
      return;
    }

    const yearNum = Number(year);
    const priceNum = Number(price);
    const kmNum = km ? Number(km) : 0;

    if (isNaN(yearNum) || isNaN(priceNum)) {
      showAlert("Datos inválidos", "Año y precio deben ser numéricos.", "error");
      return;
    }

    try {
      setLoading(true);

      await addDoc(collection(db, "vehicles"), {
        userId,
        userName,
        brand,
        model,
        version: version || null,
        year: yearNum,
        price: priceNum,
        currency,
        km: kmNum,
        fuelType: fuelType || null,
        gearbox: gearbox || null,
        doors: null,
        description: details || null,
        location: {
          province: province || null,
        },
        images: {
          cover: coverImage || "https://placehold.co/800x600?text=Auto",
          gallery: gallery.map((g) => g.url).filter(Boolean),
        },
        acceptsFinancing,
        financing: acceptsFinancing
          ? {
              rate: finRate ? Number(finRate) : 25,
              months: finMonths ? Number(finMonths) : 24,
            }
          : null,
        published: true,
        likedBy: [],
        flags: {
          forSale: true,
          tradeIn: true, // permuta
        },
        createdAt: serverTimestamp(),
      });

      showAlert("Éxito", "El auto se publicó correctamente.", "success", () => router.push("/(tabs)/mycars"));
    } catch (e: any) {
      // console.error(e);
      showAlert("Error", e.message ?? "No se pudo publicar el auto.", "error");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = !loading && !coverUploading && gallery.every((g) => !g.uploading) && !!brand && !!model && !!year && !!price;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}>
        {/* Main ScrollView */}
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
          scrollEventThrottle={16}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <TouchableOpacity onPress={() => { Keyboard.dismiss(); router.back(); }} activeOpacity={0.8} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name={"arrow-back" as any} size={22} color={theme.text} />
              <Text style={{ color: theme.text, fontWeight: "700" }}>Volver</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Keyboard.dismiss();
                showAlert(
                  "Cancelar publicación",
                  "¿Querés cancelar? Se perderán los cambios no guardados.",
                  "info",
                  () => {
                    try {
                        if ((router as any)?.canGoBack?.()) {
                          router.back();
                        } else {
                          router.replace("/" as any);
                        }
                      } catch {
                        router.replace("/" as any);
                      }
                  },
                  {
                    showCancel: true,
                    confirmText: "Sí, cancelar",
                    cancelText: "Seguir editando"
                  }
                );
              }}
              activeOpacity={0.8}
              style={{ backgroundColor: theme.badgeBackground, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <Text style={{ color: theme.text, fontWeight: "700" }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: theme.title, fontSize: 22, fontWeight: "800", marginBottom: 16 }}>Publicar nuevo auto</Text>

          {/* Sección: Datos del Vehículo */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: theme.accent, fontSize: 16, fontWeight: "700", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Datos del Vehículo</Text>
            
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: theme.text, marginBottom: 4, fontSize: 14 }}>Marca</Text>
              <TouchableOpacity onPress={async () => { Keyboard.dismiss(); await loadMakes(); setBrandOpen(true); }} style={{ borderRadius: 10, borderWidth: 1, borderColor: theme.likeBoxBackground, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.inputBackground }}>
                <Text style={{ color: theme.inputText, fontWeight: brand ? "700" : "400" }}>{brand || "Seleccionar marca"}</Text>
              </TouchableOpacity>
              <SelectionModal
                visible={brandOpen}
                title="Seleccionar Marca"
                options={makesRemote.length ? makesRemote : makes}
                onSelect={async (m) => {
                  setBrand(m);
                  setModel("");
                  setVersion("");
                  setVersionsRemote([]);
                  await loadModels(m);
                }}
                onClose={() => setBrandOpen(false)}
                value={brand}
                placeholder="Buscar marca"
                variant="inline"
              />
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: theme.text, marginBottom: 4, fontSize: 14 }}>Modelo</Text>
              <TouchableOpacity disabled={!brand} onPress={async () => { if (!brand) return; Keyboard.dismiss(); await loadModels(brand); setModelOpen(true); }} style={{ borderRadius: 10, borderWidth: 1, borderColor: theme.likeBoxBackground, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.inputBackground, opacity: brand ? 1 : 0.6 }}>
                <Text style={{ color: theme.inputText, fontWeight: model ? "700" : "400" }}>{model || (brand ? "Seleccionar modelo" : "Elegí primero una marca")}</Text>
              </TouchableOpacity>
              <SelectionModal
                visible={modelOpen}
                title="Seleccionar Modelo"
                options={modelOptions}
                onSelect={(mo) => {
                  setModel(mo);
                  setVersion("");
                  setVersionsRemote([]);
                }}
                onClose={() => setModelOpen(false)}
                value={model}
                placeholder="Buscar modelo"
                variant="inline"
              />
            </View>

            {versionsRemote.length > 0 ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ color: theme.text, marginBottom: 4, fontSize: 14 }}>Versión</Text>
                <TouchableOpacity disabled={!model} onPress={() => { Keyboard.dismiss(); setVersionOpen(true); }} style={{ borderRadius: 10, borderWidth: 1, borderColor: theme.likeBoxBackground, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.inputBackground, opacity: model ? 1 : 0.6 }}>
                  <Text style={{ color: theme.inputText, fontWeight: version ? "700" : "400" }}>{version || "Seleccionar versión"}</Text>
                </TouchableOpacity>
                <SelectionModal
                  visible={versionOpen}
                  title="Seleccionar Versión"
                  options={versionsRemote}
                  onSelect={(v) => setVersion(v)}
                  onClose={() => setVersionOpen(false)}
                  value={version}
                  placeholder="Buscar versión"
                  variant="inline"
                />
              </View>
            ) : (
              <Input
                label="Versión"
                value={version}
                onChangeText={setVersion}
                placeholder="Allure, Feline, etc."
              />
            )}

            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: theme.text, marginBottom: 4, fontSize: 14 }}>Año</Text>
              <TouchableOpacity onPress={() => { Keyboard.dismiss(); setYearOpen(true); }} style={{ borderRadius: 10, borderWidth: 1, borderColor: theme.likeBoxBackground, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.inputBackground }}>
                <Text style={{ color: theme.inputText, fontWeight: year ? "700" : "400" }}>{year || "Seleccionar año"}</Text>
              </TouchableOpacity>
              <SelectionModal
                visible={yearOpen}
                title="Seleccionar Año"
                options={yearOptions}
                onSelect={(yo) => setYear(yo)}
                onClose={() => setYearOpen(false)}
                value={year}
                placeholder="Buscar año"
                variant="inline"
              />
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: theme.text, marginBottom: 4, fontSize: 14 }}>Combustible</Text>
              <TouchableOpacity onPress={() => { Keyboard.dismiss(); setFuelOpen(true); }} style={{ borderRadius: 10, borderWidth: 1, borderColor: theme.likeBoxBackground, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.inputBackground }}>
                <Text style={{ color: theme.inputText, fontWeight: fuelType ? "700" : "400" }}>{fuelType || "Seleccionar"}</Text>
              </TouchableOpacity>
              <SelectionModal
                visible={fuelOpen}
                title="Seleccionar Combustible"
                options={["Nafta", "Diésel", "Híbrido", "Eléctrico", "GNC"]}
                onSelect={(fo) => setFuelType(fo)}
                onClose={() => setFuelOpen(false)}
                value={fuelType}
                searchable={false}
                variant="inline"
              />
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: theme.text, marginBottom: 4, fontSize: 14 }}>Caja</Text>
              <TouchableOpacity onPress={() => { Keyboard.dismiss(); setGearboxOpen(true); }} style={{ borderRadius: 10, borderWidth: 1, borderColor: theme.likeBoxBackground, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.inputBackground }}>
                <Text style={{ color: theme.inputText, fontWeight: gearbox ? "700" : "400" }}>{gearbox || "Seleccionar"}</Text>
              </TouchableOpacity>
              <SelectionModal
                visible={gearboxOpen}
                title="Seleccionar Caja"
                options={["Manual", "Automática"]}
                onSelect={(go) => setGearbox(go)}
                onClose={() => setGearboxOpen(false)}
                value={gearbox}
                searchable={false}
                variant="inline"
              />
            </View>

            <Input
              label="Kilómetros"
              value={km}
              onChangeText={setKm}
              keyboardType="number-pad"
              placeholder="35000"
            />

            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: theme.text, marginBottom: 4, fontSize: 14 }}>Detalles</Text>
              <TextInput
                value={details}
                onChangeText={setDetails}
                placeholder="Contá la historia y estado del auto, servicios, extras, etc."
                placeholderTextColor={theme.textMuted}
                inputAccessoryViewID="detailsInputAccessory"
                style={{
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: theme.likeBoxBackground,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: theme.inputText,
                  backgroundColor: theme.inputBackground,
                  minHeight: 120,
                  textAlignVertical: "top",
                }}
                multiline
              />
              {Platform.OS === "ios" && (
                <InputAccessoryView nativeID="detailsInputAccessory">
                  <View style={{ backgroundColor: theme.card, flexDirection: "row", justifyContent: "flex-end", padding: 8, borderTopWidth: 1, borderTopColor: theme.badgeBorder }}>
                    <Button onPress={() => Keyboard.dismiss()} title="Listo" />
                  </View>
                </InputAccessoryView>
              )}
            </View>
          </View>

          {/* Sección: Precio y Financiación */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: theme.accent, fontSize: 16, fontWeight: "700", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Precio y Financiación</Text>
            
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: theme.text, marginBottom: 4, fontSize: 14 }}>Precio y Moneda</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="number-pad"
                    placeholder="9500000"
                    placeholderTextColor={theme.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                    style={{
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: theme.likeBoxBackground,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: theme.inputText,
                      backgroundColor: theme.inputBackground,
                    }}
                  />
                </View>
                <View style={{ flexDirection: "row", backgroundColor: theme.inputBackground, borderRadius: 10, padding: 4, borderWidth: 1, borderColor: theme.likeBoxBackground }}>
                  <TouchableOpacity 
                    onPress={() => { Keyboard.dismiss(); setCurrency("ARS"); }}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: currency === "ARS" ? theme.accent : "transparent", justifyContent: "center" }}
                  >
                    <Text style={{ color: currency === "ARS" ? "#FFF" : theme.textMuted, fontWeight: "700" }}>ARS</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => { Keyboard.dismiss(); setCurrency("USD"); }}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: currency === "USD" ? theme.accent : "transparent", justifyContent: "center" }}
                  >
                    <Text style={{ color: currency === "USD" ? "#FFF" : theme.textMuted, fontWeight: "700" }}>USD</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: theme.text, marginBottom: 4, fontSize: 14 }}>Financiación</Text>
              <TouchableOpacity onPress={() => { Keyboard.dismiss(); setAcceptsFinancing((p) => !p); }} style={{ borderRadius: 999, borderWidth: 1, borderColor: theme.likeBoxBackground, paddingVertical: 10, alignItems: "center", backgroundColor: acceptsFinancing ? theme.buttonBackground : theme.badgeBackground }}>
                <Text style={{ color: acceptsFinancing ? theme.buttonText : theme.text, fontWeight: "700" }}>{acceptsFinancing ? "Financia" : "No financia"}</Text>
              </TouchableOpacity>
              {acceptsFinancing && (
                <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Tasa anual (%)"
                      value={finRate}
                      onChangeText={setFinRate}
                      keyboardType="number-pad"
                      placeholder="25"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Plazo (meses)"
                      value={finMonths}
                      onChangeText={setFinMonths}
                      keyboardType="number-pad"
                      placeholder="24"
                    />
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Sección: Ubicación y Fotos */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: theme.accent, fontSize: 16, fontWeight: "700", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Ubicación y Fotos</Text>
            
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: theme.text, marginBottom: 4, fontSize: 14 }}>Provincia</Text>
              <TouchableOpacity onPress={() => { Keyboard.dismiss(); setProvinceOpen(true); }} style={{ borderRadius: 999, borderWidth: 1, borderColor: province ? theme.buttonBackground : theme.likeBoxBackground, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: province ? theme.buttonBackground : theme.badgeBackground, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ color: province ? theme.buttonText : theme.text, fontWeight: "700" }}>{province || "Seleccionar provincia"}</Text>
              </TouchableOpacity>
              <SelectionModal
                visible={provinceOpen}
                title="Seleccionar Provincia"
                options={PROVINCES}
                onSelect={(p) => setProvince(p)}
                onClose={() => setProvinceOpen(false)}
                value={province}
                placeholder="Buscar provincia"
                variant="inline"
              />
            </View>



            <View style={{ marginTop: 12, marginBottom: 12 }}>
              <Text style={{ color: theme.text, marginBottom: 6, fontSize: 15, fontWeight: "600" }}>Fotos</Text>
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <TouchableOpacity
                  onPress={() => pickImageAndUpload("cover")}
                  disabled={coverUploading}
                  style={{
                    borderWidth: 1,
                    borderColor: coverUploading ? theme.textMuted : theme.likeBoxBackground,
                    backgroundColor: theme.inputBackground,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 10,
                  }}
                >
                  <Text style={{ color: theme.inputText }}>{coverUploading ? `Subiendo portada... ${coverProgress}%` : coverImage ? "Cambiar portada" : "Seleccionar portada"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => pickImageAndUpload("gallery")}
                  style={{
                    borderWidth: 1,
                    borderColor: theme.likeBoxBackground,
                    backgroundColor: theme.inputBackground,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 10,
                  }}
                >
                  <Text style={{ color: theme.inputText }}>Agregar a galería</Text>
                </TouchableOpacity>
              </View>
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>Galería: {gallery.length} / 8</Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {coverLocalUri ? (
                  <View style={{ width: 100, height: 70, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: theme.likeBoxBackground }}>
                    <View style={{ flex: 1, backgroundColor: theme.background }}>
                      {/* @ts-ignore */}
                      <Image
                        source={{ uri: coverLocalUri }}
                        style={{ width: "100%", height: "100%" }}
                        resizeMode="cover"
                      />
                    </View>
                  </View>
                ) : coverImage ? (
                  <View style={{ width: 100, height: 70, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: theme.likeBoxBackground }}>
                    <View style={{ flex: 1, backgroundColor: theme.background }}>
                      {/* @ts-ignore */}
                      <Image
                        source={{ uri: coverImage }}
                        style={{ width: "100%", height: "100%" }}
                        resizeMode="cover"
                      />
                    </View>
                  </View>
                ) : null}
                {gallery.map((g, idx) => (
                  <View key={`${g.localUri}-${idx}`} style={{ width: 100, height: 70, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: g.uploading ? theme.textMuted : theme.likeBoxBackground }}>
                    <View style={{ flex: 1, backgroundColor: theme.background, opacity: g.uploading ? 0.6 : 1 }}>
                      {/* @ts-ignore */}
                      <Image source={{ uri: g.localUri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                    </View>
                    {g.uploading && (
                      <View style={{ position: "absolute", bottom: 2, right: 4 }}>
                        <Text style={{ color: theme.text, fontSize: 10 }}>{g.progress ?? 0}%</Text>
                      </View>
                    )}
                    {!g.uploading && !g.url && (
                      <View style={{ position: "absolute", bottom: 2, right: 4 }}>
                        <TouchableOpacity onPress={() => retryGalleryUpload(idx)} style={{ backgroundColor: theme.accent, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 }}>
                          <Text style={{ color: theme.buttonText, fontSize: 10 }}>Reintentar</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </View>
          </View>



        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={{
            marginTop: 8,
            backgroundColor: !canSubmit ? theme.textMuted : theme.accent,
            borderRadius: 999,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: theme.buttonText,
              fontSize: 16,
              fontWeight: "700",
            }}
          >
            {!canSubmit ? "Completar datos y subir fotos" : loading ? "Publicando..." : "Publicar auto"}
          </Text>
        </TouchableOpacity>
        {process.env.EXPO_PUBLIC_ENABLE_CATALOG_UPLOAD === "1" && (
          <View style={{ marginTop: 8, alignItems: "flex-end" }}>
            <TouchableOpacity onPress={uploadCatalogToFirestore} style={{ backgroundColor: theme.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ color: theme.buttonText, fontWeight: "600" }}>Cargar catálogo (dev)</Text>
            </TouchableOpacity>
          </View>
        )}
        {!coverUploading && !coverImage && coverLocalUri ? (
          <View style={{ marginTop: 8, alignItems: "flex-end" }}>
            <TouchableOpacity
              onPress={async () => {
                try {
                  setCoverUploading(true);
                  setCoverProgress(0);
                  const base64 = await FileSystemLegacy.readAsStringAsync(coverLocalUri, { encoding: "base64" });
                  const filename = `${Date.now()}_${Math.floor(Math.random() * 1e6)}.jpg`;
                  const path = `uploads/${userId}/${filename}`;
                  const storageRef = ref(storage, path);
                  const url = await uploadWithRetry(storageRef, base64, (p) => setCoverProgress(p));
                  setCoverImage(url);
                } catch {}
                setCoverUploading(false);
              }}
              style={{ backgroundColor: theme.accent, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <Text style={{ color: theme.buttonText, fontWeight: "600" }}>Reintentar portada</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        
        
        </ScrollView>
      </KeyboardAvoidingView>
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        showCancel={alertConfig.showCancel}
        onCancel={alertConfig.onCancel}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        onClose={hideAlert}
      />
    </SafeAreaView>
  );
}
