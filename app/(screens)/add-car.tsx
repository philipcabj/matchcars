// app/(screens)/add-car.tsx
import { CustomAlert } from "@/components/CustomAlert";
import { DownloadAppBanner } from "@/components/DownloadAppBanner";
import { SelectionModal } from "@/components/SelectionModal";
import { WebContainer } from "@/components/WebContainer";
import { WebDealerAddCarForm } from "@/components/WebDealerAddCarForm";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { notifyAdminNewVehicle } from "@/lib/admin-notifications";
import { detectCar, detectLicensePlate, type BoundingBox } from "@/lib/ai";
import { Analytics } from "@/lib/analytics";
import { app, db, storage, vertexAI } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { analyzeMarketPrice } from "@/lib/pricing";
import { evaluateVehicleRisk } from "@/lib/riskScoring";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ResizeMode, Video } from "expo-av";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { addDoc, arrayUnion, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes, uploadBytesResumable, uploadString } from "firebase/storage";
import { getGenerativeModel } from "firebase/vertexai";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardTypeOptions } from "react-native";
import {
    ActivityIndicator,
    Image,
    Keyboard,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { Directions, Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { G, Path, Svg } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
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
}


const StickerMask = ({
  box,
  onUpdate,
  containerWidth,
  containerHeight,
  type = 'image',
}: {
  box: BoundingBox;
  onUpdate: (newBox: BoundingBox) => void;
  containerWidth: number;
  containerHeight: number;
  type?: 'image' | 'solid';
}) => {
  // Convert relative coordinates (0-1) to pixel values for the gesture handler
  const x = useSharedValue(box.xmin * containerWidth);
  const y = useSharedValue(box.ymin * containerHeight);
  const w = useSharedValue((box.xmax - box.xmin) * containerWidth);
  const h = useSharedValue((box.ymax - box.ymin) * containerHeight);

  // Sync when props change (e.g. initial load or external update)
  useEffect(() => {
    if (containerWidth > 0 && containerHeight > 0) {
      x.value = box.xmin * containerWidth;
      y.value = box.ymin * containerHeight;
      w.value = (box.xmax - box.xmin) * containerWidth;
      h.value = (box.ymax - box.ymin) * containerHeight;
    }
  }, [box, containerWidth, containerHeight]);

  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startW = useSharedValue(0);
  const startH = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((e) => {
      x.value = startX.value + e.translationX;
      y.value = startY.value + e.translationY;
    })
    .onEnd(() => {
      // Normalize back to 0-1 and update parent
      const newBox = {
        xmin: x.value / containerWidth,
        ymin: y.value / containerHeight,
        xmax: (x.value + w.value) / containerWidth,
        ymax: (y.value + h.value) / containerHeight,
      };
      runOnJS(onUpdate)(newBox);
    });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      startW.value = w.value;
      startH.value = h.value;
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((e) => {
      // Scale from center
      const newW = startW.value * e.scale;
      const newH = startH.value * e.scale;
      
      // Center adjustment
      const dw = newW - startW.value;
      const dh = newH - startH.value;
      
      w.value = newW;
      h.value = newH;
      x.value = startX.value - dw / 2;
      y.value = startY.value - dh / 2;
    })
    .onEnd(() => {
      const newBox = {
        xmin: x.value / containerWidth,
        ymin: y.value / containerHeight,
        xmax: (x.value + w.value) / containerWidth,
        ymax: (y.value + h.value) / containerHeight,
      };
      runOnJS(onUpdate)(newBox);
    });
    
  // Combined gesture for simultaneous drag and resize (pinch)
  const gesture = Gesture.Simultaneous(panGesture, pinchGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: x.value,
    top: y.value,
    width: w.value,
    height: h.value,
    transform: [{ translateX: 0 }, { translateY: 0 }], // Reset transform as we use left/top directly
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          animatedStyle,
          {
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'hidden',
            borderRadius: 8,
            borderWidth: 0, // No border for cleaner look
            backgroundColor: '#000000', // Solid black to cover plate
            zIndex: 100,
          },
        ]}
      >
        {type === 'image' && (
          <Image
            source={require('../../assets/images/icon.png')}
            style={{ width: '100%', height: '100%' }}
            resizeMode="stretch" // Stretch logo to completely cover the plate area
          />
        )}
        {/* Resize handle hint */}
        <View style={{ position: 'absolute', bottom: 4, right: 4, width: 12, height: 12, borderRadius: 6, backgroundColor: 'white', opacity: 0.8, borderWidth: 1, borderColor: '#ccc' }} />
      </Animated.View>
    </GestureDetector>
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
import { canUploadVideo, canUseAITools, canEnhancePhoto, getMaxCars, isDealerPlan } from "@/lib/planChecks";
import { CITY_OPTIONS_BY_PROVINCE, PROVINCES } from "@/config/locations";

export default function AddCarScreen() {
  const router = useRouter();
  const { user, agencyId, sellerProfile, refreshTrustLevel } = useAuth();
  const { theme, themeName } = useTheme();
  const insets = useSafeAreaInsets();

  if (Platform.OS === "web" && isDealerPlan(sellerProfile?.plan || "free")) {
    return <WebDealerAddCarForm />;
  }

  if (Platform.OS === "web") {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <DownloadAppBanner message="Descargá la App para publicar tu auto" />
        <TouchableOpacity
          onPress={() => router.replace("/(tabs)")}
          style={{ marginTop: 20, padding: 10 }}
        >
          <Text style={{ color: theme.accent, fontSize: 16, fontWeight: "600" }}>
            Volver al inicio
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // userId = la agencia dueña si esta cuenta es un vendedor invitado (ver
  // agencyId en AuthContext) — así el auto y cualquier lead que le hagan
  // aparecen en el Portal del dueño, no "perdidos" bajo el uid personal del
  // vendedor. Para el dueño y para cuentas sin agencia, agencyId === su
  // propio uid, así que no cambia nada.
  const userId = agencyId || user?.uid || "anon";
  const isDealer = isDealerPlan(sellerProfile?.plan || "free");
  const defaultUserName =
    sellerProfile?.firstName && sellerProfile?.lastName
      ? `${sellerProfile.firstName} ${sellerProfile.lastName}`
      : user?.displayName || user?.email || "Usuario";
  const userName = isDealer && sellerProfile?.agencyName ? sellerProfile.agencyName : defaultUserName;

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

  const [valuationResult, setValuationResult] = useState<{
    conditionLabel: string; conditionScore: number; issues: string[]; priceMin: number; priceMax: number; priceRationale: string;
  } | null>(null);
  const [valuationLoading, setValuationLoading] = useState(false);

  const [coverImage, setCoverImage] = useState("");
  const [coverLocalUri, setCoverLocalUri] = useState<string>("");
  const [coverOriginalUri, setCoverOriginalUri] = useState<string>("");
  const [coverUploading, setCoverUploading] = useState<boolean>(false);
  const [coverProgress, setCoverProgress] = useState<number>(0);

  const [videoUri, setVideoUri] = useState("");
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);

  const [gallery, setGallery] = useState<{ localUri: string; originalUri?: string; base64?: string; url?: string; uploading: boolean; progress?: number }[]>([]);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorTarget, setEditorTarget] = useState<{ type: "cover" | "gallery"; index: number | null } | null>(null);
  const [editorOriginalUri, setEditorOriginalUri] = useState<string | null>(null);
  const [editorWorkingUri, setEditorWorkingUri] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<"basic" | "pro">("basic");
  const [editorMode, setEditorMode] = useState<"standard" | "crop" | "draw" | "paint">("standard");
  const [editorAutoMasks, setEditorAutoMasks] = useState<(BoundingBox & { type?: 'image' | 'solid' })[]>([]);
  const [editorPaths, setEditorPaths] = useState<{ path: string; color: string; width: number }[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const activePath = useSharedValue("");
  const [targetRatio, setTargetRatio] = useState<number>(1);
  const [imageRatio, setImageRatio] = useState<number>(4 / 3);
  const [editorLayout, setEditorLayout] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const uri = editorWorkingUri || editorOriginalUri;
    if (uri) {
      Image.getSize(uri, (w, h) => {
        if (w && h) setImageRatio(w / h);
      });
    }
  }, [editorWorkingUri, editorOriginalUri]);
  const editorLayoutRef = useRef({ width: 0, height: 0 });
  const [editorBusy, setEditorBusy] = useState(false);
  const editorViewRef = useRef<View>(null); // For captureRef of the main editor view
  
  // Shared values for Crop Mode
  const cropScale = useSharedValue(1);
  const cropTranslateX = useSharedValue(0);
  const cropTranslateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetCropValues = () => {
    cropScale.value = 1;
    cropTranslateX.value = 0;
    cropTranslateY.value = 0;
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const cropAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cropTranslateX.value },
      { translateY: cropTranslateY.value },
      { scale: cropScale.value },
    ],
  }));

  const cropGesture = Gesture.Simultaneous(
    Gesture.Pinch()
      .onUpdate((e) => {
        cropScale.value = savedScale.value * e.scale;
      })
      .onEnd(() => {
        savedScale.value = cropScale.value;
      }),
    Gesture.Pan()
      .onUpdate((e) => {
        cropTranslateX.value = savedTranslateX.value + e.translationX;
        cropTranslateY.value = savedTranslateY.value + e.translationY;
      })
      .onEnd(() => {
        savedTranslateX.value = cropTranslateX.value;
        savedTranslateY.value = cropTranslateY.value;
      })
  );



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
                            logger.log("Restoring draft for user:", user?.uid);
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
                            logger.log("Discarding draft...");
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
    Analytics.logStartPublication();
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
            acceptsFinancing,
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
    acceptsFinancing,
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
              logger.log("Remote item found:", item);
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
        logger.log("Error fetching cities for province:", province, e);
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
        logger.log("Starting uploadBytesResumable to:", storageRef.fullPath);
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
            logger.log("Falling back to uploadBytes");
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



  async function ensureMaxSize(uri: string, maxBytes = 200_000): Promise<string> {
    let size = 0;
    if (Platform.OS !== 'web') {
      try {
        const info = await FileSystem.getInfoAsync(uri, { size: true } as any);
        size = (info as any).size ?? 0;
      } catch {}
    } else if (uri.startsWith('data:')) {
      const b64 = uri.split(',')[1] ?? '';
      size = Math.ceil(b64.length * 0.75);
    }
    if (!size || size <= maxBytes) return uri;
    const ratio = maxBytes / size;
    const compress = Math.max(0.3, Math.min(0.75, ratio * 0.82));
    const newWidth = size > maxBytes * 3 ? 800 : 1000;
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: newWidth } }],
      { compress, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  }

  // Computes a 4:3 crop centered on a detected car bounding box, with 30% padding for context.
  function computeCarCenteredCrop(box: BoundingBox, width: number, height: number, targetRatio: number) {
    const carW = (box.xmax - box.xmin) * width;
    const carH = (box.ymax - box.ymin) * height;

    const padding = 0.30;
    let w = carW * (1 + padding);
    let h = carH * (1 + padding);

    w = Math.min(w, width - 2);
    h = Math.min(h, height - 2);

    const currentRatio = w / h;
    if (currentRatio > targetRatio) {
      h = Math.min(w / targetRatio, height - 2);
    } else {
      w = Math.min(h * targetRatio, width - 2);
    }

    const centerX = (box.xmin + box.xmax) / 2;
    const centerY = (box.ymin + box.ymax) / 2;

    const x = centerX * width - w / 2;
    const y = centerY * height - h / 2;

    const finalW = Math.max(1, Math.floor(w));
    const finalH = Math.max(1, Math.floor(h));
    const finalX = Math.max(0, Math.min(Math.floor(x), width - finalW));
    const finalY = Math.max(0, Math.min(Math.floor(y), height - finalH));

    return { originX: finalX, originY: finalY, width: finalW, height: finalH };
  }

  function naiveCenterCrop(width: number, height: number, targetRatio: number) {
    const currentRatio = width / height;
    if (Math.abs(currentRatio - targetRatio) <= 0.05) return null;

    let originX = 0;
    let originY = 0;
    let cropW = width;
    let cropH = height;

    if (currentRatio > targetRatio) {
      cropW = height * targetRatio;
      originX = (width - cropW) / 2;
    } else {
      cropH = width / targetRatio;
      originY = (height - cropH) / 2;
    }

    return { originX, originY, width: cropW, height: cropH };
  }

  function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
    return Promise.race([
      promise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
  }

  async function standardizeImage(uri: string): Promise<string> {
    const { width, height } = await getImageSize(uri);
    // Target 4:3 aspect ratio
    const targetRatio = 4 / 3;

    let cropAction: { originX: number; originY: number; width: number; height: number } | null = null;

    // Try to center the crop on the detected car so the vehicle isn't cut off.
    // Falls back silently to a plain center crop if detection fails or times out,
    // so a slow/unavailable AI call never blocks the upload.
    try {
      // Las fotos de cámara pueden pesar varios MB a resolución original: leerlas
      // en base64 directamente hacía que la detección superara el timeout casi
      // siempre y terminara cayendo al recorte simple. Detectamos sobre una copia
      // liviana; el box normalizado (0-1) igual se aplica sobre el tamaño original.
      const detectionCopy = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: Math.min(1280, width) } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      const base64 = await FileSystem.readAsStringAsync(detectionCopy.uri, { encoding: "base64" });
      const aiResult = await withTimeout(detectCar(base64), 8000);
      if (aiResult?.success && aiResult.box) {
        cropAction = computeCarCenteredCrop(aiResult.box, width, height, targetRatio);
      }
    } catch (e) {
      logger.log("Smart crop detection failed, falling back to center crop", e);
    }

    if (!cropAction) {
      cropAction = naiveCenterCrop(width, height, targetRatio);
    }

    const actions: any[] = [];
    if (cropAction) {
        actions.push({ crop: cropAction });
    }
    // Resize to 1280x960 (standard high quality)
    actions.push({ resize: { width: 1200 } });

    const result = await ImageManipulator.manipulateAsync(uri, actions, {
        compress: 0.82,
        format: ImageManipulator.SaveFormat.JPEG,
    });
    return ensureMaxSize(result.uri);
  }

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
      
      let uri = asset.uri;
      try {
          // Standardize to 4:3 and 1280x960
          uri = await standardizeImage(uri);
      } catch (e) {
          console.error("Error standardizing image:", e);
          // Fallback to original if fails
      }

      let blob: Blob | undefined;
      try {
        blob = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.onload = function () {
            resolve(xhr.response);
          };
          xhr.onerror = function (e) {
            logger.log(e);
            reject(new TypeError("Network request failed"));
          };
          xhr.responseType = "blob";
          xhr.open("GET", uri, true);
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
        setCoverOriginalUri(uri);
        setCoverLocalUri(uri);
        setCoverUploading(true);
        setCoverProgress(0);
        try {
          // console.log("user in upload", user?.uid);
          
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
      } else {
        if (gallery.length >= 8) {
          showAlert("Límite de galería", "Podés agregar hasta 8 fotos.", "info");
          break;
        }
        const idx = baseIndex + localIdx;
        setGallery((prev) => [...prev, { localUri: uri, originalUri: uri, uploading: true, progress: 0 }]);
        try {
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
    setCoverOriginalUri("");
    setCoverProgress(0);
  };

  const removeGalleryImage = (index: number) => {
    setGallery((prev) => prev.filter((_, i) => i !== index));
  };

  async function getImageSize(uri: string): Promise<{ width: number; height: number }> {
    return await new Promise((resolve, reject) => {
      Image.getSize(
        uri,
        (w, h) => resolve({ width: w, height: h }),
        () => reject(new Error("size"))
      );
    });
  }

  async function cropBottomStrip(uri: string, ratio = 0.82) {
    const { width, height } = await getImageSize(uri);
    const cropH = Math.round(height * ratio);
    const actions: any[] = [{ crop: { originX: 0, originY: 0, width, height: cropH } }];
    const result = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return result.uri;
  }

  async function rotateImage(uri: string, deg: number) {
    const result = await ImageManipulator.manipulateAsync(uri, [{ rotate: deg }, { resize: { width: 1200 } }], { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG });
    return ensureMaxSize(result.uri);
  }

  function scheduleCoverUpload(uri: string) {
    if (!user) return;
    const filename = `${Date.now()}_${Math.floor(Math.random() * 1e6)}.jpg`;
    const path = `uploads/${userId}/${filename}`;
    const storageRef = ref(storage, path);
    setCoverUploading(true);
    setCoverProgress(0);
    (async () => {
      try {
        const blob = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.onload = function () {
            resolve(xhr.response);
          };
          xhr.onerror = function () {
            reject(new TypeError("Network request failed"));
          };
          xhr.responseType = "blob";
          xhr.open("GET", uri, true);
          xhr.send(null);
        }) as Blob;
        const url = await uploadImage(storageRef, blob, undefined, (p) => setCoverProgress(p), path);
        setCoverImage(url);
      } catch {
        showAlert("Error", "No se pudo subir la portada editada.", "error");
      } finally {
        setCoverUploading(false);
      }
    })();
  }

  function scheduleGalleryUpload(index: number, uri: string) {
    if (!user) return;
    const filename = `${Date.now()}_${Math.floor(Math.random() * 1e6)}.jpg`;
    const path = `uploads/${userId}/${filename}`;
    const storageRef = ref(storage, path);
    setGallery((prev) => prev.map((g, i) => (i === index ? { ...g, uploading: true, progress: 0 } : g)));
    (async () => {
      try {
        const blob = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.onload = function () {
            resolve(xhr.response);
          };
          xhr.onerror = function () {
            reject(new TypeError("Network request failed"));
          };
          xhr.responseType = "blob";
          xhr.open("GET", uri, true);
          xhr.send(null);
        }) as Blob;
        const url = await uploadImage(
          storageRef,
          blob,
          undefined,
          (p) => {
            setGallery((prev) => prev.map((g, i) => (i === index ? { ...g, progress: p } : g)));
          },
          path
        );
        setGallery((prev) => prev.map((g, i) => (i === index ? { ...g, url, uploading: false, progress: 100 } : g)));
      } catch {
        setGallery((prev) => prev.map((g, i) => (i === index ? { ...g, uploading: false, progress: 0 } : g)));
        showAlert("Error", "No se pudo subir la imagen editada.", "error");
      }
    })();
  }

  async function openPhotoEditor(type: "cover" | "gallery", index?: number) {
    // Reset editor states for a clean start
    setEditorBusy(false);
    setEditorAutoMasks([]);
    setEditorPaths([]);
    setCurrentPath(null);
    setEditorMode("standard");
    
    if (type === "cover") {
      const base = coverOriginalUri || coverLocalUri || coverImage;
      if (!base) {
        showAlert("Sin portada", "Primero subí una foto de portada.", "info");
        return;
      }
      setEditorTarget({ type: "cover", index: null });
      setEditorOriginalUri(base);
      setEditorWorkingUri(base);
      const { width, height } = await getImageSize(base);
      setImageRatio(width / height);
      setEditorTab("basic");
      setEditorVisible(true);
      return;
    }
    const item = typeof index === "number" ? gallery[index] : undefined;
    if (!item) return;
    const base = item.originalUri || item.localUri || item.url;
    if (!base) return;
    setEditorTarget({ type: "gallery", index: index ?? 0 });
    setEditorOriginalUri(base);
    setEditorWorkingUri(base);
    const { width, height } = await getImageSize(base);
    setImageRatio(width / height);
    setEditorTab("basic");
    setEditorVisible(true);
  }

  function closePhotoEditor() {
    setEditorVisible(false);
    setEditorTarget(null);
    setEditorOriginalUri(null);
    setEditorWorkingUri(null);
    setEditorBusy(false);
  }

  async function applyEditorAction(
    action: "rotateLeft" | "rotateRight" | "crop1x1" | "crop4x3" | "crop16x9" | "hidePlate" | "reset" | "cropFree"
  ) {
    if (!editorOriginalUri && !editorWorkingUri) return;
    if (action === "reset") {
      if (editorOriginalUri) {
        setEditorWorkingUri(editorOriginalUri);
        const { width, height } = await getImageSize(editorOriginalUri);
        setImageRatio(width / height);
        setEditorAutoMasks([]);
        setEditorPaths([]);
        setCurrentPath(null);
        setEditorMode("standard");
      }
      return;
    }

    setEditorBusy(true);
    try {
      if (action === "rotateLeft" || action === "rotateRight") {
        const base = editorOriginalUri || editorWorkingUri;
        if (!base) return;
        const deg = action === "rotateLeft" ? -90 : 90;
        const rotated = await rotateImage(base, deg);
        setEditorOriginalUri(rotated);
        setEditorWorkingUri(rotated);
        const { width, height } = await getImageSize(rotated);
        setImageRatio(width / height);
        return;
      }

      const baseForCrop = editorWorkingUri || editorOriginalUri;
      if (!baseForCrop) return;

      const enterCropMode = async (ratio: number, uri: string) => {
        const { width, height } = await getImageSize(uri);
        setTargetRatio(ratio);
        setImageRatio(width / height);
        resetCropValues();
        setEditorMode("crop");
      };

      if (action === "crop1x1") {
        await enterCropMode(1, baseForCrop);
        return;
      } else if (action === "crop4x3") {
        await enterCropMode(4 / 3, baseForCrop);
        return;
      } else if (action === "crop16x9") {
        await enterCropMode(16 / 9, baseForCrop);
        return;
      } else if (action === "cropFree") {
        const { width, height } = await getImageSize(baseForCrop);
        await enterCropMode(width / height, baseForCrop);
        return;
      } else if (action === "hidePlate") {
        // Switch to paint mode for manual finger drawing
        const base = editorWorkingUri || editorOriginalUri;
        if (base) {
            const { width, height } = await getImageSize(base);
            setImageRatio(width / height);
        }
        
        setEditorMode("paint");
        setEditorBusy(false);
        return;
      }
      
      if (action === "reset") {
        if (editorOriginalUri) {
          // Reset to the absolute original image before any edits
          setEditorWorkingUri(editorOriginalUri);
          const { width, height } = await getImageSize(editorOriginalUri);
          setImageRatio(width / height);
          setEditorAutoMasks([]);
          setEditorPaths([]);
          setCurrentPath(null);
          setEditorMode("standard");
        }
        return;
      }
    } finally {
      setEditorBusy(false);
    }
  }

  async function performCrop() {
    const uri = editorWorkingUri || editorOriginalUri;
    if (!uri) return;
    setEditorBusy(true);
    
    try {
      const { width: origW, height: origH } = await getImageSize(uri);
      
      // Calculate crop rectangle based on scale and translation
      // The viewport size depends on the container and targetRatio.
      // We assume container matches editorLayoutRef.current
      const containerW = editorLayoutRef.current.width;
      const containerH = editorLayoutRef.current.height;
      if (!containerW || !containerH) throw new Error("No layout");

      // Calculate Viewport Size (fitting targetRatio in container)
      let vw, vh;
      if (containerW / containerH > targetRatio) {
        // Container is wider than target -> Height is constraint
        vh = containerH;
        vw = vh * targetRatio;
      } else {
        // Container is taller than target -> Width is constraint
        vw = containerW;
        vh = vw / targetRatio;
      }
      
      // Calculate Rendered Image Size (Cover logic inside Viewport)
      // Since we changed resizeMode to "cover", the image fills the viewport.
      
      const imgRatio = origW / origH;
      let iw, ih;
      
      if (imgRatio > targetRatio) {
        // Wider image in narrower box. Cover -> Fit Height.
        ih = vh;
        iw = ih * imgRatio;
      } else {
        // Taller image in wider box. Cover -> Fit Width.
        iw = vw;
        ih = iw / imgRatio;
      }

      // Center the image in the viewport (it's "contain", so there might be empty space)
      // BUT if user zooms in, we crop what's visible in the viewport.
      // The image is centered in the viewport by default flex layout? 
      // Yes, "justifyContent: center, alignItems: center" on parent view.
      // So image center aligns with viewport center.

      // Get transforms from shared values
      const s = cropScale.value;
      const tx = cropTranslateX.value;
      const ty = cropTranslateY.value;
      
      // Calculate Rendered Image Rect in Viewport Coords
      // Center of image is at Viewport Center + Translation
      const cx = vw / 2 + tx;
      const cy = vh / 2 + ty;
      
      // Top-Left of Rendered Image
      const renderedX = cx - (iw * s) / 2;
      const renderedY = cy - (ih * s) / 2;
      
      // Crop Rect is the Viewport (0,0 to vw,vh) relative to the Rendered Image
      // We want to know which part of the IMAGE is under the Viewport.
      
      // Image space coord = (Viewport coord - Rendered Image Origin) / Scale
      let cropX_rel = (0 - renderedX) / s;
      let cropY_rel = (0 - renderedY) / s;
      let cropW_rel = vw / s;
      let cropH_rel = vh / s;
      
      // Map to Original Image Pixels
      // scaleFactor = origW / iw (how many original pixels per rendered pixel at scale 1)
      const scaleFactor = origW / iw;
      
      let finalX = cropX_rel * scaleFactor;
      let finalY = cropY_rel * scaleFactor;
      let finalW = cropW_rel * scaleFactor;
      let finalH = cropH_rel * scaleFactor;
      
      // Handle "contain" empty space (black bars)
      // If the image is smaller than viewport in some dimension (due to "contain"), 
      // cropX_rel might be negative (viewport starts before image).
      // We should clamp to 0.
      // But if we clamp to 0, we lose the aspect ratio of the crop?
      // No, ImageManipulator crops the IMAGE. It doesn't add black bars.
      // If we ask for crop outside image, it might fail or clamp.
      // If user wants 16:9 but image is 4:3 and fits inside, 
      // the result will be the 4:3 image? 
      // NO. The user sees black bars. They expect the result to be 16:9 (with black bars?).
      // ImageManipulator crop doesn't add padding.
      // If we want to support adding black bars, we need more complex logic (resize canvas).
      // BUT, usually "Crop" means "Cut".
      // If user selects 16:9 and zooms out so image is small, 
      // we probably just want to cut what is visible of the image?
      // OR does the user expect the black bars to be part of the saved image?
      // Given "FotoLab" context, usually we want the result to match the target ratio.
      // BUT ImageManipulator can't add background easily without base64 or complex actions.
      // Let's assume we just crop the INTERSECTION of the image and the viewport.
      // So if the viewport goes outside, we clamp.
      // The resulting image might NOT be 16:9 if we clamp.
      // This is a trade-off. 
      // To strictly enforce 16:9, we'd need to resize/pad.
      // Let's stick to Clamping for now, but ensure the calculation is correct for "contain".
      
      finalX = Math.max(0, finalX);
      finalY = Math.max(0, finalY);
      
      // If finalX was negative, it means we cut off the left empty space.
      // We must also adjust the width.
      // original calculation: finalW = vw / s * scaleFactor
      // If we clamped X, effectively we reduced the width from the left.
      // But let's just use the clamp logic at the end.
      
      if (finalX + finalW > origW) finalW = origW - finalX;
      if (finalY + finalH > origH) finalH = origH - finalY;
      
      // Safety check
      if (finalW <= 0 || finalH <= 0) {
          // Fallback to center crop if something went wrong
          // or just return original
           logger.warn("Invalid crop dimensions", finalX, finalY, finalW, finalH);
           finalX = 0; finalY = 0; finalW = origW; finalH = origH;
      }
      
      const actions: any[] = [{ crop: { originX: finalX, originY: finalY, width: finalW, height: finalH } }];
      const result = await ImageManipulator.manipulateAsync(uri, actions, {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      
      setEditorWorkingUri(result.uri);
      setImageRatio(result.width / result.height);
      setEditorMode("standard");
      
    } catch (e) {
      console.error(e);
      showAlert("Error", "No se pudo recortar la imagen.", "error");
    } finally {
      setEditorBusy(false);
    }
  }



  async function persistEditorImage() {
    if (!editorTarget || !editorWorkingUri) return;

    let finalUri = editorWorkingUri;

    // If we have stickers or paths active, we must "bake" them into a new image file
    // before persisting to the gallery/cover state.
    if (((editorMode === "draw" && editorAutoMasks.length > 0) || (editorMode === "paint" && editorPaths.length > 0)) && editorViewRef.current) {
        try {
            setEditorBusy(true);
            // Give a tiny bit of time for the UI to settle if needed
            await new Promise(resolve => setTimeout(resolve, 50));
            
            const captured = await captureRef(editorViewRef, {
                format: "jpg",
                quality: 0.9,
                result: "tmpfile",
            });
            finalUri = captured;
            setEditorWorkingUri(captured);
            // Once baked, we can clear masks and paths so they don't double up if edited again
            setEditorAutoMasks([]); 
            setEditorPaths([]);
            setCurrentPath(null);
            setEditorMode("standard");
        } catch (e) {
            console.error("Error capturing stickers:", e);
            showAlert("Error", "No se pudo procesar la imagen con las marcas.", "error");
            return;
        } finally {
            setEditorBusy(false);
        }
    }

    if (editorTarget.type === "cover") {
      setCoverOriginalUri(finalUri);
      setCoverLocalUri(finalUri);
      setEditorPaths([]);
      setCurrentPath(null);
      scheduleCoverUpload(finalUri);
    } else {
      const idx = editorTarget.index;
      if (idx == null) return;
      
      setGallery((prev) =>
        prev.map((g, i) =>
          i === idx ? { ...g, originalUri: finalUri, localUri: finalUri } : g
        )
      );
      setEditorPaths([]);
      setCurrentPath(null);
      scheduleGalleryUpload(idx, finalUri);
    }
  }

  async function savePhotoEditor() {
    if (editorTarget && editorWorkingUri) {
       await persistEditorImage();
    }
    closePhotoEditor();
  }

  const handleNextImage = async () => {
    if (!editorTarget || editorTarget.type !== "gallery" || editorTarget.index === null) return;
    
    // Save current progress if edited or has stickers
    if (editorOriginalUri !== editorWorkingUri || editorAutoMasks.length > 0) {
       await persistEditorImage();
    }
    
    const nextIdx = editorTarget.index + 1;
    if (nextIdx < gallery.length) {
        // Reset editor state
        setEditorMode("standard");
        setEditorAutoMasks([]);
        setEditorPaths([]);
        setCurrentPath(null);
        setEditorTab("basic");
        setEditorBusy(false);
        
        // Open next
        const nextItem = gallery[nextIdx];
        const base = nextItem.originalUri || nextItem.localUri || nextItem.url;
        if (base) {
            setEditorTarget({ type: "gallery", index: nextIdx });
            setEditorOriginalUri(base);
            setEditorWorkingUri(base);
        }
    }
  };

  const handlePrevImage = async () => {
    if (!editorTarget || editorTarget.type !== "gallery" || editorTarget.index === null) return;
    
    // Save current progress if edited or has stickers
    if (editorOriginalUri !== editorWorkingUri || editorAutoMasks.length > 0) {
       await persistEditorImage();
    }
    
    const prevIdx = editorTarget.index - 1;
    if (prevIdx >= 0) {
        // Reset editor state
        setEditorMode("standard");
        setEditorAutoMasks([]);
        setEditorPaths([]);
        setCurrentPath(null);
        setEditorTab("basic");
        setEditorBusy(false);
        
        // Open prev
        const prevItem = gallery[prevIdx];
        const base = prevItem.originalUri || prevItem.localUri || prevItem.url;
        if (base) {
            setEditorTarget({ type: "gallery", index: prevIdx });
            setEditorOriginalUri(base);
            setEditorWorkingUri(base);
        }
    }
  };

  const swipeGesture = Gesture.Race(
    Gesture.Fling()
      .direction(Directions.LEFT)
      .onEnd(() => {
        runOnJS(handleNextImage)();
      }),
    Gesture.Fling()
      .direction(Directions.RIGHT)
      .onEnd(() => {
        runOnJS(handlePrevImage)();
      })
  );

  const finishPaint = (path: string) => {
    setEditorPaths((prev) => [...prev, { path, color: "#000000", width: 20 }]);
    setCurrentPath(null);
  };

  const paintGesture = Gesture.Pan()
    .onStart((e) => {
      if (editorMode !== "paint") return;
      activePath.value = `M${e.x},${e.y}`;
      runOnJS(setCurrentPath)(activePath.value);
    })
    .onUpdate((e) => {
      if (editorMode !== "paint") return;
      activePath.value = `${activePath.value} L${e.x},${e.y}`;
      runOnJS(setCurrentPath)(activePath.value);
    })
    .onEnd(() => {
      if (editorMode !== "paint" || !activePath.value) return;
      runOnJS(finishPaint)(activePath.value);
      activePath.value = "";
    });

  async function handleProEditorAction(action: "blurPlate" | "enhance") {
    const plan = sellerProfile?.plan || "free";

    const allowed = action === "blurPlate" ? canUseAITools(plan) : canEnhancePhoto(plan);
    if (!allowed) {
      showAlert(
        "Función Premium",
        action === "blurPlate"
          ? "Tapar la patente automáticamente es exclusivo para usuarios PRO Plus o superiores."
          : "Mejorar el encuadre de la foto con IA es exclusivo para usuarios con plan pago.",
        "info",
        () => router.push("/(screens)/subscribe")
      );
      return;
    }

    setEditorBusy(true);
    try {
      const uri = editorWorkingUri || editorOriginalUri;
      if (!uri) return;

      // Normalize image orientation and size for AI
      // This ensures AI sees the image exactly as displayed (rotated correctly)
      const normalized = await ImageManipulator.manipulateAsync(
        uri, 
        [{ resize: { width: 2048 } }], // Resize to reasonable max width to speed up and fix orientation
        { format: ImageManipulator.SaveFormat.JPEG, compress: 0.9 }
      );
      
      // Update working URI to the normalized one so the user sees the correct orientation
      // This is crucial for the mask coordinates to match the display
      setEditorWorkingUri(normalized.uri);
      setImageRatio(normalized.width / normalized.height);
      const workingUri = normalized.uri;
      const width = normalized.width;
      const height = normalized.height;

      const base64 = await FileSystem.readAsStringAsync(workingUri, { encoding: "base64" });

      if (action === "blurPlate") {
        // Step 1: Detect the car first to narrow down the search area for the plate
        // This significantly improves accuracy by removing background noise
        const carResult = await detectCar(base64);
        let aiResult;
        
        if (carResult.success && carResult.box) {
            // Step 2: Crop to the car area and detect plate within it
            const carBox = carResult.box;
             const carCrop = await ImageManipulator.manipulateAsync(
                 workingUri,
                 [{ crop: { 
                     originX: Math.max(0, Math.floor(carBox.xmin * width)), 
                     originY: Math.max(0, Math.floor(carBox.ymin * height)), 
                     width: Math.max(1, Math.floor((carBox.xmax - carBox.xmin) * width)), 
                     height: Math.max(1, Math.floor((carBox.ymax - carBox.ymin) * height)) 
                 }}],
                 { format: ImageManipulator.SaveFormat.JPEG, compress: 0.9 }
             );
            
            const carBase64 = await FileSystem.readAsStringAsync(carCrop.uri, { encoding: "base64" });
            const plateInCarResult = await detectLicensePlate(carBase64);
            
            if (plateInCarResult.success && plateInCarResult.box) {
                // Map coordinates back to the full image
                const pBox = plateInCarResult.box;
                aiResult = {
                    success: true,
                    box: {
                        xmin: carBox.xmin + pBox.xmin * (carBox.xmax - carBox.xmin),
                        xmax: carBox.xmin + pBox.xmax * (carBox.xmax - carBox.xmin),
                        ymin: carBox.ymin + pBox.ymin * (carBox.ymax - carBox.ymin),
                        ymax: carBox.ymin + pBox.ymax * (carBox.ymax - carBox.ymin),
                    }
                };
            } else {
                aiResult = await detectLicensePlate(base64); // Fallback to full image
            }
        } else {
            aiResult = await detectLicensePlate(base64);
        }

        if (aiResult.success && aiResult.box) {
          const box = aiResult.box;
          const w = box.xmax - box.xmin;
          const h = box.ymax - box.ymin;
          
          // Expand horizontally and vertically to cover edges comfortably
          // Reduced padding to be tighter as per user feedback and improved accuracy
          const paddingX = w * 0.1; 
          const paddingY = h * 0.1;

          const safeBox = {
            xmin: Math.max(0, box.xmin - paddingX),
            xmax: Math.min(1, box.xmax + paddingX),
            ymin: Math.max(0, box.ymin - paddingY),
            ymax: Math.min(1, box.ymax + paddingY),
            type: 'image' as const
          };

          setEditorAutoMasks([safeBox]);
          setEditorMode("draw"); // We reuse "draw" mode flag to show masks, but integrated
          // showAlert("Patente detectada", "Podés mover y redimensionar la máscara si es necesario.", "success");
        } else {
          console.error("AI Error (Plate):", aiResult.error);
          
          // Manual Fallback: Add a default mask in the center
          const defaultBox = {
              xmin: 0.3,
              ymin: 0.45,
              xmax: 0.7,
              ymax: 0.55,
              type: 'image' as const
          };
          setEditorAutoMasks([defaultBox]);
          setEditorMode("draw");
          
          showAlert(
              "No detectada automáticamente", 
              "No pudimos encontrar la patente, pero agregamos una máscara para que la ubiques manualmente.", 
              "info"
          );
        }
      } else {
        const aiResult = await detectCar(base64);
        if (aiResult.success && aiResult.box) {
             const box = aiResult.box;

             // Control de sanidad: antes de esto, si Gemini devolvía una caja
             // mal detectada (ej. un reflejo o un detalle de la carrocería en
             // vez del auto completo), el código recortaba igual sin
             // preguntar — resultado: fotos publicadas con un zoom
             // inservible (ver caso reportado, publicación #127). Un auto
             // real casi nunca ocupa menos del 15% del ancho/alto de una
             // foto pensada para mostrarlo — si la caja detectada es más
             // chica que eso, tratamos la detección como no confiable y
             // dejamos la foto sin tocar en vez de arriesgarnos a arruinarla.
             const MIN_CAR_FRACTION = 0.15;
             const boxWidthFrac = box.xmax - box.xmin;
             const boxHeightFrac = box.ymax - box.ymin;

             if (boxWidthFrac < MIN_CAR_FRACTION || boxHeightFrac < MIN_CAR_FRACTION) {
               logger.warn("detectCar: caja demasiado chica, se descarta el recorte", box);
               showAlert(
                 "No pudimos mejorar el encuadre",
                 "No identificamos bien el auto en esta foto — la dejamos como estaba para no arruinarla.",
                 "info"
               );
             } else {
             // Smart Crop Logic
             // Calculate car dimensions in pixels
             const carW = boxWidthFrac * width;
             const carH = boxHeightFrac * height;

             // Expand car box by 30% to give more context
             const padding = 0.30;
             let w = carW * (1 + padding);
             let h = carH * (1 + padding);

             // Ensure we don't exceed image bounds initially (with 2px safety margin)
             w = Math.min(w, width - 2);
             h = Math.min(h, height - 2);

             // Try to Enforce 4:3 aspect ratio
             const targetRatio = 4 / 3;
             const currentRatio = w / h;

             if (currentRatio > targetRatio) {
               h = Math.min(w / targetRatio, height - 2);
             } else {
               w = Math.min(h * targetRatio, width - 2);
             }

             // Center and Clamp
             const centerX = (box.xmin + box.xmax) / 2;
             const centerY = (box.ymin + box.ymax) / 2;

             let x = (centerX * width) - (w / 2);
             let y = (centerY * height) - (h / 2);

             // Final Clamping and Floor
             const finalW = Math.max(1, Math.floor(w));
             const finalH = Math.max(1, Math.floor(h));
             const finalX = Math.max(0, Math.min(Math.floor(x), width - finalW));
             const finalY = Math.max(0, Math.min(Math.floor(y), height - finalH));

             const actions = [{ crop: { originX: finalX, originY: finalY, width: finalW, height: finalH } }];
             const result = await ImageManipulator.manipulateAsync(workingUri, actions, {
                compress: 0.9,
                format: ImageManipulator.SaveFormat.JPEG,
             });

             setEditorWorkingUri(result.uri);
             setImageRatio(result.width / result.height);
             showAlert("Foto mejorada", "Se ha re-encuadrado el vehículo (4:3) automáticamente.", "success");
             }
        } else {
             console.error("AI Error (Car):", aiResult.error);
             showAlert("No detectado", `No se encontró el vehículo.\n${aiResult.error || 'Intenta con otra foto.'}`, "info");
        }
      }
    } catch (e: any) {
      console.error("ProEditor Error:", e);
      showAlert("Error", `Ocurrió un error al procesar la imagen con IA.\n${e?.message || ''}`, "error");
    } finally {
      setEditorBusy(false);
    }
  }
  async function pickVideoAndUpload() {
    if (!user) return;
    
    const plan = sellerProfile?.plan || 'free';
    
    if (!canUploadVideo(plan)) {
        showAlert("Función Premium", "El video walkaround es exclusivo para usuarios PRO. Suscribite para desbloquearlo.", "info", () => router.push("/(screens)/subscribe"));
        return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert("Permiso requerido", "Necesitamos acceso a tu galería.", "info");
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
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
                 const cacheDir = FileSystem.cacheDirectory + 'video_temp/';
                 const dirInfo = await FileSystem.getInfoAsync(cacheDir);
                 if (!dirInfo.exists) {
                     await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
                 }
                 const tempUri = cacheDir + `${Date.now()}.mp4`;
                 await FileSystem.copyAsync({ from: finalUri, to: tempUri });
                 finalUri = tempUri;
             } catch (err) {
                 logger.log("Error handling iOS video asset:", err);
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

    // Verificar límites de publicación según plan
    const plan = sellerProfile?.plan || 'free';
    const limit = getMaxCars(plan);

    if (limit !== Infinity) {
      try {
        const qAll = query(collection(db, "vehicles"), where("userId", "==", userId));
        const snapshot = await getDocs(qAll);
        const EXCLUDED_STATUSES = ["deleted", "rejected", "blocked", "sold", "a_preparar"];
        const activeCount = snapshot.docs.filter(d => {
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
        showAlert("Error", "No se pudo verificar el límite de publicaciones. Intentá de nuevo.", "info");
        return;
      }
    }

    if (!brand || !model || !year || !price) {
      showAlert("Faltan datos", "Marca, modelo, año y precio son obligatorios.", "info");
      return;
    }

    // Validar campos con errores
    const pValid = validateField('price', price);
    const kValid = validateField('km', km);
    if (!pValid || !kValid) {
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

      try {
        const market = await analyzeMarketPrice(
          brand,
          model,
          yearNum,
          currency
        );
        if (market.avg > 0 && priceNum > market.avg * 1.5) {
          showAlert(
            "Precio muy alto",
            "El precio que cargaste está más de 50% por encima del valor de mercado estimado. Revisá el precio sugerido y ajustalo para publicar.",
            "info"
          );
          setLoading(false);
          return;
        }
      } catch {}

      let risk = { flags: [] as string[], score: 0 };
      try {
        risk = await evaluateVehicleRisk({
          brand,
          model,
          year: yearNum,
          price: priceNum,
          currency,
          description: details || "",
          userId,
          trustLevel: sellerProfile?.trustLevel || "new",
          coverImage: coverImage,
        });
      } catch (e) {
        // El scoring de riesgo es un análisis adicional: si falla, publicamos igual sin bloquear al usuario.
        console.error("Error evaluando riesgo (no bloqueante):", e);
      }

      const vehicleData = {
        userId,
        // uid real que publica — puede ser un vendedor invitado de una
        // agencia (userId ya es el dueño, no la persona). Sin esto no hay
        // forma de saber quién del equipo publicó cada auto (ver
        // logVehicleCreatedActivity en functions/src/index.ts).
        createdByUid: user?.uid || userId,
        userName,
        userPlan: sellerProfile?.plan || 'free',
        sellerTrustLevel: sellerProfile?.trustLevel || "new",
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
        originalPrice: priceNum,
        priceHistory: priceNum ? [{ price: priceNum, currency: currency || "ARS", changedAt: Timestamp.now() }] : [],
        updatedAt: serverTimestamp(),
        financing: null,
        published: false,
        status: "pending_review",
        likedBy: [],
        isFeatured: sellerProfile?.plan?.includes('pro_dealer') || false,
        featuredAt: sellerProfile?.plan?.includes('pro_dealer') ? serverTimestamp() : null,
        views: 0,
        likesCount: 0,
        flags: {
          forSale: true,
          tradeIn: acceptsTradeIn,
        },
        riskFlags: risk.flags,
        riskScore: risk.score,
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "vehicles"), vehicleData);

      // Track car publication in Meta Analytics
      Analytics.logCarPublished(brand, model, priceNum, currency);

      // Notificar a administración vía WhatsApp/Email
      try {
        await notifyAdminNewVehicle(docRef.id, vehicleData);
      } catch (e) {
        console.error("Error notifying admin:", e);
      }

      // Update catalog with new values if they don't exist
      try {
        logger.log("Updating catalog with:", { brand, model, version });
        
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
        logger.log("Catalog updated successfully");
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

      const modelAI = getGenerativeModel(vertexAI, { model: "gemini-2.5-flash" });
      const result = await modelAI.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      
      setDetails(text.trim());
    } catch (error: any) {
      // La IA es una ayuda opcional: si falla, el usuario siempre puede escribir la descripción a mano.
      console.error("Error generando descripción con IA:", error);
      showAlert(
        "IA no disponible",
        "La generación automática no está disponible por el momento. Podés reintentar o escribir la descripción manualmente.",
        "info",
        { showCancel: true, confirmText: "Reintentar", cancelText: "Escribir manualmente", onConfirm: () => generateDescription() }
      );
    } finally {
      setLoadingAI(false);
    }
  };

  const canSubmit =
    !loading && !coverUploading && gallery.every((g) => !g.uploading) && !!brand && !!model && !!year && !!price && !!province && !!city;

  const coverCount = coverLocalUri || coverImage ? 1 : 0;

  const publicationQuality = useMemo(() => {
    let score = 0;
    const suggestions: string[] = [];

    const hasBasicData = !!brand && !!model && !!year && !!km;
    if (hasBasicData) score += 25;
    else suggestions.push("Completá marca, modelo, año y kilómetros.");

    const hasLocation = !!province && !!city;
    if (hasLocation) score += 15;
    else suggestions.push("Indicá provincia y ciudad para aparecer mejor en las búsquedas.");

    const totalPhotos = coverCount + gallery.length;
    if (coverCount > 0) score += 15;
    else suggestions.push("Subí una foto de portada clara del auto.");

    if (totalPhotos >= 6) score += 15;
    else if (totalPhotos >= 3) score += 10;
    else if (totalPhotos >= 1) score += 5;
    else suggestions.push("Agregá varias fotos del interior y exterior.");

    const detailsLength = details.trim().length;
    if (detailsLength >= 400) score += 15;
    else if (detailsLength >= 200) score += 10;
    else if (detailsLength >= 80) score += 5;
    else suggestions.push("Escribí una descripción contando estado, servicios y extras.");

    if (price && priceSuggestion && priceSuggestion.avg > 0 && !priceSuggestion.loading) {
      const numericPrice = Number(price);
      if (!isNaN(numericPrice) && numericPrice > 0) {
        const diffPercent = Math.abs(numericPrice - priceSuggestion.avg) / priceSuggestion.avg * 100;
        if (diffPercent <= 5) {
          score += 20;
        } else if (diffPercent <= 15) {
          score += 10;
        } else {
          suggestions.push("Revisá el precio para alinearlo al mercado sugerido.");
        }
      }
    }

    if (score > 100) score = 100;

    let level = "Básica";
    let levelColor = (theme as any).error || "#EF4444";

    if (score >= 80) {
      level = "Excelente";
      levelColor = theme.accent;
    } else if (score >= 50) {
      level = "Buena";
      levelColor = "#F59E0B";
    }

    const uniqueSuggestions = Array.from(new Set(suggestions)).slice(0, 3);

    return { score, level, levelColor, suggestions: uniqueSuggestions };
  }, [
    brand,
    model,
    year,
    km,
    province,
    city,
    coverCount,
    gallery.length,
    details,
    price,
    priceSuggestion.avg,
    priceSuggestion.loading,
    theme,
  ]);

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
              value={km ? Number(km).toLocaleString("es-AR") : ""}
              onChangeText={(t) => { 
                const raw = t.replace(/\D/g, "");
                setKm(raw); 
                if(errors.km) validateField("km", raw); 
              }}
              onBlur={() => validateField("km", km)}
              error={errors.km}
              keyboardType="number-pad"
              placeholder="35.000"
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
                <Text style={{ marginTop: 4, color: theme.textMuted, fontSize: 12, fontStyle: "italic" }}>Calculando precio de mercado...</Text>
              )}
              {priceSuggestion.count > 0 && !priceSuggestion.loading && !valuationResult && (
                <TouchableOpacity
                  onPress={() => setPrice(Math.round(priceSuggestion.avg).toString())}
                  style={{ marginTop: 8, flexDirection: "row", alignItems: "center", backgroundColor: theme.card, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.likeBoxBackground }}
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
              {priceSuggestion.count > 0 && !priceSuggestion.loading && valuationResult && (
                <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="bar-chart-outline" size={12} color={theme.textMuted} />
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                    Mercado: {currency} {Math.round(priceSuggestion.avg).toLocaleString("es-AR")} prom. ({priceSuggestion.count} similares) · La tasación IA ya lo considera
                  </Text>
                </View>
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

            {acceptsFinancing && (
              <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.accent + "15", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: theme.accent + "40" }}>
                <Ionicons name="information-circle-outline" size={16} color={theme.accent} />
                <Text style={{ color: theme.accent, fontSize: 12, flex: 1 }}>
                  Configurá el anticipo y las cuotas desde <Text style={{ fontWeight: "700" }}>Mis Autos → Financiación</Text> una vez publicado el auto.
                </Text>
              </View>
            )}
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

              {/* Tasación IA — aparece cuando hay al menos una foto */}
              {(coverImage || gallery.some((g) => g.url)) && (
                <View style={{ marginTop: 14 }}>
                  {!valuationResult && (
                    <TouchableOpacity
                      onPress={async () => {
                        const imageUrls = [
                          coverImage,
                          ...gallery.map((g) => g.url ?? "").filter(Boolean),
                        ].filter(Boolean) as string[];
                        if (imageUrls.length === 0) return;
                        setValuationLoading(true);
                        try {
                          const fns = getFunctions(app);
                          const analyze = httpsCallable<object, typeof valuationResult>(fns, "analyzeCarPhotos");
                          const res = await analyze({
                            imageUrls,
                            brand: brand || "Desconocido",
                            model: model || "",
                            year: Number(year) || new Date().getFullYear(),
                            km: Number(km) || 0,
                            currency,
                            marketAvgPrice: priceSuggestion.avg > 0 ? Math.round(priceSuggestion.avg) : undefined,
                          });
                          setValuationResult(res.data);
                        } catch {
                          // Silent — valuation is optional
                        } finally {
                          setValuationLoading(false);
                        }
                      }}
                      disabled={valuationLoading}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        backgroundColor: "#1e3a5f",
                        borderRadius: 10,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: "#2563eb44",
                      }}
                    >
                      <Ionicons name="sparkles" size={16} color={theme.accent} />
                      <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 14, flex: 1 }}>
                        {valuationLoading ? "Analizando fotos..." : "Tasación con IA"}
                      </Text>
                      {valuationLoading
                        ? <ActivityIndicator size="small" color={theme.accent} />
                        : <Text style={{ color: "#94A3B8", fontSize: 12 }}>Gratis</Text>
                      }
                    </TouchableOpacity>
                  )}
                  {valuationResult && (
                    <View style={{ backgroundColor: theme.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: `${theme.accent}33` }}>
                      {/* Header */}
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Ionicons name="sparkles" size={15} color={theme.accent} />
                          <Text style={{ color: theme.title, fontWeight: "700", fontSize: 14 }}>Tasación IA</Text>
                        </View>
                        <TouchableOpacity onPress={() => setValuationResult(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="refresh-outline" size={16} color={theme.textMuted} />
                        </TouchableOpacity>
                      </View>

                      {/* Condition badge */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <View style={{
                          paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
                          backgroundColor: valuationResult.conditionScore >= 8 ? "#10B98122" : valuationResult.conditionScore >= 6 ? "#3B82F622" : "#EF444422",
                        }}>
                          <Text style={{ fontWeight: "700", fontSize: 12, color: valuationResult.conditionScore >= 8 ? "#10B981" : valuationResult.conditionScore >= 6 ? "#3B82F6" : "#EF4444" }}>
                            {valuationResult.conditionLabel} · {valuationResult.conditionScore}/10
                          </Text>
                        </View>
                      </View>

                      {/* Price range */}
                      <Text style={{ color: theme.price, fontWeight: "800", fontSize: 16, marginBottom: 3 }}>
                        {currency} {Number(valuationResult.priceMin).toLocaleString("es-AR")} – {Number(valuationResult.priceMax).toLocaleString("es-AR")}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 10, lineHeight: 17 }}>
                        {valuationResult.priceRationale}
                      </Text>

                      {/* Issues */}
                      {valuationResult.issues.length > 0 && (
                        <View style={{ gap: 4, marginBottom: 12 }}>
                          {valuationResult.issues.map((issue, i) => (
                            <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                              <Ionicons name="alert-circle-outline" size={13} color="#F59E0B" style={{ marginTop: 1 }} />
                              <Text style={{ color: theme.textMuted, fontSize: 12, flex: 1 }}>{issue}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Apply price button */}
                      <TouchableOpacity
                        onPress={() => {
                          const mid = Math.round((valuationResult.priceMin + valuationResult.priceMax) / 2);
                          setPrice(mid.toString());
                        }}
                        style={{ backgroundColor: theme.accent, borderRadius: 8, paddingVertical: 9, alignItems: "center", marginTop: valuationResult.issues.length === 0 ? 0 : 0 }}
                      >
                        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
                          Aplicar precio sugerido ({currency} {Math.round((valuationResult.priceMin + valuationResult.priceMax) / 2).toLocaleString("es-AR")})
                        </Text>
                      </TouchableOpacity>

                      {/* Market context note */}
                      {priceSuggestion.count > 0 && (
                        <Text style={{ color: theme.textMuted, fontSize: 10, marginTop: 8, textAlign: "center" }}>
                          Considera el promedio de mercado ({currency} {Math.round(priceSuggestion.avg).toLocaleString("es-AR")}) y la condición del vehículo
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {coverLocalUri ? (
                  <TouchableOpacity
                    onPress={() => openPhotoEditor("cover")}
                    style={{ width: 100, height: 70, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: theme.likeBoxBackground }}
                  >
                    <View style={{ flex: 1, backgroundColor: theme.background, opacity: coverUploading ? 0.6 : 1 }}>
                      {/* @ts-ignore */}
                      <Image
                        source={{ uri: coverLocalUri }}
                        style={{ width: "100%", height: "100%" }}
                        resizeMode="cover"
                      />
                      {coverUploading && (
                        <View style={{ ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" }}>
                          <ActivityIndicator size="small" color={theme.accent} />
                        </View>
                      )}
                    </View>
                    {!coverUploading && (
                      <TouchableOpacity
                        onPress={() => removeCoverImage()}
                        style={{
                          position: "absolute",
                          top: 2,
                          right: 2,
                          backgroundColor: "rgba(0,0,0,0.5)",
                          borderRadius: 12,
                          padding: 2,
                          zIndex: 10,
                        }}
                      >
                        <Ionicons name="close-circle" size={18} color="#FFF" />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                ) : coverImage ? (
                  <TouchableOpacity
                    onPress={() => openPhotoEditor("cover")}
                    style={{ width: 100, height: 70, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: theme.likeBoxBackground }}
                  >
                    <View style={{ flex: 1, backgroundColor: theme.background }}>
                      {/* @ts-ignore */}
                      <Image
                        source={{ uri: coverImage }}
                        style={{ width: "100%", height: "100%" }}
                        resizeMode="cover"
                      />
                    </View>
                    <TouchableOpacity
                      onPress={() => removeCoverImage()}
                      style={{
                        position: "absolute",
                        top: 2,
                        right: 2,
                        backgroundColor: "rgba(0,0,0,0.5)",
                        borderRadius: 12,
                        padding: 2,
                        zIndex: 10,
                      }}
                    >
                      <Ionicons name="close-circle" size={18} color="#FFF" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ) : null}
                {gallery.map((g, idx) => (
                  <TouchableOpacity
                    key={`${g.localUri}-${idx}`}
                    onPress={() => openPhotoEditor("gallery", idx)}
                    style={{
                      width: 100,
                      height: 70,
                      borderRadius: 8,
                      overflow: "hidden",
                      borderWidth: 1,
                      borderColor: g.uploading ? theme.textMuted : theme.likeBoxBackground,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        backgroundColor: theme.background,
                        opacity: g.uploading ? 0.6 : 1,
                      }}
                    >
                      {/* @ts-ignore */}
                      <Image
                        source={{ uri: g.localUri }}
                        style={{ width: "100%", height: "100%" }}
                        resizeMode="cover"
                      />
                      {g.uploading && (
                        <View style={{ ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" }}>
                          <ActivityIndicator size="small" color={theme.accent} />
                        </View>
                      )}
                    </View>

                    {!g.uploading && (
                      <TouchableOpacity
                        onPress={() => removeGalleryImage(idx)}
                        style={{
                          position: "absolute",
                          top: 2,
                          right: 2,
                          backgroundColor: "rgba(0,0,0,0.5)",
                          borderRadius: 12,
                          padding: 2,
                          zIndex: 10,
                        }}
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
                        <TouchableOpacity
                          onPress={() => retryGalleryUpload(idx)}
                          style={{
                            backgroundColor: theme.accent,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 999,
                          }}
                        >
                          <Text style={{ color: theme.buttonText, fontSize: 10 }}>Reintentar</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
              {(coverLocalUri || coverImage || gallery.length > 0) && (
                <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="information-circle-outline" size={16} color={theme.textMuted} style={{ marginRight: 4 }} />
                  <Text style={{ color: theme.textMuted, fontSize: 12, textAlign: "center" }}>
                    Toca una foto para editarla
                  </Text>
                </View>
              )}
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

          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: theme.accent, fontSize: 16, fontWeight: "700", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Calidad de publicación</Text>
            <View style={{ borderRadius: 12, backgroundColor: theme.card, padding: 12, flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 4, borderColor: publicationQuality.levelColor, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                <Text style={{ color: publicationQuality.levelColor, fontSize: 20, fontWeight: "800" }}>{publicationQuality.score}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700", marginBottom: 4 }}>
                  {publicationQuality.level === "Excelente"
                    ? "Tu publicación está lista para destacar."
                    : publicationQuality.level === "Buena"
                    ? "Tu publicación está bien, pero podés mejorarla."
                    : "Completá algunos datos más para atraer más interesados."}
                </Text>
                {publicationQuality.suggestions.length > 0 && (
                  <View style={{ marginTop: 4 }}>
                    {publicationQuality.suggestions.map((tip, idx) => (
                      <View key={idx} style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 2 }}>
                        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: theme.textMuted, marginTop: 7, marginRight: 6 }} />
                        <Text style={{ color: theme.textMuted, fontSize: 12, flex: 1 }}>{tip}</Text>
                      </View>
                    ))}
                  </View>
                )}
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
        {/* Reintentar portada legacy eliminado: la portada se vuelve a subir automáticamente al editar */}
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
      {editorVisible && (
        <GestureHandlerRootView
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100,
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.8)",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {/* Navigation Arrows for Gallery */}
            {editorTarget?.type === "gallery" && editorTarget.index !== null && gallery.length > 1 && editorMode !== "draw" && (
                <>
                    {editorTarget.index > 0 && (
                        <TouchableOpacity 
                            onPress={handlePrevImage}
                            style={{ 
                                position: 'absolute', 
                                left: 10, 
                                top: '50%', 
                                transform: [{translateY: -20}],
                                zIndex: 10,
                                backgroundColor: 'rgba(0,0,0,0.5)',
                                padding: 8,
                                borderRadius: 20
                            }}
                        >
                            <Ionicons name="chevron-back" size={24} color="white" />
                        </TouchableOpacity>
                    )}
                    {editorTarget.index < gallery.length - 1 && (
                        <TouchableOpacity 
                            onPress={handleNextImage}
                            style={{ 
                                position: 'absolute', 
                                right: 10, 
                                top: '50%', 
                                transform: [{translateY: -20}],
                                zIndex: 10,
                                backgroundColor: 'rgba(0,0,0,0.5)',
                                padding: 8,
                                borderRadius: 20
                            }}
                        >
                            <Ionicons name="chevron-forward" size={24} color="white" />
                        </TouchableOpacity>
                    )}
                </>
            )}

             {editorMode === "crop" ? (
              <View
                style={{
                  width: "100%",
                  height: "100%",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: 20,
                }}
              >
                <Text
                  style={{
                    color: "white",
                    fontSize: 18,
                    fontWeight: "bold",
                    marginBottom: 20,
                  }}
                >
                  Ajustar Recorte
                </Text>
                <View
                  style={{
                    width: "100%",
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                    marginBottom: 20,
                  }}
                >
                  <GestureDetector gesture={cropGesture}>
                    <View
                      style={{
                        width: "100%",
                        aspectRatio: targetRatio,
                        maxWidth: "100%",
                        maxHeight: "80%",
                        backgroundColor: "#000",
                        overflow: "hidden",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.3)",
                      }}
                      onLayout={(e) => {
                        editorLayoutRef.current = e.nativeEvent.layout;
                      }}
                    >
                      <Animated.Image
                      source={{ uri: editorWorkingUri || editorOriginalUri || "" }}
                      style={[
                        {
                          width: "100%",
                          height: "100%",
                        },
                        cropAnimatedStyle,
                      ]}
                      resizeMode="cover"
                    />
                    </View>
                  </GestureDetector>
                  <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 10, fontSize: 12 }}>
                    Pellizca para zoom y arrastra para ajustar
                  </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
                  {[
                    { label: "1:1", ratio: 1 },
                    { label: "4:3", ratio: 4/3 },
                    { label: "16:9", ratio: 16/9 },
                    { label: "Original", ratio: imageRatio || 4/3 },
                  ].map((opt) => (
                    <TouchableOpacity
                      key={opt.label}
                      onPress={() => {
                        setTargetRatio(opt.ratio);
                        resetCropValues();
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 20,
                        backgroundColor: Math.abs(targetRatio - opt.ratio) < 0.01 ? "white" : "#333",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.2)"
                      }}
                    >
                      <Text style={{ color: Math.abs(targetRatio - opt.ratio) < 0.01 ? "black" : "white", fontWeight: "600", fontSize: 12 }}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setEditorMode("standard");
                    }}
                    style={{
                      paddingHorizontal: 20,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: theme.card,
                    }}
                  >
                    <Text style={{ color: theme.text }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={performCrop}
                    style={{
                      paddingHorizontal: 20,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: theme.accent,
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "bold" }}>Aplicar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View
                style={{
                  width: "100%",
                  maxWidth: 420,
                  backgroundColor: theme.card,
                  borderRadius: 16,
                  padding: 12,
                }}
              >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <TouchableOpacity onPress={closePhotoEditor} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={theme.text} />
              </TouchableOpacity>
              <Text
                style={{
                  color: theme.text,
                  fontSize: 16,
                  fontWeight: "700",
                  flex: 1,
                  textAlign: "center",
                }}
                numberOfLines={1}
              >
                Editar foto
              </Text>
              <TouchableOpacity
                onPress={savePhotoEditor}
                disabled={!editorWorkingUri || editorBusy}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: !editorWorkingUri || editorBusy ? theme.textMuted : theme.accent,
                }}
              >
                <Text
                  style={{
                    color: theme.buttonText,
                    fontWeight: "600",
                    fontSize: 12,
                  }}
                >
                  Guardar
                </Text>
              </TouchableOpacity>
            </View>

            <GestureDetector gesture={Gesture.Race(swipeGesture, paintGesture)}>
            <View style={{ width: "100%", aspectRatio: imageRatio || 4 / 3, marginBottom: 12 }}>
              <View
                ref={editorViewRef}
                collapsable={false}
                onLayout={(e) => setEditorLayout(e.nativeEvent.layout)}
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: 12,
                  overflow: "hidden",
                  backgroundColor: "#000",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {editorWorkingUri ? (
                  <Image
                    source={{ uri: editorWorkingUri }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                ) : editorOriginalUri ? (
                  <Image
                    source={{ uri: editorOriginalUri }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                ) : (
                  <ActivityIndicator size="large" color={theme.accent} />
                )}
                {/* Painting Layer - Render whenever there are paths or we are painting */}
                {(editorPaths.length > 0 || currentPath) && (
                  <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    <Svg width="100%" height="100%">
                      <G>
                        {Array.isArray(editorPaths) && editorPaths.map((p, i) => (
                          <Path
                            key={i}
                            d={p.path}
                            stroke={p.color}
                            strokeWidth={p.width}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ))}
                        {currentPath && (
                          <Path
                            d={currentPath}
                            stroke="#000000"
                            strokeWidth={20}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                      </G>
                    </Svg>
                  </View>
                )}

                {/* Integrated Masks (Stickers) */}
                {editorMode === "draw" && editorAutoMasks.map((mask, i) => (
                    <StickerMask
                      key={i}
                      box={mask}
                      type={mask.type}
                      containerWidth={editorLayout.width}
                      containerHeight={editorLayout.height}
                      onUpdate={(newBox) => {
                          setEditorAutoMasks(prev => {
                              const next = [...prev];
                              next[i] = { ...next[i], ...newBox };
                              return next;
                          });
                      }}
                    />
                ))}
              </View>

              {/* Loading Overlay - OUTSIDE of editorViewRef to avoid baking it into the image */}
              {editorBusy && (
                <View
                  style={{
                    ...StyleSheet.absoluteFillObject,
                    backgroundColor: "rgba(0,0,0,0.6)",
                    justifyContent: "center",
                    alignItems: "center",
                    borderRadius: 12,
                    zIndex: 200,
                  }}
                >
                  <ActivityIndicator size="large" color={theme.accent} />
                  <Text
                    style={{
                      color: "#FFF",
                      marginTop: 12,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    Procesando con IA...
                  </Text>
                </View>
              )}
            </View>
            </GestureDetector>

            <View
              style={{
                flexDirection: "row",
                borderRadius: 999,
                backgroundColor: themeName === "dark" ? "#1F2937" : "#E5E7EB",
                padding: 4,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: themeName === "dark" ? "#374151" : "#D1D5DB",
              }}
            >
              <TouchableOpacity
                onPress={() => setEditorTab("basic")}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 999,
                  alignItems: "center",
                  backgroundColor: editorTab === "basic" ? theme.accent : "transparent",
                  elevation: editorTab === "basic" ? 2 : 0,
                  shadowColor: "#000",
                  shadowOpacity: editorTab === "basic" ? 0.2 : 0,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 2 },
                }}
              >
                <Text
                  style={{
                    color: editorTab === "basic" ? "#FFFFFF" : (themeName === "dark" ? "#9CA3AF" : "#6B7280"),
                    fontWeight: "800",
                    fontSize: 13,
                    textTransform: "uppercase",
                  }}
                >
                  Básico
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setEditorTab("pro")}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 999,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 6,
                  backgroundColor: editorTab === "pro" ? theme.accent : "transparent",
                  elevation: editorTab === "pro" ? 2 : 0,
                  shadowColor: "#000",
                  shadowOpacity: editorTab === "pro" ? 0.2 : 0,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 2 },
                }}
              >
                <Text
                  style={{
                    color: editorTab === "pro" ? "#FFFFFF" : (themeName === "dark" ? "#9CA3AF" : "#6B7280"),
                    fontWeight: "800",
                    fontSize: 13,
                    textTransform: "uppercase",
                  }}
                >
                  Pro
                </Text>
                <View
                  style={{
                    backgroundColor: editorTab === "pro" ? "#FFFFFF" : theme.accent,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 6,
                  }}
                >
                  <Text
                    style={{
                      color: editorTab === "pro" ? theme.accent : "#FFFFFF",
                      fontSize: 10,
                      fontWeight: "900",
                    }}
                  >
                    IA
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {editorTab === "basic" ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => applyEditorAction("rotateLeft")}
                  disabled={editorBusy}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.likeBoxBackground,
                    backgroundColor: theme.card,
                  }}
                >
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    Rotar -90°
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => applyEditorAction("rotateRight")}
                  disabled={editorBusy}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.likeBoxBackground,
                    backgroundColor: theme.card,
                  }}
                >
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    Rotar +90°
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => applyEditorAction("crop1x1")}
                  disabled={editorBusy}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: Math.abs(targetRatio - 1) < 0.01 ? theme.accent : theme.likeBoxBackground,
                    backgroundColor: Math.abs(targetRatio - 1) < 0.01 ? theme.accent : theme.card,
                  }}
                >
                  <Text
                    style={{
                      color: Math.abs(targetRatio - 1) < 0.01 ? "#FFF" : theme.text,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    1:1
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => applyEditorAction("crop4x3")}
                  disabled={editorBusy}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: Math.abs(targetRatio - 4/3) < 0.01 ? theme.accent : theme.likeBoxBackground,
                    backgroundColor: Math.abs(targetRatio - 4/3) < 0.01 ? theme.accent : theme.card,
                  }}
                >
                  <Text
                    style={{
                      color: Math.abs(targetRatio - 4/3) < 0.01 ? "#FFF" : theme.text,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    4:3
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => applyEditorAction("crop16x9")}
                  disabled={editorBusy}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: Math.abs(targetRatio - 16/9) < 0.01 ? theme.accent : theme.likeBoxBackground,
                    backgroundColor: Math.abs(targetRatio - 16/9) < 0.01 ? theme.accent : theme.card,
                  }}
                >
                  <Text
                    style={{
                      color: Math.abs(targetRatio - 16/9) < 0.01 ? "#FFF" : theme.text,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    16:9
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => applyEditorAction("cropFree")}
                  disabled={editorBusy}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.likeBoxBackground,
                    backgroundColor: theme.card,
                  }}
                >
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    Original
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => applyEditorAction("hidePlate")}
                  disabled={editorBusy}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.likeBoxBackground,
                    backgroundColor: theme.card,
                  }}
                >
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    Tapar patente
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => applyEditorAction("reset")}
                  disabled={editorBusy || !editorOriginalUri}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.likeBoxBackground,
                    backgroundColor: theme.card,
                  }}
                >
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    Restablecer
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => handleProEditorAction("blurPlate")}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.likeBoxBackground,
                    backgroundColor: theme.card,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Ionicons name="sparkles" size={14} color={theme.accent} />
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    Tapar patente
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleProEditorAction("enhance")}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.likeBoxBackground,
                    backgroundColor: theme.card,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Ionicons name="sparkles-outline" size={14} color={theme.accent} />
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    Mejorar foto
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          )}
        </View>
      </GestureHandlerRootView>
      )}
    </SafeAreaView>
  );
}
