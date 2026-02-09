// app/(screens)/add-car.tsx
import { CustomAlert } from "@/components/CustomAlert";
import { DownloadAppBanner } from "@/components/DownloadAppBanner";
import { SelectionModal } from "@/components/SelectionModal";
import { WebContainer } from "@/components/WebContainer";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db, storage, vertexAI } from "@/lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ResizeMode, Video } from "expo-av";
import Constants from "expo-constants";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { addDoc, arrayUnion, collection, doc, getCountFromServer, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes, uploadBytesResumable, uploadString } from "firebase/storage";
import { getGenerativeModel } from "firebase/vertexai";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardTypeOptions } from "react-native";
import {
    ActivityIndicator,
    Image,
    Keyboard,
    Platform,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CAR_MODELS_AR } from "../../config/carModelsAr";
type InputProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: KeyboardTypeOptions;
  placeholder?: string;
  error?: string;
  onBlur?: () => void;
};

const Input = ({
  label,
  value,
  onChangeText,
  keyboardType = "default",
  placeholder,
  error,
  onBlur,
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
        onBlur={onBlur}
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
                  borderColor: error ? theme.error || "#EF4444" : theme.likeBoxBackground,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: theme.inputText,
                  backgroundColor: theme.inputBackground,
                }}
              />
              {error && (
                <Text style={{ color: theme.error || "#EF4444", fontSize: 12, marginTop: 4 }}>
                  {error}
                </Text>
              )}
    </View>
  );
};

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

import { usePriceSuggestion } from "@/hooks/usePriceSuggestion";

