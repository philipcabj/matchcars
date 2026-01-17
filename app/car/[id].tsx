// app/car/[id].tsx
import type { Theme } from "@/config/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type CarDetailsTabs = "resumen" | "ficha" | "historial" | "financiacion";

// Por ahora usamos any para no pelearnos con el tipo Vehicle
type VehicleDoc = any;

export default function CarDetailsScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const [vehicle, setVehicle] = useState<VehicleDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<CarDetailsTabs>("resumen");
  const [editing, setEditing] = useState(false);
  const [editState, setEditState] = useState({
    price: "",
    km: "",
    fuelType: "",
    gearbox: "",
    city: "",
    province: "",
    currency: "",
    acceptsFinancing: false,
    finRate: "",
    finMonths: "",
    description: "",
    featuresText: "",
    historyItems: [] as { year?: string; title?: string; note?: string }[],
    fuelOpen: false,
    gearboxOpen: false,
    cityOpen: false,
    cityQuery: "",
    provinceOpen: false,
    provinceQuery: "",
    airbags: "",
    windowsAuto: "",
    wheelType: "",
    engine: "",
  } as any);

  const { user, initializing } = useAuth();
  const [authChecking, setAuthChecking] = useState(true);
  

  // ✅ Chequeo de sesión y redirección dentro de useEffect
  useEffect(() => {
    if (initializing) return;
    setAuthChecking(false);
  }, [initializing]);

  useEffect(() => {
    if (tab && ["resumen", "ficha", "historial", "financiacion"].includes(String(tab))) {
      setActiveTab(tab as CarDetailsTabs);
    }
  }, [tab]);

  useEffect(() => {
    if (!id || initializing || authChecking || !user) return;

    const ref = doc(db, "vehicles", id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as any;
          setVehicle(data);
          setEditState((prev: any) => ({
            ...prev,
            price: String(data.price ?? ""),
            km: String(data.km ?? ""),
            fuelType: data.fuelType ?? data.fuel ?? "",
            gearbox: data.gearbox ?? data.transmission ?? "",
            city: data.location?.city ?? data.city ?? "",
            province: data.location?.province ?? data.province ?? "",
            currency: data.currency ?? "ARS",
            acceptsFinancing: !!data.acceptsFinancing,
            finRate: String(data.financing?.rate ?? 25),
            finMonths: String(data.financing?.months ?? 24),
            description: data.description ?? "",
            featuresText: Array.isArray(data.features) ? data.features.join(", ") : "",
            historyItems: Array.isArray(data.history) ? data.history : [],
            airbags: String((data as any)?.airbags ?? ""),
            windowsAuto: String((data as any)?.windowsAuto ?? ""),
            wheelType: (data as any)?.wheelType ?? "",
            engine: (data as any)?.engine ?? "",
          }));
        } else {
          setVehicle(null);
        }
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    return () => unsub();
  }, [id, initializing, authChecking, user]);

  if (initializing || authChecking) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator color={theme.accent} />
        <Text style={styles.loadingText}>Verificando sesión...</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.errorText}>Necesitás iniciar sesión para ver detalles.</Text>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
          <TouchableOpacity onPress={() => router.push("/login")} style={styles.backPill}>
            <Text style={styles.backPillText}>Iniciar sesión</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/register")} style={styles.homePill}>
            <Text style={styles.homePillText}>Registrarme</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  

  const handleGoBack = () => {
    router.back();
  };

  const handleGoHome = () => {
    router.push("/(tabs)");
  };

  const handleContact = async () => {
    if (!user || !vehicle) return;
    
    // Simply navigate to chat with user. 
    // The chat/[uid] screen handles conversation creation (deterministic ID).
    if (vehicle.userId) {
        router.push({
            pathname: "/chat/[uid]",
            params: { uid: vehicle.userId, name: vehicle.userName || undefined }
        });
    } else {
        Alert.alert("Error", "No se puede contactar a este usuario.");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator color={theme.accent} />
        <Text style={styles.loadingText}>Cargando auto...</Text>
      </SafeAreaView>
    );
  }

  if (!vehicle) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.errorText}>No se encontró el auto.</Text>
        <TouchableOpacity onPress={handleGoBack} style={styles.backPill}>
          <Text style={styles.backPillText}>← Volver</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }


  const screenWidth = Dimensions.get("window").width;
  const images: string[] = [
    vehicle.images?.cover ?? vehicle.coverImage ?? vehicle.cover ?? "",
    ...(
      Array.isArray(vehicle.images?.gallery)
        ? vehicle.images.gallery
        : Array.isArray(vehicle.additionalImages)
        ? vehicle.additionalImages
        : []
    ),
  ].filter(Boolean);

  const displayTitle =
    [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(" ") ||
    vehicle.title ||
    "Auto sin título";

  const priceText =
    vehicle.price && vehicle.currency
      ? `${vehicle.currency} ${Number(vehicle.price).toLocaleString("es-AR")}`
      : "Precio no disponible";

  const kmText = vehicle.km ? `${vehicle.km.toLocaleString("es-AR")} km` : "KM no informado";
  const fuelText = vehicle.fuelType || vehicle.fuel || "Combustible no informado";
  const gearboxText = vehicle.gearbox || vehicle.transmission || "Caja no informada";

  const locationText =
    vehicle.location?.province ||
    vehicle.province ||
    "Provincia no disponible";


  

  const fuelOptions = ["Nafta", "Diésel", "Híbrido", "Eléctrico", "GNC"];
  const gearboxOptions = ["Manual", "Automática"];
  const PROVINCES: string[] = [
    "Buenos Aires","CABA","Catamarca","Chaco","Chubut","Córdoba","Corrientes","Entre Ríos","Formosa","Jujuy","La Pampa","La Rioja","Mendoza","Misiones","Neuquén","Río Negro","Salta","San Juan","San Luis","Santa Cruz","Santa Fe","Santiago del Estero","Tierra del Fuego","Tucumán"
  ];

  const CITY_OPTIONS_BY_PROVINCE: Record<string, string[]> = {
    "Buenos Aires": ["La Plata", "Mar del Plata", "Bahía Blanca", "Quilmes", "Morón", "Tandil", "San Isidro"],
    "CABA": ["Palermo", "Recoleta", "Belgrano", "Caballito", "Flores", "Mataderos"],
    "Córdoba": ["Córdoba", "Villa Carlos Paz", "Río Cuarto", "Alta Gracia", "Villa María"],
    "Santa Fe": ["Rosario", "Santa Fe", "Rafaela", "Venado Tuerto"],
    "Mendoza": ["Mendoza", "Godoy Cruz", "Guaymallén", "San Rafael"],
    "Tucumán": ["San Miguel de Tucumán", "Yerba Buena", "Tafí Viejo"],
    "Salta": ["Salta", "San Lorenzo", "Tartagal"],
    "Neuquén": ["Neuquén", "Plottier", "Centenario"],
    "Río Negro": ["Bariloche", "General Roca", "Cipolletti"],
    "Chubut": ["Comodoro Rivadavia", "Trelew", "Puerto Madryn"],
  };
  const cityOptions: string[] = CITY_OPTIONS_BY_PROVINCE[editState.province] || ["Córdoba", "Rosario", "Mendoza", "Salta", "Neuquén", "Bariloche"];

  async function handleSaveEdits() {
    if (!vehicle) return;
    const ref = doc(db, "vehicles", vehicle.id);
    const priceNum = editState.price ? Number(editState.price) : null;
    const kmNum = editState.km ? Number(editState.km) : null;
    const rateNum = editState.finRate ? Number(editState.finRate) : null;
    const monthsNum = editState.finMonths ? Number(editState.finMonths) : null;
    const airbagsNum = editState.airbags ? Number(editState.airbags) : null;
    const windowsAutoNum = editState.windowsAuto ? Number(editState.windowsAuto) : null;
    const featuresArr = String(editState.featuresText || "")
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
    await updateDoc(ref, {
      price: priceNum,
      km: kmNum,
      fuelType: editState.fuelType || null,
      gearbox: editState.gearbox || null,
      currency: editState.currency || vehicle.currency || "ARS",
      location: {
        city: editState.city || null,
        province: editState.province || null,
      },
      description: editState.description || null,
      features: featuresArr.length ? featuresArr : [],
      airbags: airbagsNum,
      windowsAuto: windowsAutoNum,
      wheelType: editState.wheelType || null,
      engine: editState.engine || null,
      acceptsFinancing: !!editState.acceptsFinancing,
      financing: !!editState.acceptsFinancing
        ? {
            rate: rateNum ?? 25,
            months: monthsNum ?? 24,
          }
        : null,
      history: Array.isArray(editState.historyItems) ? editState.historyItems : [],
    });
    setEditing(false);
  }

  // --- Contenidos de cada pestaña ---

  const renderResumen = () => (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Resumen</Text>

      <Text style={styles.carTitle}>{displayTitle}</Text>

      <Text style={styles.priceText}>{priceText}</Text>

      <View style={styles.badgesRow}>
        {vehicle.operationType === "sale" && (
          <View style={[styles.badge, styles.badgeSale]}>
            <Text style={styles.badgeText}>VENTA</Text>
          </View>
        )}
        {vehicle.operationType === "swap" && (
          <View style={[styles.badge, styles.badgeSwap]}>
            <Text style={styles.badgeText}>PERMUTA</Text>
          </View>
        )}
        {vehicle.acceptsFinancing && (
          <View style={[styles.badge, styles.badgeFinance]}>
            <Text style={styles.badgeText}>FINANCIA</Text>
          </View>
        )}
      </View>

      <View style={styles.chipsRow}>
        <View style={styles.chip}>
          <Text style={styles.chipLabel} numberOfLines={1} adjustsFontSizeToFit>KM</Text>
          <Text style={styles.chipValue} numberOfLines={1} adjustsFontSizeToFit>{kmText}</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipLabel} numberOfLines={1} adjustsFontSizeToFit>Combustible</Text>
          <Text style={styles.chipValue} numberOfLines={1} adjustsFontSizeToFit>{fuelText}</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipLabel} numberOfLines={1} adjustsFontSizeToFit>Caja</Text>
          <Text style={styles.chipValue} numberOfLines={1} adjustsFontSizeToFit>{gearboxText}</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipLabel} numberOfLines={1} adjustsFontSizeToFit>Provincia</Text>
          <Text style={styles.chipValue} numberOfLines={1} adjustsFontSizeToFit>{locationText}</Text>
        </View>
      </View>

      <View style={styles.ownerBox}>
        <Text style={styles.ownerLabel}>Publicado por</Text>
        <Text style={styles.ownerName}>
          {vehicle.userName || "Usuario desconocido"}
        </Text>
        {vehicle.createdAt && (
          <Text style={styles.ownerDate}>
            Publicado el{" "}
            {vehicle.createdAt?.toDate
              ? vehicle.createdAt.toDate().toLocaleDateString("es-AR")
              : new Date(vehicle.createdAt).toLocaleDateString("es-AR")}
          </Text>
        )}
        {user && user.uid !== vehicle.userId && (
          <TouchableOpacity
            style={[styles.ctaButton, { marginTop: 12, backgroundColor: theme.primary }]}
            onPress={() => router.push(`/(screens)/chat/${vehicle.userId}`)}
          >
            <Text style={styles.ctaButtonText}>Enviar mensaje</Text>
          </TouchableOpacity>
        )}
      </View>
      {vehicle.description ? (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.specLabel}>Descripción</Text>
          <Text style={styles.descriptionText}>{vehicle.description}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        onPress={() => router.push({ pathname: "/report/[id]", params: { id: vehicle.id, type: "vehicle" } })}
        style={{ marginTop: 24, alignSelf: "center", padding: 8 }}
      >
        <Text style={{ color: theme.textMuted, fontSize: 14, textDecorationLine: "underline" }}>
          Reportar publicación
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderFichaTecnica = () => (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Ficha técnica</Text>

      <View style={styles.specGrid}>
        <View style={styles.specItem}>
          <Text style={styles.specLabel}>Marca</Text>
          <Text style={styles.specValue}>{vehicle.brand || "—"}</Text>
        </View>
        <View style={styles.specItem}>
          <Text style={styles.specLabel}>Modelo</Text>
          <Text style={styles.specValue}>{vehicle.model || "—"}</Text>
        </View>
        <View style={styles.specItem}>
          <Text style={styles.specLabel}>Versión</Text>
          <Text style={styles.specValue}>{vehicle.version || "—"}</Text>
        </View>
        <View style={styles.specItem}>
          <Text style={styles.specLabel}>Año</Text>
          <Text style={styles.specValue}>{vehicle.year || "—"}</Text>
        </View>
        <View style={styles.specItem}>
          <Text style={styles.specLabel}>Kilómetros</Text>
          <Text style={styles.specValue}>{kmText}</Text>
        </View>
        <View style={styles.specItem}>
          <Text style={styles.specLabel}>Combustible</Text>
          <Text style={styles.specValue}>{fuelText}</Text>
        </View>
        <View style={styles.specItem}>
          <Text style={styles.specLabel}>Caja</Text>
          <Text style={styles.specValue}>{gearboxText}</Text>
        </View>
        <View style={styles.specItem}>
          <Text style={styles.specLabel}>Airbags</Text>
          <Text style={styles.specValue}>{vehicle.airbags ?? "—"}</Text>
        </View>
        <View style={styles.specItem}>
          <Text style={styles.specLabel}>Ventanas eléctricas</Text>
          <Text style={styles.specValue}>{vehicle.windowsAuto != null ? String(vehicle.windowsAuto) : "—"}</Text>
        </View>
        <View style={styles.specItem}>
          <Text style={styles.specLabel}>Tipo de rueda</Text>
          <Text style={styles.specValue}>{vehicle.wheelType || "—"}</Text>
        </View>
        <View style={styles.specItem}>
          <Text style={styles.specLabel}>Motor</Text>
          <Text style={styles.specValue}>{vehicle.engine || "—"}</Text>
        </View>
      </View>

      {Array.isArray(vehicle.features) && vehicle.features.length > 0 && (
        <>
          <Text style={[styles.specLabel, { marginTop: 16 }]}> 
            Equipamiento
          </Text>
          <View style={styles.featuresWrap}>
            {vehicle.features.map((feat: string, idx: number) => (
              <View key={`${feat}-${idx}`} style={styles.featureTag}>
                <Text style={styles.featureText}>{feat}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {vehicle.description && (
        <>
          <Text style={[styles.specLabel, { marginTop: 16 }]}>Descripción</Text>
          <Text style={styles.descriptionText}>{vehicle.description}</Text>
        </>
      )}
    </View>
  );

  const renderHistorial = () => (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Historial del auto</Text>

      {/* Por ahora mostramos texto plano, después podemos guardarlo como array de eventos */}
      {Array.isArray(vehicle.history) && vehicle.history.length > 0 ? (
        <View style={styles.timeline}>
          {vehicle.history.map(
            (item: { year?: string; title?: string; note?: string }, idx: number) => (
              <View key={idx} style={styles.timelineItem}>
                <View style={styles.timelineDot} />
                <View style={styles.timelineContent}>
                  {!!item.year && (
                    <Text style={styles.timelineYear}>{item.year}</Text>
                  )}
                  {!!item.title && (
                    <Text style={styles.timelineTitle}>{item.title}</Text>
                  )}
                  {!!item.note && (
                    <Text style={styles.timelineNote}>{item.note}</Text>
                  )}
                </View>
              </View>
            )
          )}
        </View>
      ) : (
        <Text style={styles.mutedText}>
          El historial de este auto todavía no fue cargado. Más adelante
          podés agregar service, cambios importantes, etc.
        </Text>
      )}
    </View>
  );

  const renderFinanciacion = () => {
    const price = Number(vehicle.price) || 0;
    const rate = Number(vehicle.financing?.rate ?? 25);
    const months = Number(vehicle.financing?.months ?? 24);

    const monthlyRate = rate / 12 / 100;
    const monthly =
      price && monthlyRate
        ? (price * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
        : 0;

    return (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Financiación</Text>

        {price ? (
          <>
            <Text style={styles.mutedText}>
              Simulación estimada según opciones cargadas (no vinculante).
            </Text>

            <View style={styles.financeBox}>
              <View style={styles.financeRow}>
                <Text style={styles.financeLabel}>Precio del auto</Text>
                <Text style={styles.financeValue}>{priceText}</Text>
              </View>
              <View style={styles.financeRow}>
                <Text style={styles.financeLabel}>Plazo</Text>
                <Text style={styles.financeValue}>{months} meses</Text>
              </View>
              <View style={styles.financeRow}>
                <Text style={styles.financeLabel}>Tasa anual estimada</Text>
                <Text style={styles.financeValue}>{rate}%</Text>
              </View>
              <View style={[styles.financeRow, { marginTop: 8 }]}>
                <Text style={styles.financeLabelStrong}>
                  Cuota mensual estimada
                </Text>
                <Text style={styles.financeValueStrong}>
                  {vehicle.currency}{" "}
                  {monthly.toLocaleString("es-AR", {
                    maximumFractionDigits: 0,
                  })}
                </Text>
              </View>
            </View>

            {vehicle.acceptsFinancing ? (
              <TouchableOpacity style={styles.ctaButton}>
                <Text style={styles.ctaButtonText}>Quiero financiar este auto</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.mutedText}>Este auto no ofrece financiación.</Text>
            )}
          </>
        ) : (
          <Text style={styles.mutedText}>
            No hay información suficiente para simular financiación en este
            auto.
          </Text>
        )}
      </View>
    );
  };

  

  const renderActiveTab = () => {
    switch (activeTab) {
      case "resumen":
        return renderResumen();
      case "ficha":
        return renderFichaTecnica();
      case "historial":
        return renderHistorial();
      case "financiacion":
        return renderFinanciacion();
      default:
        return null;
    }
  };

  const renderEditActiveTab = () => {
    switch (activeTab) {
      case "resumen":
        return (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Editar resumen</Text>
            <View style={styles.specGrid}>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Precio</Text>
                <TextInput value={editState.price} onChangeText={(t) => setEditState((s: any) => ({ ...s, price: t }))} keyboardType="number-pad" style={styles.input} placeholder="9500000" placeholderTextColor={theme.textMuted} />
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Moneda</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {["ARS", "USD"].map((cur) => (
                    <TouchableOpacity key={cur} onPress={() => setEditState((s: any) => ({ ...s, currency: cur }))} style={[styles.select, { flex: 1, borderColor: editState.currency === cur ? theme.accent : theme.badgeBorder }]}>
                      <Text style={[styles.selectText, { color: editState.currency === cur ? theme.accent : theme.inputText }]}>{cur}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Kilómetros</Text>
                <TextInput value={editState.km} onChangeText={(t) => setEditState((s: any) => ({ ...s, km: t }))} keyboardType="number-pad" style={styles.input} placeholder="35000" placeholderTextColor={theme.textMuted} />
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Combustible</Text>
                <TouchableOpacity onPress={() => setEditState((s: any) => ({ ...s, fuelOpen: !s.fuelOpen }))} style={styles.select}>
                  <Text style={styles.selectText}>{editState.fuelType || "Seleccionar"}</Text>
                </TouchableOpacity>
                {editState.fuelOpen && (
                  <View style={styles.selectMenu}>
                    {fuelOptions.map((fo) => (
                      <TouchableOpacity key={fo} onPress={() => setEditState((s: any) => ({ ...s, fuelType: fo, fuelOpen: false }))} style={styles.selectItem}>
                        <Text style={styles.selectItemText}>{fo}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Caja</Text>
                <TouchableOpacity onPress={() => setEditState((s: any) => ({ ...s, gearboxOpen: !s.gearboxOpen }))} style={styles.select}>
                  <Text style={styles.selectText}>{editState.gearbox || "Seleccionar"}</Text>
                </TouchableOpacity>
                {editState.gearboxOpen && (
                  <View style={styles.selectMenu}>
                    {gearboxOptions.map((go) => (
                      <TouchableOpacity key={go} onPress={() => setEditState((s: any) => ({ ...s, gearbox: go, gearboxOpen: false }))} style={styles.selectItem}>
                        <Text style={styles.selectItemText}>{go}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Ciudad</Text>
                <TouchableOpacity onPress={() => setEditState((s: any) => ({ ...s, cityOpen: !s.cityOpen }))} style={styles.select}>
                  <Text style={styles.selectText}>{editState.city || "Seleccionar"}</Text>
                </TouchableOpacity>
                {editState.cityOpen && (
                  <View style={styles.selectMenu}>
                    <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                      <TextInput
                        value={editState.cityQuery}
                        onChangeText={(t) => setEditState((s: any) => ({ ...s, cityQuery: t }))}
                        placeholder="Buscar ciudad"
                        placeholderTextColor={theme.textMuted}
                        style={{ paddingHorizontal: 12, paddingVertical: 10, color: theme.text }}
                      />
                    </View>
                    {cityOptions
                      .filter((c) => c.toLowerCase().includes((editState.cityQuery || "").toLowerCase()))
                      .map((c) => (
                        <TouchableOpacity key={c} onPress={() => setEditState((s: any) => ({ ...s, city: c, cityOpen: false, cityQuery: "" }))} style={styles.selectItem}>
                          <Text style={styles.selectItemText}>{c}</Text>
                        </TouchableOpacity>
                      ))}
                  </View>
                )}
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Provincia</Text>
                <TouchableOpacity onPress={() => setEditState((s: any) => ({ ...s, provinceOpen: !s.provinceOpen }))} style={styles.select}>
                  <Text style={styles.selectText}>{editState.province || "Seleccionar"}</Text>
                </TouchableOpacity>
                {editState.provinceOpen && (
                  <View style={styles.selectMenu}>
                    <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                      <TextInput
                        value={editState.provinceQuery}
                        onChangeText={(t) => setEditState((s: any) => ({ ...s, provinceQuery: t }))}
                        placeholder="Buscar provincia"
                        placeholderTextColor={theme.textMuted}
                        style={{ paddingHorizontal: 12, paddingVertical: 10, color: theme.text }}
                      />
                    </View>
                    {PROVINCES
                      .filter((p) => p.toLowerCase().includes((editState.provinceQuery || "").toLowerCase()))
                      .map((p) => (
                        <TouchableOpacity key={p} onPress={() => setEditState((s: any) => ({ ...s, province: p, provinceOpen: false, provinceQuery: "" }))} style={styles.selectItem}>
                          <Text style={styles.selectItemText}>{p}</Text>
                        </TouchableOpacity>
                      ))}
                  </View>
                )}
              </View>
            </View>
            <View style={{ width: "100%", marginTop: 8 }}>
              <Text style={styles.specLabel}>Descripción</Text>
              <TextInput value={editState.description} onChangeText={(t) => setEditState((s: any) => ({ ...s, description: t }))} style={[styles.input, { minHeight: 100 }]} placeholder="Contá el estado, servicios, extras, etc." placeholderTextColor={theme.textMuted} multiline />
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <TouchableOpacity onPress={handleSaveEdits} style={[styles.ctaButton, { paddingHorizontal: 16 }]}>
                <Text style={styles.ctaButtonText}>Guardar cambios</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditing(false)} style={styles.backPill}>
                <Text style={styles.backPillText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      case "ficha":
        return (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Editar ficha técnica</Text>
            <View style={styles.specGrid}>
              <View style={{ width: "100%" }}>
                <Text style={styles.specLabel}>Equipamiento (separado por coma)</Text>
                <TextInput value={editState.featuresText} onChangeText={(t) => setEditState((s: any) => ({ ...s, featuresText: t }))} style={styles.input} placeholder="Aire acondicionado, ABS, Airbags" placeholderTextColor={theme.textMuted} />
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Airbags (cantidad)</Text>
                <TextInput value={editState.airbags} onChangeText={(t) => setEditState((s: any) => ({ ...s, airbags: t }))} keyboardType="number-pad" style={styles.input} placeholder="2, 4, 6" placeholderTextColor={theme.textMuted} />
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Ventanas eléctricas</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {["0", "2", "4"].map((opt) => (
                    <TouchableOpacity key={opt} onPress={() => setEditState((s: any) => ({ ...s, windowsAuto: opt }))} style={[styles.select, { flex: 1, borderColor: editState.windowsAuto === opt ? theme.accent : theme.badgeBorder }]}> 
                      <Text style={[styles.selectText, { color: editState.windowsAuto === opt ? theme.accent : theme.inputText }]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Tipo de rueda</Text>
                <TextInput value={editState.wheelType} onChangeText={(t) => setEditState((s: any) => ({ ...s, wheelType: t }))} style={styles.input} placeholder="Aleación, chapa, etc." placeholderTextColor={theme.textMuted} />
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Motor</Text>
                <TextInput value={editState.engine} onChangeText={(t) => setEditState((s: any) => ({ ...s, engine: t }))} style={styles.input} placeholder="1.6 16v, 2.0 TDi, etc." placeholderTextColor={theme.textMuted} />
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <TouchableOpacity onPress={handleSaveEdits} style={[styles.ctaButton, { paddingHorizontal: 16 }]}> 
                <Text style={styles.ctaButtonText}>Guardar cambios</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditing(false)} style={styles.backPill}>
                <Text style={styles.backPillText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      case "historial":
        return (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Editar historial</Text>
            <View style={{ gap: 8 }}>
              {(editState.historyItems || []).map((it: any, idx: number) => (
                <View key={`hist-${idx}`} style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput value={it.year ?? ""} onChangeText={(t) => setEditState((s: any) => { const arr = [...(s.historyItems || [])]; arr[idx] = { ...arr[idx], year: t }; return { ...s, historyItems: arr }; })} style={[styles.input, { flex: 1 }]} placeholder="Año" placeholderTextColor={theme.textMuted} />
                  <TextInput value={it.title ?? ""} onChangeText={(t) => setEditState((s: any) => { const arr = [...(s.historyItems || [])]; arr[idx] = { ...arr[idx], title: t }; return { ...s, historyItems: arr }; })} style={[styles.input, { flex: 2 }]} placeholder="Evento" placeholderTextColor={theme.textMuted} />
                  <TextInput value={it.note ?? ""} onChangeText={(t) => setEditState((s: any) => { const arr = [...(s.historyItems || [])]; arr[idx] = { ...arr[idx], note: t }; return { ...s, historyItems: arr }; })} style={[styles.input, { flex: 3 }]} placeholder="Detalle" placeholderTextColor={theme.textMuted} />
                  <TouchableOpacity onPress={() => setEditState((s: any) => ({ ...s, historyItems: (s.historyItems || []).filter((_: any, j: number) => j !== idx) }))} style={[styles.backPill, { alignSelf: "center" }]}>
                    <Text style={styles.backPillText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity onPress={() => setEditState((s: any) => ({ ...s, historyItems: [...(s.historyItems || []), { year: "", title: "", note: "" }] }))} style={[styles.ctaButton, { paddingHorizontal: 16 }]}>
                <Text style={styles.ctaButtonText}>Agregar ítem</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <TouchableOpacity onPress={handleSaveEdits} style={[styles.ctaButton, { paddingHorizontal: 16 }]}>
                <Text style={styles.ctaButtonText}>Guardar cambios</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditing(false)} style={styles.backPill}>
                <Text style={styles.backPillText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      case "financiacion":
        return (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Editar financiación</Text>
            <View style={styles.specGrid}>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Ofrece financiación</Text>
                <TouchableOpacity onPress={() => setEditState((s: any) => ({ ...s, acceptsFinancing: !s.acceptsFinancing }))} style={[styles.select, { borderColor: editState.acceptsFinancing ? theme.accent : theme.badgeBorder }]}>
                  <Text style={[styles.selectText, { color: editState.acceptsFinancing ? theme.accent : theme.inputText }]}>{editState.acceptsFinancing ? "Sí" : "No"}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Tasa anual (%)</Text>
                <TextInput value={editState.finRate} onChangeText={(t) => setEditState((s: any) => ({ ...s, finRate: t }))} keyboardType="number-pad" style={styles.input} placeholder="25" placeholderTextColor={theme.textMuted} />
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Plazo (meses)</Text>
                <TextInput value={editState.finMonths} onChangeText={(t) => setEditState((s: any) => ({ ...s, finMonths: t }))} keyboardType="number-pad" style={styles.input} placeholder="24" placeholderTextColor={theme.textMuted} />
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <TouchableOpacity onPress={handleSaveEdits} style={[styles.ctaButton, { paddingHorizontal: 16 }]}>
                <Text style={styles.ctaButtonText}>Guardar cambios</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditing(false)} style={styles.backPill}>
                <Text style={styles.backPillText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Acciones arriba */}
      <View style={styles.topActions}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backPill}>
          <Text style={styles.backPillText}>← Volver</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleGoHome} style={styles.homePill}>
          <Text style={styles.homePillText}>🏠 Inicio</Text>
        </TouchableOpacity>
        {user?.uid && vehicle?.userId === user.uid && (
          <TouchableOpacity onPress={() => setEditing((p) => !p)} style={styles.editPill}>
            <Text style={styles.editPillText}>{editing ? "Cancelar" : "Editar"}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Hero con imágenes */}
      <View style={styles.heroContainer}>
        {images.length > 0 ? (
          <FlatList
            data={images}
            keyExtractor={(item, index) => `${item}-${index}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <Image
                source={{ uri: item }}
                style={[styles.heroImage, { width: screenWidth - 24 }]}
                contentFit="cover"
                transition={200}
                onError={(e) => console.log("Error loading detail image:", item, e.error)}
              />
            )}
          />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Text style={styles.heroPlaceholderText}>Sin imágenes del auto</Text>
          </View>
        )}

        {/* Mini overlay con título y precio */}
        <View style={styles.heroOverlay}>
          <Text style={styles.heroTitle} numberOfLines={1}>
            {displayTitle}
          </Text>
          <Text style={styles.heroPrice}>{priceText}</Text>
        </View>
      </View>

      {/* Tabs tipo “historias” */}
      <View style={styles.tabsContainer}>
        {[
          { key: "resumen", label: "Resumen" },
          { key: "ficha", label: "Ficha técnica" },
          { key: "historial", label: "Historial" },
          { key: "financiacion", label: "Financiación" },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key as CarDetailsTabs)}
            style={[
              styles.tabChip,
              activeTab === tab.key && styles.tabChipActive,
            ]}
          >
            <Text
              style={[
                styles.tabChipText,
                activeTab === tab.key && styles.tabChipTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Contenido de la pestaña */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {!editing ? (
          renderActiveTab()
        ) : (
          renderEditActiveTab()
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
      paddingHorizontal: 12,
    },
    loadingContainer: {
      flex: 1,
      backgroundColor: theme.background,
      alignItems: "center",
      justifyContent: "center",
    },
    loadingText: {
      marginTop: 8,
      color: theme.text,
    },
    errorText: {
      color: theme.error,
      fontSize: 16,
      marginBottom: 16,
      textAlign: "center",
    },
    topActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 4,
      marginBottom: 8,
    },
    backPill: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: theme.card,
    },
    backPillText: {
      color: theme.primary,
      fontWeight: "600",
    },
    homePill: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: theme.card,
    },
    homePillText: {
      color: theme.text,
      fontWeight: "600",
    },
    editPill: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: theme.primary,
    },
    editPillText: {
      color: theme.buttonText,
      fontWeight: "700",
    },
    heroContainer: {
      borderRadius: 16,
      overflow: "hidden",
      marginBottom: 8,
      backgroundColor: theme.card,
    },
    heroImage: {
      height: Dimensions.get("window").width * 0.6,
      resizeMode: "cover",
    },
    heroPlaceholder: {
      height: Dimensions.get("window").width * 0.6,
      alignItems: "center",
      justifyContent: "center",
    },
    heroPlaceholderText: {
      color: theme.textMuted,
    },
    heroOverlay: {
      position: "absolute",
      bottom: 8,
      left: 12,
      right: 12,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: "rgba(0,0,0,0.55)",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    heroTitle: {
      color: "#FFF",
      fontWeight: "700",
      fontSize: 14,
      flex: 1,
      marginRight: 8,
    },
    heroPrice: {
      color: "#FFF",
      fontWeight: "700",
      fontSize: 14,
    },
    tabsContainer: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 8,
      marginBottom: 8,
    },
    tabChip: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: theme.card,
    },
    tabChipActive: {
      backgroundColor: theme.accent,
    },
    tabChipText: {
      color: theme.text,
      fontSize: 12,
      fontWeight: "500",
    },
    tabChipTextActive: {
      color: theme.buttonText,
    },
    scrollArea: {
      flex: 1,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.badgeBorder,
      backgroundColor: theme.inputBackground,
      color: theme.inputText,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
    },
    select: {
      borderWidth: 1,
      borderColor: theme.badgeBorder,
      backgroundColor: theme.inputBackground,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 8,
      marginTop: 2,
    },
    selectText: {
      color: theme.inputText,
      fontWeight: "600",
    },
    selectMenu: {
      marginTop: 6,
      borderWidth: 1,
      borderColor: theme.badgeBorder,
      backgroundColor: theme.card,
      borderRadius: 8,
    },
    selectItem: {
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    selectItemText: {
      color: theme.text,
    },
    sectionCard: {
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
    },
    sectionTitle: {
      color: theme.title,
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 8,
    },
    carTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 4,
    },
    priceText: {
      color: theme.price,
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 10,
    },
    badgesRow: {
      flexDirection: "row",
      gap: 6,
      marginBottom: 10,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
    },
    badgeSale: {
      backgroundColor: "#22c55e33",
      borderWidth: 1,
      borderColor: "#22c55e",
    },
    badgeSwap: {
      backgroundColor: "#3b82f633",
      borderWidth: 1,
      borderColor: "#3b82f6",
    },
    badgeFinance: {
      backgroundColor: "#eab30833",
      borderWidth: 1,
      borderColor: "#eab308",
    },
    badgeText: {
      color: "#FFF",
      fontSize: 10,
      fontWeight: "700",
    },
    chipsRow: {
      flexDirection: "row",
      gap: 4,
      marginBottom: 10,
    },
    chip: {
      flex: 1,
      backgroundColor: theme.likeBox,
      borderRadius: 10,
      paddingVertical: 6,
      paddingHorizontal: 4,
      alignItems: "center",
    },
    chipLabel: {
      color: theme.textMuted,
      fontSize: 10,
      marginBottom: 2,
    },
    chipValue: {
      color: theme.text,
      fontSize: 12,
      fontWeight: "600",
      textAlign: "center",
    },
    ownerBox: {
      marginTop: 4,
    },
    ownerLabel: {
      color: theme.textMuted,
      fontSize: 12,
    },
    ownerName: {
      color: theme.text,
      fontSize: 14,
      fontWeight: "600",
    },
    ownerDate: {
      color: theme.textLight,
      fontSize: 12,
      marginTop: 2,
    },
    specGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    specItem: {
      width: "47%",
    },
    specLabel: {
      color: theme.textMuted,
      fontSize: 11,
      marginBottom: 2,
    },
    specValue: {
      color: theme.text,
      fontSize: 14,
      fontWeight: "600",
    },
    featuresWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 6,
    },
    featureTag: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: theme.likeBox,
    },
    featureText: {
      color: theme.text,
      fontSize: 11,
    },
    descriptionText: {
      color: theme.text,
      fontSize: 14,
      marginTop: 4,
    },
    mutedText: {
      color: theme.textMuted,
      fontSize: 13,
    },
    timeline: {
      marginTop: 8,
    },
    timelineItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 10,
    },
    timelineDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.accent,
      marginTop: 4,
      marginRight: 8,
    },
    timelineContent: {
      flex: 1,
    },
    timelineYear: {
      color: theme.textLight,
      fontSize: 11,
    },
    timelineTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: "600",
    },
    timelineNote: {
      color: theme.textMuted,
      fontSize: 12,
    },
    financeBox: {
      marginTop: 10,
      padding: 12,
      borderRadius: 10,
      backgroundColor: theme.likeBoxBackground,
    },
    financeRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4,
    },
    financeLabel: {
      color: theme.textMuted,
      fontSize: 12,
    },
    financeValue: {
      color: theme.text,
      fontSize: 13,
      fontWeight: "600",
    },
    financeLabelStrong: {
      color: theme.text,
      fontSize: 13,
      fontWeight: "600",
    },
    financeValueStrong: {
      color: theme.price,
      fontSize: 16,
      fontWeight: "700",
    },
    ctaButton: {
      marginTop: 14,
      backgroundColor: theme.buttonBackground,
      paddingVertical: 12,
      borderRadius: 999,
      alignItems: "center",
    },
    ctaButtonText: {
      color: theme.buttonText,
      fontWeight: "700",
      fontSize: 15,
    },
    locationText: {
      color: theme.text,
      fontSize: 14,
      marginBottom: 8,
    },
    mapPlaceholder: {
      height: 180,
      borderRadius: 12,
      backgroundColor: theme.likeBox,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 4,
    },
    mapPlaceholderText: {
      color: theme.textMuted,
      fontSize: 13,
      textAlign: "center",
      paddingHorizontal: 12,
    },
  });