export default function AddCarScreen() {
  const router = useRouter();
  const { user, profile, refreshTrustLevel } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <DownloadAppBanner message="Descargá la App para publicar tu auto" />
          <TouchableOpacity onPress={() => router.replace("/(tabs)")} style={{ marginTop: 20, padding: 10 }}>
              <Text style={{ color: theme.accent, fontSize: 16, fontWeight: '600' }}>Volver al inicio</Text>
          </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const userId = user?.uid || "anon";
  const userName = (profile?.firstName && profile?.lastName) 
    ? `${profile.firstName} ${profile.lastName}`
    : user?.displayName || user?.email || "Usuario";

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [version, setVersion] = useState("");
  const [year, setYear] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<"ARS" | "USD">("ARS");
  const [km, setKm] = useState("");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  const [citiesList, setCitiesList] = useState<string[]>([]);

  const [coverImage, setCoverImage] = useState("");
  const [coverLocalUri, setCoverLocalUri] = useState<string>("");
  const [coverUploading, setCoverUploading] = useState<boolean>(false);
  const [coverProgress, setCoverProgress] = useState<number>(0);

  const [videoUri, setVideoUri] = useState("");
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);

  const [gallery, setGallery] = useState<{ localUri: string; base64?: string; url?: string; uploading: boolean; progress?: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  
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
  const [finInitialPercent, setFinInitialPercent] = useState("");
  
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateField = (field: string, value: string) => {
    let error = "";
    switch (field) {
      case "price":
        if (!value) error = "El precio es obligatorio.";
        else if (isNaN(Number(value)) || Number(value) <= 0) error = "Precio inválido.";
        break;
      case "km":
        if (value && (isNaN(Number(value)) || Number(value) < 0)) error = "Kilometraje inválido.";
        break;
      case "finRate":
         if (acceptsFinancing && (!value || isNaN(Number(value)))) error = "Tasa inválida.";
         break;
      case "finMonths":
         if (acceptsFinancing && (!value || isNaN(Number(value)))) error = "Plazo inválido.";
         break;
      case "finInitialPercent":
         if (acceptsFinancing && (!value || isNaN(Number(value)))) error = "Porcentaje inválido.";
         break;
    }
    
    setErrors(prev => {
        const next = { ...prev };
        if (error) next[field] = error;
        else delete next[field];
        return next;
    });
    return !error;
  };
  
  // History fields
  const [singleOwner, setSingleOwner] = useState(false);
  const [serviceRecords, setServiceRecords] = useState(false);
  const [vtvValid, setVtvValid] = useState(false);
  const [papersUpToDate, setPapersUpToDate] = useState(false);
  const [warranty, setWarranty] = useState(false);

  const [details, setDetails] = useState("");
  
  // New fields
  const [sellingReason, setSellingReason] = useState("");
  const [sellingReasonOpen, setSellingReasonOpen] = useState(false);
  const [negotiablePrice, setNegotiablePrice] = useState(false);
  const [immediateDelivery, setImmediateDelivery] = useState(false);
  const [acceptsTradeIn, setAcceptsTradeIn] = useState(true); // Default true based on previous logic
  const priceSuggestion = usePriceSuggestion(brand, model, year, currency);

  // Draft System
  const DRAFT_KEY = `@add_car_draft_${user?.uid || "anon"}`;
  const isRestoring = useRef(false);
  
  // Load draft on mount
  useEffect(() => {
    const checkDraft = async () => {
        try {
            const savedDraft = await AsyncStorage.getItem(DRAFT_KEY);
            if (savedDraft) {
                const draft = JSON.parse(savedDraft);
                // Basic validation to ensure draft isn't empty
                if (!draft.brand && !draft.coverLocalUri) {
                   await AsyncStorage.removeItem(DRAFT_KEY);
                   return;
                }

                showAlert(
                    "Borrador encontrado",
                    "Tenés una publicación sin terminar. ¿Querés continuarla?",
                    "info",
                    {
                        showCancel: true,
                        confirmText: "Continuar",
                        cancelText: "Descartar",
                        onConfirm: () => {
                            console.log("Restoring draft for user:", user?.uid);
                            isRestoring.current = true;
                            
                            // Restore all fields
                            setBrand(draft.brand || "");
                            setModel(draft.model || "");
                            setVersion(draft.version || "");
                            setYear(draft.year || "");
                            setPrice(draft.price || "");
                            setCurrency(draft.currency || "ARS");
                            setKm(draft.km || "");
                            setProvince(draft.province || "");
                            setCity(draft.city || "");
                            setCoverImage(draft.coverImage || "");
                            setCoverLocalUri(draft.coverLocalUri || "");
                            setGallery(draft.gallery || []);
                            setFuelType(draft.fuelType || "");
                            setGearbox(draft.gearbox || "");
                            setAcceptsFinancing(draft.acceptsFinancing || false);
                            setFinRate(draft.finRate || "");
                            setFinMonths(draft.finMonths || "");
                            setFinInitialPercent(draft.finInitialPercent || "");
                            setSingleOwner(draft.singleOwner || false);
                            setServiceRecords(draft.serviceRecords || false);
                            setVtvValid(draft.vtvValid || false);
                            setPapersUpToDate(draft.papersUpToDate || false);
                            setWarranty(draft.warranty || false);
                            setDetails(draft.details || "");
                            setSellingReason(draft.sellingReason || "");
                            setNegotiablePrice(draft.negotiablePrice || false);
                            setImmediateDelivery(draft.immediateDelivery || false);
                            setAcceptsTradeIn(draft.acceptsTradeIn ?? true);
                            setVideoUri(draft.videoUri || "");
                            
                            // Load dependent lists if needed
                            if (draft.brand) loadModels(draft.brand);
                            
                            // Allow auto-save again after state settles
                            setTimeout(() => {
                                isRestoring.current = false;
                            }, 2000);
                        },
                        onCancel: async () => {
                            console.log("Discarding draft...");
                            try {
                                await AsyncStorage.removeItem(DRAFT_KEY);
                                // Force UI update/reset if needed, though state is already empty
                                showAlert("Borrador eliminado", "Se ha descartado el borrador anterior.", "info");
                            } catch (e) {
                                console.error("Error discarding draft:", e);
                            }
                        }
                    }
                );
            }
        } catch (e) {
            console.error("Error reading draft", e);
        }
    };
    checkDraft();
  }, [user?.uid]);

  // Auto-save draft
  useEffect(() => {
    if (loading || isRestoring.current) return; // Don't save while publishing or restoring
    
    // Only save if at least brand is selected to avoid empty drafts on initial load
    if (!brand && !coverLocalUri) return;

    const saveDraft = async () => {
        const draftData = {
            brand, model, version, year, price, currency, km, province, city,
            coverImage, coverLocalUri, gallery, fuelType, gearbox,
            acceptsFinancing, finRate, finMonths, finInitialPercent,
            singleOwner, serviceRecords, vtvValid, papersUpToDate, warranty,
            details, sellingReason, negotiablePrice, immediateDelivery, acceptsTradeIn,
            videoUri
        };
        try {
            await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
        } catch (e) {
            console.error("Error saving draft", e);
        }
    };
    
    const timeout = setTimeout(saveDraft, 1000); // Debounce 1s
    return () => clearTimeout(timeout);
  }, [
    brand, model, version, year, price, currency, km, province, city,
    coverImage, coverLocalUri, gallery, fuelType, gearbox,
    acceptsFinancing, finRate, finMonths, finInitialPercent,
    singleOwner, serviceRecords, vtvValid, papersUpToDate, warranty,
    details, sellingReason, negotiablePrice, immediateDelivery, acceptsTradeIn,
    videoUri
  ]);

  // Clear draft on success (called in handlePublish)
  const clearDraft = async () => {
    try {
        await AsyncStorage.removeItem(DRAFT_KEY);
    } catch (e) {
        console.error("Error clearing draft", e);
    }
  };

  const priceRef = useRef<TextInput>(null);
  const MODELS_AR: CarArItem[] = useMemo(() => Array.isArray(CAR_MODELS_AR) ? CAR_MODELS_AR : [], []);

  const [successAction, setSuccessAction] = useState<(() => void) | null>(null);
  const [alertConfig, setAlertConfig] = useState<{ 
    visible: boolean; 
    title: string; 
    message: string; 
    type: "error" | "success" | "info";
    showCancel?: boolean;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  }>({ visible: false, title: "", message: "", type: "info" });
  
  const showAlert = (
    title: string, 
    message: string, 
    type: "error" | "success" | "info", 
    arg4?: { 
        showCancel?: boolean, 
        confirmText?: string, 
        cancelText?: string, 
        onConfirm?: () => void, 
        onCancel?: () => void 
    } | (() => void),
    arg5?: {
        showCancel?: boolean, 
        confirmText?: string, 
        cancelText?: string, 
        onConfirm?: () => void, 
        onCancel?: () => void 
    }
  ) => {
    let onConfirm: (() => void) | undefined;
    let options: any = {};

    if (typeof arg4 === 'function') {
        onConfirm = arg4;
        if (arg5 && typeof arg5 === 'object') {
            options = arg5;
        }
    } else if (arg4 && typeof arg4 === 'object') {
        options = arg4;
        onConfirm = options.onConfirm;
    }

    setAlertConfig({ 
        visible: true, 
        title, 
        message, 
        type, 
        showCancel: options?.showCancel, 
        confirmText: options?.confirmText, 
        cancelText: options?.cancelText, 
        onConfirm: onConfirm, 
        onCancel: options?.onCancel 
    });
  };

  const handleConfirm = () => {
      setAlertConfig(prev => ({ ...prev, visible: false }));
      if (alertConfig.onConfirm) alertConfig.onConfirm();
      else if (successAction) successAction();
  };

  const handleCancel = () => {
      setAlertConfig(prev => ({ ...prev, visible: false }));
      if (alertConfig.onCancel) alertConfig.onCancel();
  };

  // Levenshtein distance for fuzzy matching
  const levenshteinDistance = (a: string, b: string): number => {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = [];

    for (let i = 0; i <= m; i++) dp[i] = [i];
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j - 1] + 1, // substitution
            dp[i][j - 1] + 1,     // insertion
            dp[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    return dp[m][n];
  };

  const checkSimilarity = (input: string, existingList: string[]): string | null => {
    const normalizedInput = input.trim().toLowerCase();
    
    // Exact match check
    if (existingList.some(item => item.toLowerCase() === normalizedInput)) {
      return null; 
    }

    let bestMatch: string | null = null;
    let minDistance = Infinity;

    for (const item of existingList) {
      const normalizedItem = item.toLowerCase();
      const dist = levenshteinDistance(normalizedInput, normalizedItem);
      
      // Similarity rules:
      // If length > 3 and <= 6, distance <= 1
      // If length > 6, distance <= 2
      const isSimilar = (normalizedInput.length > 3 && normalizedInput.length <= 6 && dist <= 1) ||
                        (normalizedInput.length > 6 && dist <= 2);

      if (isSimilar && dist < minDistance) {
        minDistance = dist;
        bestMatch = item;
      }
    }
    return bestMatch;
  };

  const handleSelectionWithValidation = (
    value: string, 
    existingOptions: string[], 
    onConfirm: (val: string) => void,
    label: string
  ) => {
    // Exact match check (case insensitive)
    const exactMatch = existingOptions.find(opt => opt.toLowerCase() === value.toLowerCase());
    if (exactMatch) {
      onConfirm(exactMatch);
      return;
    }

    // Similarity check
    const similar = checkSimilarity(value, existingOptions);
    if (similar) {
      showAlert(
        "Posible duplicado",
        `"${value}" es muy similar a "${similar}". ¿Quisiste decir "${similar}"?`,
        "info",
        () => onConfirm(similar), // User accepts suggestion
        {
          showCancel: true,
          confirmText: `Usar ${similar}`,
          cancelText: `No, es nuevo`,
          onCancel: () => onConfirm(value) // User insists on new value
        }
      );
    } else {
      // New value
      onConfirm(value);
    }
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
      (async () => {
        try {
          const docRef = doc(db, "catalog", "default", "makes", brand, "models", model);
          const snap = await getDoc(docRef);
          
          if (snap.exists()) {
            const item = snap.data() as any;
            if (item?.versions && Array.isArray(item.versions) && item.versions.length > 0) {
              console.log("Remote item found:", item);
              setVersionsRemote(item.versions);
              return;
            }
          }
          
          // Fallback to local if remote not found or empty
          const item = MODELS_AR.find((x) => x.make === brand && x.model === model);
          setVersionsRemote(item?.versions || []);
        } catch (e) {
          console.error("Error loading versions:", e);
          const item = MODELS_AR.find((x) => x.make === brand && x.model === model);
          setVersionsRemote(item?.versions || []);
        }
      })();
    } else {
      setVersionsRemote([]);
    }
  }, [brand, model, MODELS_AR]);

  useEffect(() => {
    const fetchCities = async () => {
      if (!province) {
        setCitiesList([]);
        return;
      }

      // 1. Defaults
      const defaults = CITY_OPTIONS_BY_PROVINCE[province] || [];

      // 2. Firestore
      try {
        const docRef = doc(db, "catalog", "default", "provinces", province);
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
        console.log("Error fetching cities for province:", province, e);
        setCitiesList(defaults.sort());
      }
    };
    fetchCities();
  }, [province]);

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

  const makes: string[] = MODELS_AR.length
    ? Array.from(new Set(MODELS_AR.map((x) => x.make))).sort()
    : DEFAULT_MAKES;

  const brandOptions = useMemo(() => {
    const combined = new Set([...makes, ...makesRemote]);
    return Array.from(combined).sort();
  }, [makes, makesRemote]);

  const modelsByMake: Record<string, string[]> = useMemo(() => MODELS_AR.length ? MODELS_AR.reduce((acc, item) => {
    const list = acc[item.make] || [];
    if (!list.includes(item.model)) list.push(item.model);
    acc[item.make] = list;
    return acc;
  }, {} as Record<string, string[]>) : DEFAULT_MODELS_BY_MAKE, [MODELS_AR]);

  const modelOptions = useMemo(() => {
    const local = modelsByMake[brand] || [];
    const combined = new Set([...local, ...modelsRemote]);
    return Array.from(combined).sort();
  }, [brand, modelsByMake, modelsRemote]);
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

  const CITY_OPTIONS_BY_PROVINCE: Record<string, string[]> = {
    "Buenos Aires": ["La Plata", "Mar del Plata", "Bahía Blanca", "Quilmes", "Morón", "Tandil", "San Isidro", "Pilar", "Tigre", "Vicente López"],
    "CABA": ["Palermo", "Recoleta", "Belgrano", "Caballito", "Flores", "Mataderos", "Villa Urquiza", "Devoto"],
    "Córdoba": ["Córdoba", "Villa Carlos Paz", "Río Cuarto", "Alta Gracia", "Villa María"],
    "Santa Fe": ["Rosario", "Santa Fe", "Rafaela", "Venado Tuerto"],
    "Mendoza": ["Mendoza", "Godoy Cruz", "Guaymallén", "San Rafael"],
    "Tucumán": ["San Miguel de Tucumán", "Yerba Buena", "Tafí Viejo"],
    "Salta": ["Salta", "San Lorenzo", "Tartagal"],
    "Neuquén": ["Neuquén", "Plottier", "Centenario"],
    "Río Negro": ["Bariloche", "General Roca", "Cipolletti"],
    "Chubut": ["Comodoro Rivadavia", "Trelew", "Puerto Madryn"],
  };

  

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
    storagePath?: string,
    contentType: string = "image/jpeg"
  ) => {
    if (blob) {
      try {
        console.log("Starting uploadBytesResumable to:", storageRef.fullPath);
        // Forzamos un objeto Blob nuevo para evitar problemas de tipos
        const cleanBlob = blob; // En Expo el blob ya viene bien del XHR
        const task = uploadBytesResumable(storageRef, cleanBlob, { contentType });
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
            await uploadBytes(storageRef, blob, { contentType });
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
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const rnStorage = require("@react-native-firebase/storage").default;
          if (rnStorage && storagePath) {
            const nativeRef = rnStorage().ref(storagePath);
            const task = nativeRef.putString(base64, "base64", { contentType });
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
      const dataUrl = `data:${contentType};base64,${base64}`;
      await uploadString(storageRef, dataUrl, "data_url");
      const url = await getDownloadURL(storageRef);
      if (onProgress) onProgress(100);
      return url;
    }
    if (!blob) throw new Error("No image content provided");
    const task = uploadBytesResumable(storageRef, blob, { contentType });
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
      mediaTypes: ['images'],
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
      // Optimization: Resize to max 1024px and compress to 0.7
      const manipulated = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: 1024 } }], {
        compress: 0.7,
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
      } catch {
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
    } catch {
      setGallery((prev) => prev.map((g, i) => (i === index ? { ...g, uploading: false, progress: 0 } : g)));
      showAlert("Error", "No se pudo reintentar la subida.", "error");
    }
  }

  const removeCoverImage = () => {
    setCoverImage("");
    setCoverLocalUri("");
    setCoverProgress(0);
  };

  const removeGalleryImage = (index: number) => {
    setGallery((prev) => prev.filter((_, i) => i !== index));
  };

  async function pickVideoAndUpload() {
    if (!user) return;
    
    // Check Plan
    const plan = profile?.plan as string | undefined;
    const isPro = plan?.includes('pro');
    if (!isPro) {
        showAlert("Función Premium", "El video walkaround es exclusivo para usuarios PRO. Suscribite para desbloquearlo.", "info", () => router.push("/(screens)/subscribe"));
        return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert("Permiso requerido", "Necesitamos acceso a tu galería.", "info");
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 1, // Ignored for videos in some versions, but good practice
      videoQuality: 1, // Medium quality (0=low, 1=medium, 2=high) - Reduces file size significantly
      allowsMultipleSelection: false,
    });

    if (res.canceled || !res.assets?.[0]?.uri) return;

    const asset = res.assets[0];
    
    // Check duration (limit to 60s for example) if possible, or size
    if (asset.duration && asset.duration > 60000) {
        showAlert("Video muy largo", "El video no puede durar más de 60 segundos.", "info");
        return;
    }

    setVideoUploading(true);
    setVideoProgress(0);

    try {
        let finalUri = asset.uri;

        // Handle iOS ph:// assets (ensure we have a file:// URI)
        if (Platform.OS === 'ios' && (finalUri.startsWith('ph://') || finalUri.startsWith('assets-library://'))) {
             try {
                 const cacheDir = FileSystemLegacy.cacheDirectory + 'video_temp/';
                 const dirInfo = await FileSystemLegacy.getInfoAsync(cacheDir);
                 if (!dirInfo.exists) {
                     await FileSystemLegacy.makeDirectoryAsync(cacheDir, { intermediates: true });
                 }
                 const tempUri = cacheDir + `${Date.now()}.mp4`;
                 await FileSystemLegacy.copyAsync({ from: finalUri, to: tempUri });
                 finalUri = tempUri;
             } catch (err) {
                 console.log("Error handling iOS video asset:", err);
             }
        }

        const blob = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.onload = function () {
              resolve(xhr.response);
            };
            xhr.onerror = function (e) {
              reject(new TypeError("Network request failed"));
            };
            xhr.responseType = "blob";
            xhr.open("GET", finalUri, true);
            xhr.send(null);
        }) as Blob;

        const filename = `${Date.now()}_video.mp4`;
        const path = `uploads/${userId}/videos/${filename}`;
        const storageRef = ref(storage, path);

        const url = await uploadImage(
            storageRef,
            blob,
            undefined,
            (p) => setVideoProgress(p),
            path,
            "video/mp4"
        );
        setVideoUri(url);
    } catch (e: any) {
        console.error("Upload video error", e);
        showAlert("Error", "No se pudo subir el video.", "error");
    } finally {
        setVideoUploading(false);
    }
  }

  const removeVideo = () => {
      setVideoUri("");
      setVideoProgress(0);
  };

  async function handleSubmit() {
    if (!user) {
      showAlert("Sesión requerida", "Iniciá sesión para publicar.", "info");
      return;
    }

    // Verificar límite para usuarios GRATUITOS
    if (!profile?.plan || profile.plan === 'free') {
      try {
        const q = query(collection(db, "vehicles"), where("userId", "==", userId));
        const snapshot = await getCountFromServer(q);
        const count = snapshot.data().count;
        if (count >= 2) {
          showAlert(
            "Límite alcanzado", 
            "Tu plan gratuito solo permite 2 autos. Pasate a PRO para ilimitados.", 
            "info",
            () => router.push("/(screens)/subscribe")
          );
          return;
        }
      } catch (e) {
        console.error("Error checking limit", e);
        // Fail open (allow posting if check fails)
      }
    }

    if (!brand || !model || !year || !price) {
      showAlert("Faltan datos", "Marca, modelo, año y precio son obligatorios.", "info");
      return;
    }

    // Validar campos con errores
    const pValid = validateField('price', price);
    const kValid = validateField('km', km);
    let fValid = true;
    if (acceptsFinancing) {
        const f1 = validateField('finRate', finRate);
        const f2 = validateField('finMonths', finMonths);
        const f3 = validateField('finInitialPercent', finInitialPercent);
        fValid = f1 && f2 && f3;
    }

    if (!pValid || !kValid || !fValid) {
        showAlert("Datos inválidos", "Por favor, revisá los campos en rojo.", "error");
        return;
    }

    if (!coverImage || coverUploading || gallery.some((g) => g.uploading)) {
      showAlert("Carga en proceso", "Esperá a que terminen de subir las fotos.", "info");
      return;
    }

    const yearNum = Number(year);
    const priceNum = Number(price);
    const kmNum = km ? Number(km) : 0;

    try {
      setLoading(true);

      await addDoc(collection(db, "vehicles"), {
        userId,
        userName,
        userPlan: profile?.plan || 'free',
        sellerTrustLevel: profile?.trustLevel || "new", // Added Trust Level Denormalization
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
        
        // Historial
        singleOwner,
        serviceRecords,
        vtvValid,
        papersUpToDate,
        warranty,

        location: {
          province: province || null,
          city: city || null,
        },
        images: {
          cover: coverImage || "https://placehold.co/800x600?text=Auto",
          gallery: gallery.map((g) => g.url).filter(Boolean),
        },
        video: videoUri || null,
        acceptsFinancing,
        negotiablePrice,
        immediateDelivery,
        sellingReason: sellingReason || null,
        originalPrice: priceNum, // Inicialmente igual al precio actual
        updatedAt: serverTimestamp(),
        financing: acceptsFinancing
          ? {
              rate: finRate ? Number(finRate) : 25,
              months: finMonths ? Number(finMonths) : 24,
              initialPercent: finInitialPercent ? Number(finInitialPercent) : 0,
            }
          : null,
        published: false,
        status: "pending", // Moderation queue
        likedBy: [],
        isFeatured: profile?.plan?.includes('pro_dealer') || false,
        featuredAt: profile?.plan?.includes('pro_dealer') ? serverTimestamp() : null,
        views: 0,
        likesCount: 0,
        flags: {
          forSale: true,
          tradeIn: acceptsTradeIn,
        },
        createdAt: serverTimestamp(),
      });

      // Update catalog with new values if they don't exist
      try {
        console.log("Updating catalog with:", { brand, model, version });
        
        // 1. Ensure Make exists
        const brandRef = doc(db, "catalog", "default", "makes", brand);
        await setDoc(brandRef, { name: brand }, { merge: true });

        // 2. Ensure Model exists under Make
        const modelRef = doc(db, "catalog", "default", "makes", brand, "models", model);
        await setDoc(modelRef, { name: model }, { merge: true });

        // 3. Add Version to Model's versions array
        if (version) {
             await setDoc(modelRef, { versions: arrayUnion(version) }, { merge: true });
        }

        // 4. Update Province/City
        if (province && city) {
          try {
             const provRef = doc(db, "catalog", "default", "provinces", province);
             await setDoc(provRef, { 
                name: province,
                cities: arrayUnion(city) 
             }, { merge: true });
          } catch (e: any) {
             if (e.code !== 'permission-denied') {
                 console.error("Error updating province cities:", e);
             }
          }
        }
        console.log("Catalog updated successfully");
      } catch (e) {
        console.error("Error updating catalog:", e);
      }

      // Actualizar nivel de confianza del usuario (por si pasa de Nuevo a Activo)
      await refreshTrustLevel();
      await clearDraft();
      
      showAlert("Publicación Pendiente", "Tu auto ha sido enviado a moderación. Te avisaremos cuando sea aprobado.", "success", () => router.push("/(tabs)/mycars"));
    } catch (e: any) {
      // console.error(e);
      showAlert("Error", e.message ?? "No se pudo publicar el auto.", "error");
    } finally {
      setLoading(false);
    }
  }

  const generateDescription = async () => {
    if (!brand || !model || !year || !km) {
      showAlert("Faltan datos", "Completá marca, modelo, año y kilómetros para generar una descripción.", "info");
      return;
    }

    setLoadingAI(true);
    try {
      const fuel = fuelType ? `motor ${fuelType.toLowerCase()}` : "";
      const gear = gearbox ? `caja ${gearbox.toLowerCase()}` : "";
      const extras = [
        singleOwner ? "único dueño" : "",
        serviceRecords ? "services oficiales" : "",
        vtvValid ? "VTV al día" : "",
        papersUpToDate ? "papeles al día" : "",
        warranty ? "en garantía" : "",
        acceptsFinancing ? "acepta financiación" : "",
      ].filter(Boolean).join(", ");

      const prompt = `
        Actúa como un vendedor de autos experto. Escribe una descripción de venta atractiva y profesional para este vehículo, usando español de Argentina.
        
        Datos del auto:
        - Marca: ${brand}
        - Modelo: ${model} ${version || ""}
        - Año: ${year}
        - Kilómetros: ${Number(km).toLocaleString("es-AR")} km
        - Ubicación: ${city ? city + ", " : ""}${province || ""}
        - Precio: ${currency} ${Number(price).toLocaleString("es-AR")}
        ${fuel ? `- ${fuel}` : ""}
        ${gear ? `- ${gear}` : ""}
        ${extras ? `- Destacados: ${extras}` : ""}
        
        Instrucciones:
        1. Sé persuasivo pero honesto.
        2. Resalta los puntos fuertes (km, estado, documentación).
        3. Usa un tono cercano pero profesional.
        4. No pongas títulos como "Descripción:" ni saludos iniciales.
        5. Máximo 2 párrafos cortos.
      `;

      const modelAI = getGenerativeModel(vertexAI, { model: "gemini-1.5-flash" });
      const result = await modelAI.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      
      setDetails(text.trim());
    } catch (error: any) {
      console.error("Error generando descripción con IA:", error);
      const msg = error.message || (typeof error === 'string' ? error : "Intenta nuevamente.");
      showAlert("Error", `No se pudo generar la descripción. ${msg}`, "error");
    } finally {
      setLoadingAI(false);
    }
  };

  const canSubmit = !loading && !coverUploading && gallery.every((g) => !g.uploading) && !!brand && !!model && !!year && !!price;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <WebContainer>
        <KeyboardAwareScrollView 
          style={{ flex: 1 }} 
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          enableOnAndroid={true}
          extraScrollHeight={Platform.OS === "ios" ? 100 : 0}
          enableAutomaticScroll={true}
          keyboardDismissMode="on-drag"
        >
            {Platform.OS === ('web' as any) && (
              <View style={{ marginBottom: 16 }}>
                <DownloadAppBanner message="Descargá la App para publicar más fácil y subir fotos desde tu celular" />
              </View>
            )}
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
              <TouchableOpacity onPress={() => { Keyboard.dismiss(); setBrandOpen(true); loadMakes(); }} style={{ borderRadius: 10, borderWidth: 1, borderColor: theme.likeBoxBackground, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.inputBackground }}>
                <Text style={{ color: theme.inputText, fontWeight: brand ? "700" : "400" }}>{brand || "Seleccionar marca"}</Text>
              </TouchableOpacity>
              <SelectionModal
                visible={brandOpen}
                title="Seleccionar Marca"
                options={brandOptions}
                onSelect={(m) => {
                  handleSelectionWithValidation(m, brandOptions, async (validVal) => {
                    setBrand(validVal);
                    setModel("");
                    setVersion("");
                    setVersionsRemote([]);
                    await loadModels(validVal);
                  }, "Marca");
                }}
                onClose={() => setBrandOpen(false)}
                value={brand}
                placeholder="Buscar marca"
                variant="inline"
                allowAdd={true}
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
                allowAdd={true}
              />
            </View>

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
                  allowAdd={true}
                />
            </View>

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
              onChangeText={(t) => { setKm(t); if(errors.km) validateField("km", t); }}
              onBlur={() => validateField("km", km)}
              error={errors.km}
              keyboardType="number-pad"
              placeholder="35000"
            />

            <View style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <Text style={{ color: theme.text, fontSize: 14 }}>Detalles</Text>
                <TouchableOpacity 
                    onPress={generateDescription}
                    disabled={loadingAI}
                    style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.accent + "20", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}
                >
                    {loadingAI ? (
                        <ActivityIndicator size="small" color={theme.accent} />
                    ) : (
                        <Ionicons name="sparkles" size={12} color={theme.accent} />
                    )}
                    <Text style={{ color: theme.accent, fontSize: 10, fontWeight: "700" }}>
                        {loadingAI ? "Generando..." : "Generar con IA"}
                    </Text>
                </TouchableOpacity>
              </View>
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
                blurOnSubmit={true}
                returnKeyType="next"
                onSubmitEditing={() => {
                   priceRef.current?.focus();
                }}
              />
              {/* InputAccessoryView removed to prevent black bar issue */}
            </View>
          </View>

          {/* Sección: Historial y Documentación */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: theme.accent, fontSize: 16, fontWeight: "700", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Historial y Documentación</Text>
            {[
              { label: "Único dueño", value: singleOwner, setter: setSingleOwner },
              { label: "Service oficiales", value: serviceRecords, setter: setServiceRecords },
              { label: "VTV al día", value: vtvValid, setter: setVtvValid },
              { label: "Papeles al día", value: papersUpToDate, setter: setPapersUpToDate },
              { label: "En garantía", value: warranty, setter: setWarranty },
            ].map((item, idx) => (
              <TouchableOpacity 
                key={idx}
                activeOpacity={0.8}
                onPress={() => item.setter(!item.value)}
                style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}
              >
                <Ionicons 
                  name={(item.value ? "checkbox" : "square-outline") as any} 
                  size={24} 
                  color={item.value ? theme.accent : theme.textMuted} 
                />
                <Text style={{ color: theme.text, marginLeft: 10, fontSize: 16 }}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Sección: Precio y Financiación */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: theme.accent, fontSize: 16, fontWeight: "700", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Precio y Financiación</Text>
            
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: theme.text, marginBottom: 4, fontSize: 14 }}>Precio y Moneda</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    ref={priceRef}
                    value={price ? Number(price).toLocaleString("es-AR") : ""}
                    onChangeText={(t) => { 
                        const raw = t.replace(/\D/g, "");
                        setPrice(raw); 
                        if(errors.price) validateField("price", raw); 
                    }}
                    onBlur={() => validateField("price", price)}
                    keyboardType="number-pad"
                    placeholder="9.500.000"
                    placeholderTextColor={theme.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                    style={{
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: errors.price ? theme.error || "#EF4444" : theme.likeBoxBackground,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: theme.inputText,
                      backgroundColor: theme.inputBackground,
                    }}
                  />
                  {errors.price && (
                    <Text style={{ color: theme.error || "#EF4444", fontSize: 12, marginTop: 4 }}>
                        {errors.price}
                    </Text>
                  )}
                </View>
                <View style={{ flexDirection: "row", backgroundColor: theme.inputBackground, borderRadius: 10, padding: 4, borderWidth: 1, borderColor: theme.likeBoxBackground }}>
                  <TouchableOpacity 
                    onPress={() => setCurrency("ARS")}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: currency === "ARS" ? theme.accent : "transparent", justifyContent: "center" }}
                  >
                    <Text style={{ color: currency === "ARS" ? "#FFF" : theme.textMuted, fontWeight: "700" }}>ARS</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => setCurrency("USD")}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: currency === "USD" ? theme.accent : "transparent", justifyContent: "center" }}
                  >
                    <Text style={{ color: currency === "USD" ? "#FFF" : theme.textMuted, fontWeight: "700" }}>USD</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {priceSuggestion.loading && brand && model && year && (
                 <Text style={{ marginTop: 4, color: theme.textMuted, fontSize: 12, fontStyle: 'italic' }}>Calculando precio sugerido...</Text>
              )}
              {priceSuggestion.count > 0 && !priceSuggestion.loading && (
                <TouchableOpacity 
                    onPress={() => setPrice(Math.round(priceSuggestion.avg).toString())}
                    style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.accent }}
                >
                    <Ionicons name="bulb-outline" size={16} color={theme.accent} style={{ marginRight: 6 }} />
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>
                            Precio sugerido: {currency} {Math.round(priceSuggestion.avg).toLocaleString("es-AR")}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 10 }}>
                            Basado en {priceSuggestion.count} publicaciones similares (Min: {priceSuggestion.min.toLocaleString()} - Max: {priceSuggestion.max.toLocaleString()})
                        </Text>
                    </View>
                </TouchableOpacity>
              )}
            </View>

            <View style={{ marginBottom: 12 }}>
                <Text style={{ color: theme.text, marginBottom: 4, fontSize: 14 }}>Motivo de venta (Opcional)</Text>
                <TouchableOpacity onPress={() => { Keyboard.dismiss(); setSellingReasonOpen(true); }} style={{ borderRadius: 10, borderWidth: 1, borderColor: theme.likeBoxBackground, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.inputBackground }}>
                  <Text style={{ color: theme.inputText, fontWeight: sellingReason ? "700" : "400" }}>{sellingReason || "Seleccionar motivo"}</Text>
                </TouchableOpacity>
                <SelectionModal
                  visible={sellingReasonOpen}
                  title="Seleccionar Motivo de venta"
                  options={["Cambio de auto", "Necesidad económica", "Poco uso", "Urgente", "Otro"]}
                  onSelect={(reason) => setSellingReason(reason)}
                  onClose={() => setSellingReasonOpen(false)}
                  value={sellingReason}
                  searchable={false}
                  variant="inline"
                />
            </View>

            <View style={{ marginBottom: 12 }}>
                <Text style={{ color: theme.text, marginBottom: 8, fontSize: 14 }}>Flexibilidad de Venta</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    <TouchableOpacity onPress={() => setNegotiablePrice(!negotiablePrice)} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: negotiablePrice ? theme.accent : theme.likeBoxBackground, backgroundColor: negotiablePrice ? theme.accent + "20" : theme.inputBackground }}>
                        <Ionicons name={negotiablePrice ? "checkmark-circle" : "ellipse-outline"} size={18} color={negotiablePrice ? theme.accent : theme.textMuted} />
                        <Text style={{ marginLeft: 6, color: theme.text, fontSize: 13, fontWeight: negotiablePrice ? "600" : "400" }}>Precio conversable</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setAcceptsTradeIn(!acceptsTradeIn)} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: acceptsTradeIn ? theme.accent : theme.likeBoxBackground, backgroundColor: acceptsTradeIn ? theme.accent + "20" : theme.inputBackground }}>
                        <Ionicons name={acceptsTradeIn ? "checkmark-circle" : "ellipse-outline"} size={18} color={acceptsTradeIn ? theme.accent : theme.textMuted} />
                        <Text style={{ marginLeft: 6, color: theme.text, fontSize: 13, fontWeight: acceptsTradeIn ? "600" : "400" }}>Acepta permuta</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setImmediateDelivery(!immediateDelivery)} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: immediateDelivery ? theme.accent : theme.likeBoxBackground, backgroundColor: immediateDelivery ? theme.accent + "20" : theme.inputBackground }}>
                        <Ionicons name={immediateDelivery ? "checkmark-circle" : "ellipse-outline"} size={18} color={immediateDelivery ? theme.accent : theme.textMuted} />
                        <Text style={{ marginLeft: 6, color: theme.text, fontSize: 13, fontWeight: immediateDelivery ? "600" : "400" }}>Entrega inmediata</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setAcceptsFinancing(!acceptsFinancing)} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: acceptsFinancing ? theme.accent : theme.likeBoxBackground, backgroundColor: acceptsFinancing ? theme.accent + "20" : theme.inputBackground }}>
                        <Ionicons name={acceptsFinancing ? "checkmark-circle" : "ellipse-outline"} size={18} color={acceptsFinancing ? theme.accent : theme.textMuted} />
                        <Text style={{ marginLeft: 6, color: theme.text, fontSize: 13, fontWeight: acceptsFinancing ? "600" : "400" }}>Financiación posible</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={{ marginBottom: 12 }}>
              {acceptsFinancing && (
                <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
                   <View style={{ flex: 1 }}>
                    <Input
                      label="Anticipo (%)"
                      value={finInitialPercent}
                      onChangeText={(t) => { setFinInitialPercent(t); if(errors.finInitialPercent) validateField("finInitialPercent", t); }}
                      onBlur={() => validateField("finInitialPercent", finInitialPercent)}
                      error={errors.finInitialPercent}
                      keyboardType="number-pad"
                      placeholder="30"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Tasa anual (%)"
                      value={finRate}
                      onChangeText={(t) => { setFinRate(t); if(errors.finRate) validateField("finRate", t); }}
                      onBlur={() => validateField("finRate", finRate)}
                      error={errors.finRate}
                      keyboardType="number-pad"
                      placeholder="25"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Plazo (meses)"
                      value={finMonths}
                      onChangeText={(t) => { setFinMonths(t); if(errors.finMonths) validateField("finMonths", t); }}
                      onBlur={() => validateField("finMonths", finMonths)}
                      error={errors.finMonths}
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
                onSelect={(p) => { setProvince(p); setCity(""); }}
                onClose={() => setProvinceOpen(false)}
                value={province}
                placeholder="Buscar provincia"
                variant="inline"
              />
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: theme.text, marginBottom: 4, fontSize: 14 }}>Ciudad</Text>
              <TouchableOpacity 
                disabled={!province}
                onPress={() => { Keyboard.dismiss(); setCityOpen(true); }} 
                style={{ 
                  borderRadius: 999, 
                  borderWidth: 1, 
                  borderColor: city ? theme.buttonBackground : theme.likeBoxBackground, 
                  paddingHorizontal: 14, 
                  paddingVertical: 10, 
                  backgroundColor: city ? theme.buttonBackground : theme.badgeBackground, 
                  flexDirection: "row", 
                  alignItems: "center", 
                  gap: 6,
                  opacity: province ? 1 : 0.6
                }}
              >
                <Text style={{ color: city ? theme.buttonText : theme.text, fontWeight: "700" }}>{city || (province ? "Seleccionar ciudad" : "Elegí provincia primero")}</Text>
              </TouchableOpacity>
              <SelectionModal
                visible={cityOpen}
                title="Seleccionar Ciudad"
                options={citiesList}
                onSelect={(c) => setCity(c)}
                onClose={() => setCityOpen(false)}
                value={city}
                placeholder="Buscar ciudad"
                variant="inline"
                allowAdd={true}
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
                    {!coverUploading && (
                    <TouchableOpacity 
                        onPress={removeCoverImage}
                        style={{ position: "absolute", top: 2, right: 2, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12, padding: 2, zIndex: 10 }}
                    >
                        <Ionicons name="close-circle" size={18} color="#FFF" />
                    </TouchableOpacity>
                    )}
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
                    <TouchableOpacity 
                        onPress={removeCoverImage}
                        style={{ position: "absolute", top: 2, right: 2, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12, padding: 2, zIndex: 10 }}
                    >
                        <Ionicons name="close-circle" size={18} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                ) : null}
                {gallery.map((g, idx) => (
                  <View key={`${g.localUri}-${idx}`} style={{ width: 100, height: 70, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: g.uploading ? theme.textMuted : theme.likeBoxBackground }}>
                    <View style={{ flex: 1, backgroundColor: theme.background, opacity: g.uploading ? 0.6 : 1 }}>
                      {/* @ts-ignore */}
                      <Image source={{ uri: g.localUri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                    </View>
                    
                    {!g.uploading && (
                        <TouchableOpacity 
                            onPress={() => removeGalleryImage(idx)}
                            style={{ position: "absolute", top: 2, right: 2, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12, padding: 2, zIndex: 10 }}
                        >
                            <Ionicons name="close-circle" size={18} color="#FFF" />
                        </TouchableOpacity>
                    )}

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

            {/* Video Walkaround Section */}
            <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: theme.likeBoxBackground, paddingTop: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>Video Walkaround</Text>
                    {!videoUri && (
                         <View style={{ backgroundColor: theme.badgeBackground, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                            <Text style={{ color: theme.accent, fontSize: 10, fontWeight: "700" }}>PRO</Text>
                        </View>
                    )}
                </View>
                
                {!videoUri ? (
                <TouchableOpacity
                    onPress={pickVideoAndUpload}
                    disabled={videoUploading}
                    style={{
                        borderWidth: 1,
                        borderColor: theme.likeBoxBackground,
                        borderStyle: 'dashed',
                        backgroundColor: theme.inputBackground,
                        paddingVertical: 24,
                        alignItems: 'center',
                        borderRadius: 10,
                    }}
                >
                    {videoUploading ? (
                         <ActivityIndicator size="large" color={theme.accent} />
                    ) : (
                         <Ionicons name="videocam-outline" size={32} color={theme.textMuted} />
                    )}
                    <Text style={{ color: theme.textMuted, marginTop: 8, fontWeight: "500" }}>
                        {videoUploading ? `Subiendo video... ${videoProgress}%` : "Subir video (máx 60s)"}
                    </Text>
                </TouchableOpacity>
            ) : (
                <View style={{ width: '100%', height: 200, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: theme.likeBoxBackground, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
                     <Video
                        source={{ uri: videoUri }}
                        style={{ width: '100%', height: '100%' }}
                        useNativeControls
                        resizeMode={ResizeMode.COVER}
                        isLooping={false}
                        shouldPlay={true}
                        isMuted={true}
                     />
                     
                     <TouchableOpacity 
                        onPress={removeVideo}
                        style={{ position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12, padding: 4, zIndex: 10 }}
                    >
                        <Ionicons name="close" size={20} color="#FFF" />
                    </TouchableOpacity>
                </View>
            )}
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
        </KeyboardAwareScrollView>
      </WebContainer>
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        showCancel={alertConfig.showCancel}
        onCancel={handleCancel}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        onClose={handleConfirm}
      />
    </SafeAreaView>
  );
}
