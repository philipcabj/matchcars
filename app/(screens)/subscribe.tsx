import { CustomAlert } from "@/components/CustomAlert";
import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { ENTITLEMENT_ID, useRevenueCat } from "@/contexts/RevenueCatContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Analytics } from "@/lib/analytics";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { addDoc, collection } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { PurchasesPackage } from "react-native-purchases";
import { SafeAreaView } from "react-native-safe-area-context";

// Definición de la estructura visual de los planes
type PlanDefinition = {
  id: string; // Base ID (e.g., 'pro', 'pro_plus')
  title: string;
  subtitle?: string; // e.g. "Recomendado", "Para agencias"
  features: string[];
  color: string;
  recommended?: boolean;
  packageIdMonthly: string; // ID en RevenueCat
  packageIdAnnual: string;  // ID en RevenueCat
  fallbackPriceMonthly: number;
  fallbackPriceAnnual: number;
  hasTrial?: boolean;
  comingSoon?: boolean; // New flag for future plans
};

const PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    id: "pro",
    title: "Plan PRO",
    subtitle: "Ideal para particulares activos",
    packageIdMonthly: "matchcars_pro_mensual",
    packageIdAnnual: "matchcars_pro_anual",
    fallbackPriceMonthly: 9.99,
    fallbackPriceAnnual: 79.99,
    features: [
      "🚗 Hasta 3 autos activos",
      "⭐ 2 destacados por mes (7 días c/u)",
      "🚀 Posicionamiento mejorado",
      "📊 Métricas básicas (Vistas y Likes)",
      "🏷️ Badge PRO",
      "📹 Video Walkaround",
      "✨ Mejorar foto (encuadre IA)",
    ],
    color: "#4A90E2",
    hasTrial: true,
  },
  {
    id: "pro_plus",
    title: "Plan PRO Plus",
    subtitle: "Todo lo de PRO + más potencia",
    packageIdMonthly: "matchcars_pro_plus_mensual",
    packageIdAnnual: "matchcars_pro_plus_anual",
    fallbackPriceMonthly: 19.99,
    fallbackPriceAnnual: 169.99,
    features: [
      "🚗 Hasta 7 autos activos",
      "⭐ 5 destacados por mes",
      "🚀 Boost automático fines de semana",
      "✨ Tapar patente automáticamente (IA)",
      "📄 Ficha PDF con QR",
      "📞 CRM personal de consultas",
      "📹 Video Walkaround",
      "🏷️ Badge PRO Plus",
      "✨ Mejorar foto (encuadre IA)",
    ],
    color: "#50E3C2",
    recommended: true,
    hasTrial: true,
  },
  {
    id: "pro_dealer",
    title: "Plan PRO Dealer",
    subtitle: "Solución para Agencias",
    packageIdMonthly: "matchcars_dealer_mensual",
    packageIdAnnual: "matchcars_dealer_anual",
    fallbackPriceMonthly: 59.99,
    fallbackPriceAnnual: 499.99,
    features: [
      "🚗 Hasta 30 autos activos",
      "⭐ Destacados ilimitados",
      "📞 CRM de Leads con equipo (asignación entre vendedores)",
      "💻 Portal web con 3 usuarios incluidos",
      "📥 Carga Masiva (CSV)",
      "📸 Generador de flyers para redes/WhatsApp",
      "🤝 Gestión de cierre de ventas",
      "✅ Badge Agencia Verificada",
      "📊 Reportes avanzados",
      "✨ Mejorar foto (encuadre IA)",
      "✨ Tapar patente automáticamente (IA)",
    ],
    color: "#9013FE",
    hasTrial: true,
  },
  {
    id: "dealer_pro_plus",
    title: "Dealer PRO Plus",
    subtitle: "Máxima Exposición",
    packageIdMonthly: "matchcars_dealer_pro_plus_mensual",
    packageIdAnnual: "matchcars_dealer_pro_plus_anual",
    fallbackPriceMonthly: 99,
    fallbackPriceAnnual: 899,
    features: [
      "🚗 Autos activos ILIMITADOS",
      "🚀 Prioridad absoluta en búsquedas",
      "🏠 Presencia destacada en Home",
      "📈 Panel comparativo: tu agencia vs. el promedio",
      "👥 Portal web con 5 usuarios incluidos",
      "📞 CRM de Leads con equipo",
      "✨ Mejorar foto (encuadre IA)",
      "✨ Tapar patente automáticamente (IA)",
    ],
    color: "#FFD700",
    comingSoon: true, // Volvemos a ponerlo como Coming Soon (Consultar)
    hasTrial: false,
  },
];

const COMPARISON_ROWS = [
  { label: "Autos activos",     free: "1",        pro: "3",        proPlus: "7",         dealer: "30",      dealerPro: "∞" },
  { label: "Destacados / mes",  free: "—",        pro: "2",        proPlus: "5",         dealer: "∞",       dealerPro: "∞" },
  { label: "Métricas",          free: "—",        pro: "Básicas",  proPlus: "Básicas",   dealer: "Avanzadas", dealerPro: "Avanzadas" },
  { label: "Boost fin de sem.", free: "—",        pro: "—",        proPlus: "✓",         dealer: "✓",       dealerPro: "✓" },
  { label: "Video walkaround",  free: "—",        pro: "✓",        proPlus: "✓",         dealer: "✓",       dealerPro: "✓" },
  { label: "Mejorar foto (IA)", free: "—",        pro: "✓",        proPlus: "✓",         dealer: "✓",       dealerPro: "✓" },
  { label: "Tapar patente (IA)", free: "—",        pro: "—",        proPlus: "✓",         dealer: "✓",       dealerPro: "✓" },
  { label: "Marca de agua (logo)", free: "—",      pro: "✓",        proPlus: "✓",         dealer: "✓",       dealerPro: "✓" },
  { label: "CRM de Leads",      free: "—",        pro: "—",        proPlus: "Personal",  dealer: "Con equipo", dealerPro: "Con equipo" },
  { label: "Carga masiva CSV",  free: "—",        pro: "—",        proPlus: "—",         dealer: "✓",       dealerPro: "✓" },
  { label: "Usuarios de portal", free: "—",       pro: "—",        proPlus: "—",         dealer: "3",       dealerPro: "5" },
  { label: "Generador de flyers", free: "—",      pro: "—",        proPlus: "—",         dealer: "✓",       dealerPro: "✓" },
  { label: "Panel comparativo", free: "—",        pro: "—",        proPlus: "—",         dealer: "—",       dealerPro: "✓" },
];

function ComparisonTable({ theme }: { theme: any }) {
  const [expanded, setExpanded] = React.useState(false);
  const cols = ["Gratis", "PRO", "PRO+", "Dealer", "D.Pro+"];
  const colColors = ["#888", "#4A90E2", "#50E3C2", "#9013FE", "#FFD700"];

  return (
    <View style={{ marginBottom: 24 }}>
      <TouchableOpacity
        onPress={() => setExpanded((p) => !p)}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 }}
      >
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={theme.accent} />
        <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 13 }}>
          {expanded ? "Ocultar comparativa" : "Ver comparativa de planes"}
        </Text>
      </TouchableOpacity>
      {expanded && (
        <View style={{ backgroundColor: theme.card, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: theme.badgeBorder }}>
          {/* Header row */}
          <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: theme.badgeBorder }}>
            <View style={{ flex: 2, padding: 8 }} />
            {cols.map((col, i) => (
              <View key={col} style={{ flex: 1.5, padding: 8, alignItems: "center" }}>
                <Text style={{ color: colColors[i], fontSize: 10, fontWeight: "800" }} numberOfLines={1}>{col}</Text>
              </View>
            ))}
          </View>
          {/* Data rows */}
          {COMPARISON_ROWS.map((row, ri) => (
            <View
              key={row.label}
              style={{ flexDirection: "row", backgroundColor: ri % 2 === 0 ? "transparent" : `${theme.accent}08`, borderBottomWidth: ri < COMPARISON_ROWS.length - 1 ? 1 : 0, borderBottomColor: theme.badgeBorder }}
            >
              <View style={{ flex: 2, padding: 8, justifyContent: "center" }}>
                <Text style={{ color: theme.text, fontSize: 11 }}>{row.label}</Text>
              </View>
              {[row.free, row.pro, row.proPlus, row.dealer, row.dealerPro].map((val, i) => (
                <View key={i} style={{ flex: 1.5, padding: 8, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: val === "—" ? theme.textMuted : val === "✓" ? "#2ECC71" : colColors[i], fontSize: 11, fontWeight: val !== "—" ? "700" : "400" }}>
                    {val}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function SubscribeScreen() {
  const { theme } = useTheme();
  const { user, profile, updatePlan } = useAuth();
  const { currentOffering, purchasePackage, isReady, restorePurchases, debugInfo, checkTrialOrIntroductoryPriceEligibility } = useRevenueCat();
  const router = useRouter();
  
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [trialEligibility, setTrialEligibility] = useState<{[key: string]: any}>({});

  useEffect(() => {
    const checkEligibility = async () => {
      if (currentOffering && currentOffering.availablePackages.length > 0) {
        const productIds = currentOffering.availablePackages.map(p => p.product.identifier);
        const eligibility = await checkTrialOrIntroductoryPriceEligibility(productIds);
        setTrialEligibility(eligibility);
      }
    };
    if (isReady) {
        checkEligibility();
    }
  }, [currentOffering, isReady]);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info" as "success" | "error" | "info",
    onClose: () => {},
    showCancel: false,
    onCancel: () => {},
    confirmText: "Entendido",
    cancelText: "Cancelar"
  });

  const showAlert = (
    title: string,
    message: string,
    type: "success" | "error" | "info" = "info",
    onClose?: () => void,
    showCancel = false,
    onCancel?: () => void,
    confirmText = "Entendido",
    cancelText = "Cancelar"
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
      cancelText
    });
  };

  const isAdmin = profile?.role === 'admin';
  const isPro = profile?.plan && profile.plan !== "free";

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push("/(tabs)");
    }
  };

  const [consultingPlan, setConsultingPlan] = useState<string | null>(null);
  const [consultationText, setConsultationText] = useState("");
  const [sendingConsultation, setSendingConsultation] = useState(false);

  const handleConsultation = async () => {
    if (!user || !consultingPlan) return;
    
    // Track consultation interest
    try {
      Analytics.logEvent('consultation_inquiry', {
        plan_id: consultingPlan,
        user_id: user.uid,
        current_plan: profile?.plan || 'free',
      });
    } catch (e) {
      logger.warn('[Subscribe] Error logging consultation:', e);
    }
    
    setSendingConsultation(true);
    try {
      // Create a document in the 'mail' collection which is already configured with Trigger Email extension
      // and likely has correct permissions for authenticated users.
      const mailDoc = {
        to: ["matchcarsinfo@gmail.com"],
        from: "Matchcars <noreply@matchcars.app>",
        message: {
          subject: `Nueva consulta de Plan: ${consultingPlan}`,
          text: `El usuario ${user.email} está interesado en el plan ${consultingPlan}.\n\nNombre: ${profile?.firstName ? `${profile.firstName} ${profile.lastName}` : user.displayName || "Usuario"}\nID Usuario: ${user.uid}\nMensaje: ${consultationText}`,
          html: `
            <h3>Nueva consulta de Plan PRO</h3>
            <p>El usuario <b>${user.email}</b> está interesado en el plan <b>${consultingPlan}</b>.</p>
            <p><b>Nombre:</b> ${profile?.firstName ? `${profile.firstName} ${profile.lastName}` : user.displayName || "Usuario"}</p>
            <p><b>ID Usuario:</b> ${user.uid}</p>
            <p><b>Mensaje:</b> ${consultationText}</p>
          `
        },
        createdAt: new Date(),
        // Also keep a record in a separate collection if possible, but let's prioritize the email first
        metadata: {
          userId: user.uid,
          userEmail: user.email,
          type: "plan_consultation",
          planId: consultingPlan
        }
      };

      await addDoc(collection(db, "mail"), mailDoc);

      // Close the modal FIRST
      setConsultingPlan(null);
      setConsultationText("");

      // Then show the success alert
      setTimeout(() => {
        showAlert(
          "Consulta enviada", 
          "Tu interés ha sido registrado. Un asesor se pondrá en contacto con vos a la brevedad para brindarte más información sobre el plan Dealer PRO Plus.",
          "success"
        );
      }, 100);
    } catch (e: any) {
      console.error(e);
      showAlert("Error", "No pudimos enviar tu consulta en este momento. Por favor intentá más tarde.", "error");
    } finally {
      setSendingConsultation(false);
    }
  };

  const handleConsultationButtonClick = (planId: string) => {
    if (!user) {
        router.push("/login");
        return;
    }
    setConsultingPlan(planId);
  };

  const handleSubscribe = async (pack: PurchasesPackage | undefined, planId: string) => {
    if (!user) {
      router.push("/login");
      return;
    }

    if (purchasing) return;

    // --- ADMIN BYPASS ---
    if (isAdmin) {
      showAlert(
        "Modo Admin",
        `¿Asignar plan ${planId} (${billingCycle}) gratis?`,
        "info",
        async () => {
          try {
            setPurchasing(true);
            const internalPlanId = `${planId}_${billingCycle}` as any;
            
            // Track admin assignment as conversion
            const currentPlan = profile?.plan || 'free';
            Analytics.logPlanConversion(currentPlan, planId, 'admin_assign', billingCycle);
            
            await updatePlan(internalPlanId, billingCycle);
            showAlert("Admin", "Plan asignado correctamente.", "success", () => router.back());
          } catch (e) {
            showAlert("Error", "Fallo al asignar plan: " + e, "error");
          } finally {
            setPurchasing(false);
          }
        },
        true,
        () => {},
        "Confirmar",
        "Cancelar"
      );
      return;
    }

    // --- NORMAL FLOW (RevenueCat) ---
    if (!pack) return; // Should not happen given UI logic, but safety check

    setPurchasing(true);
    
    // Track conversion attempt (before the purchase to capture intent)
    try {
      const currentPlan = profile?.plan || 'free';
      Analytics.logPlanConversion(currentPlan, planId, 'subscribe_screen', billingCycle);
    } catch (e) {
      logger.warn('[Subscribe] Error logging plan conversion:', e);
    }
    
    try {
      const { customerInfo } = await purchasePackage(pack);
      
      // Track Purchase in Meta Analytics
      Analytics.logPurchasePro(planId, pack.product.price, pack.product.currencyCode);

      // Sincronizar con Firestore
      // Determinamos el ID interno según la lógica de tipos actual
      let internalPlanId: any = planId;
      
      if (planId === "pro" || planId === "pro_plus" || planId === "pro_dealer") {
         internalPlanId = `${planId}_${billingCycle}`;
      }

      // Obtener fecha de expiración real desde RevenueCat (maneja trials correctamente)
      // Buscamos en entitlements activos
      const entitlement = customerInfo?.entitlements.active[ENTITLEMENT_ID]; // Asegurarse que coincida con ENTITLEMENT_ID
      const expirationDate = entitlement?.expirationDate 
        ? new Date(entitlement.expirationDate) 
        : undefined;

      await updatePlan(internalPlanId, billingCycle, expirationDate);

      showAlert("¡Éxito!", "Suscripción activada correctamente.", "success", () => router.back());
    } catch (error: any) {
      if (!error.userCancelled) {
        showAlert("Error", "No se pudo procesar la compra. Intenta nuevamente.", "error");
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleDowngradeToFree = async () => {
    if (!user) {
      router.push("/login");
      return;
    }

    if (purchasing) return;

    showAlert(
      "Volver al plan gratuito",
      "La facturación se gestiona desde la tienda (App Store / Google Play). Este cambio solo actualiza tu plan dentro de Matchcars.\n\n¿Querés continuar?",
      "info",
      async () => {
        try {
          setPurchasing(true);
          await updatePlan("free");
          showAlert("Listo", "Volviste al plan gratuito.", "success", () => router.back());
        } catch {
          showAlert("Error", "No se pudo cambiar el plan. Intentá de nuevo.", "error");
        } finally {
          setPurchasing(false);
        }
      },
      true,
      () => {},
      "Sí, volver al gratis",
      "Cancelar"
    );
  };

  const handleRestorePurchases = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      await restorePurchases();
      showAlert("Restaurado", "Tus compras han sido restauradas.", "success");
    } catch (e) {
      showAlert("Aviso", "No se encontraron compras para restaurar o hubo un error.", "info");
    } finally {
      setRestoring(false);
    }
  };

  // Helper para buscar el paquete de RevenueCat
  const getPackage = (identifier: string): PurchasesPackage | undefined => {
    return currentOffering?.availablePackages.find(p => p.identifier === identifier);
  };

  // if (!isReady && !isAdmin) {
  //   return (
  //     <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center" }}>
  //        <ActivityIndicator size="large" color={theme.accent} />
  //     </SafeAreaView>
  //   );
  // }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header title="Planes" showBack onBackPress={handleBack} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: theme.text, fontSize: 16, textAlign: "center", marginBottom: 24 }}>
          {isAdmin ? "MODO ADMIN ACTIVADO: Selección directa habilitada" : "Elegí el plan que mejor se adapte a tus necesidades y potenciá tus ventas."}
        </Text>

        {/* Modal de Consulta */}
        <Modal
          visible={!!consultingPlan}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setConsultingPlan(null)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400 }}>
                <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', marginBottom: 8 }}>Solicitar Información</Text>
                <Text style={{ color: theme.textMuted, fontSize: 14, marginBottom: 20 }}>
                    Dejanos un mensaje y un asesor te contactará para brindarte detalles exclusivos sobre el plan {PLAN_DEFINITIONS.find(p => p.id === consultingPlan)?.title}.
                </Text>
                
                <TextInput
                    value={consultationText}
                    onChangeText={setConsultationText}
                    placeholder="Escribí tu mensaje aquí (opcional)..."
                    placeholderTextColor={theme.textMuted}
                    multiline
                    numberOfLines={4}
                    style={{
                        backgroundColor: theme.inputBackground,
                        color: theme.text,
                        borderRadius: 12,
                        padding: 12,
                        height: 120,
                        textAlignVertical: 'top',
                        marginBottom: 20,
                        borderWidth: 1,
                        borderColor: theme.badgeBorder
                    }}
                />

                <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity 
                        onPress={() => setConsultingPlan(null)}
                        style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: theme.inputBackground }}
                    >
                        <Text style={{ color: theme.text, fontWeight: '700' }}>Cancelar</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                        onPress={handleConsultation}
                        disabled={sendingConsultation}
                        style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: theme.accent }}
                    >
                        {sendingConsultation ? (
                            <ActivityIndicator color="#FFF" />
                        ) : (
                            <Text style={{ color: "#FFF", fontWeight: '700' }}>Enviar Consulta</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
          </View>
        </Modal>

        {/* Toggle Mensual / Anual */}
        <View style={{ flexDirection: "row", justifyContent: "center", marginBottom: 24 }}>
          <View style={{ flexDirection: "row", backgroundColor: theme.card, borderRadius: 20, padding: 4, borderWidth: 1, borderColor: theme.badgeBorder }}>
            <TouchableOpacity
              onPress={() => setBillingCycle("monthly")}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 16,
                backgroundColor: billingCycle === "monthly" ? theme.accent : "transparent",
              }}
            >
              <Text style={{ color: billingCycle === "monthly" ? "#FFF" : theme.text, fontWeight: "600" }}>Mensual</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setBillingCycle("annual")}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 16,
                backgroundColor: billingCycle === "annual" ? theme.accent : "transparent",
                flexDirection: "row",
                alignItems: "center",
                gap: 4
              }}
            >
              <Text style={{ color: billingCycle === "annual" ? "#FFF" : theme.text, fontWeight: "600" }}>Anual</Text>
              <View style={{ backgroundColor: "#2ECC71", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "800" }}>AHORRA</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabla Comparativa */}
        <ComparisonTable theme={theme} />

        <View style={{ gap: 20 }}>
          {PLAN_DEFINITIONS.map((planDef) => {
            const packageId = billingCycle === "monthly" ? planDef.packageIdMonthly : planDef.packageIdAnnual;
            const rcPackage = getPackage(packageId);
            const product = rcPackage?.product;
            const introPrice = product?.introPrice;
            
            // Verificar elegibilidad (status 2 = ELIGIBLE)
            const eligibilityData = trialEligibility[product?.identifier || ""];
            const isEligible = eligibilityData?.status === 2;

            // Detectar si hay prueba gratis real configurada en la tienda y el usuario es elegible
            const hasFreeTrial = introPrice && introPrice.price === 0 && isEligible;

            // Formatear duración del trial
            let trialDurationText = "7 días"; // Default fallback
            if (hasFreeTrial) {
                const unit = introPrice.periodUnit;
                const count = introPrice.periodNumberOfUnits;
                // Mapeo simple (RevenueCat devuelve strings en versiones recientes, pero por seguridad...)
                // @ts-ignore - RevenueCat types might vary between versions
                if (unit === 'DAY' || unit === 0) trialDurationText = `${count} días`;
                // @ts-ignore
                else if (unit === 'WEEK' || unit === 1) trialDurationText = `${count} ${count === 1 ? 'semana' : 'semanas'}`;
                // @ts-ignore
                else if (unit === 'MONTH' || unit === 2) trialDurationText = `${count} ${count === 1 ? 'mes' : 'meses'}`;
                // @ts-ignore
                else if (unit === 'YEAR' || unit === 3) trialDurationText = `${count} ${count === 1 ? 'año' : 'años'}`;
            }

            // Lógica de precio para mostrar
            const priceString = product 
                ? product.priceString 
                : `USD $${billingCycle === "monthly" ? planDef.fallbackPriceMonthly : planDef.fallbackPriceAnnual}`;

            const period = billingCycle === "monthly" ? "/ mes" : "/ año";
            
            // Strip billing cycle suffix before comparing so "pro_monthly" matches planDef.id "pro"
            // but "pro_plus_monthly" does NOT match planDef.id "pro"
            const planBase = (profile?.plan || "").replace(/_monthly$|_annual$/, "");
            const isCurrentPlan = !!profile?.plan && planBase === planDef.id;

            // Decidir si mostramos el badge de trial
            const showTrialBadge = hasFreeTrial || (!rcPackage && planDef.hasTrial);

            return (
              <View 
                key={planDef.id} 
                style={{
                  backgroundColor: theme.card,
                  borderRadius: 24,
                  padding: 24,
                  borderWidth: isCurrentPlan ? 2.5 : 1,
                  borderColor: isCurrentPlan ? planDef.color : theme.badgeBorder,
                  position: "relative",
                  opacity: planDef.comingSoon ? 0.7 : isCurrentPlan ? 1 : 0.72,
                  shadowColor: isCurrentPlan ? planDef.color : "transparent",
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: isCurrentPlan ? 0.35 : 0,
                  shadowRadius: isCurrentPlan ? 12 : 0,
                  elevation: isCurrentPlan ? 6 : 0,
                }}
              >
                {isCurrentPlan && (
                  <View style={{ position: "absolute", top: -12, left: 24, backgroundColor: "#2ECC71", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="checkmark-circle" size={12} color="#FFF" />
                    <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 12 }}>TU PLAN ACTUAL</Text>
                  </View>
                )}

                {planDef.recommended && !isCurrentPlan && (
                  <View style={{ position: "absolute", top: -12, right: 24, backgroundColor: planDef.color, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
                    <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 12 }}>RECOMENDADO</Text>
                  </View>
                )}

                {planDef.comingSoon && (
                  <View style={{ position: "absolute", top: -12, right: 24, backgroundColor: "#555", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
                    <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 12 }}>CONSULTAR</Text>
                  </View>
                )}

                <View>
                  <Text style={{ color: planDef.color, fontWeight: "800", fontSize: 24, textTransform: "uppercase" }}>
                    {planDef.title}
                  </Text>
                  {planDef.subtitle && (
                    <Text style={{ color: theme.textMuted, fontSize: 14, marginTop: 4 }}>
                      {planDef.subtitle}
                    </Text>
                  )}
                  {showTrialBadge && !planDef.comingSoon && (
                    <View style={{ alignSelf: "flex-start", marginTop: 4, backgroundColor: "#E8F5E9", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ color: "#2E7D32", fontSize: 10, fontWeight: "700" }}>
                            PRUEBA {hasFreeTrial ? trialDurationText.toUpperCase() : "7 DÍAS"} GRATIS
                        </Text>
                    </View>
                  )}
                  <View style={{ marginTop: 4 }}>
                      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                        <Text style={{ color: theme.text, fontSize: 28, fontWeight: "800" }}>
                          {planDef.comingSoon ? "Consultar" : priceString}
                        </Text>
                        {!planDef.comingSoon && (
                          <Text style={{ color: theme.textMuted, fontSize: 14, fontWeight: "600", marginLeft: 4 }}>
                            {period}
                          </Text>
                        )}
                      </View>
                      {showTrialBadge && !planDef.comingSoon && (
                          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                              Después de la prueba, se renovará automáticamente.
                          </Text>
                      )}
                  </View>
                  
                  <View style={{ marginTop: 16, gap: 10 }}>
                    {planDef.features.map((feature, i) => (
                      <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                        <Ionicons name="checkmark-circle" size={18} color={planDef.color} />
                        <Text style={{ color: theme.text, fontSize: 14, flex: 1 }}>{feature}</Text>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    disabled={purchasing || isCurrentPlan}
                    onPress={() => {
                        if (planDef.comingSoon || !rcPackage) {
                            handleConsultationButtonClick(planDef.id);
                        } else {
                            handleSubscribe(rcPackage, planDef.id);
                        }
                    }}
                    style={{
                      backgroundColor: isCurrentPlan ? "#2ECC71" : planDef.color,
                      borderRadius: 12,
                      paddingVertical: 14,
                      marginTop: 20,
                      alignItems: "center",
                      opacity: isCurrentPlan ? 0.85 : 1,
                    }}
                  >
                    {purchasing ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 16 }}>
                        {isCurrentPlan
                           ? "✓ Tu plan actual"
                           : isAdmin && rcPackage
                             ? "Asignar Gratis (Admin)"
                             : planDef.comingSoon || !rcPackage
                               ? "Solicitar cambio de plan"
                               : showTrialBadge ? "Comenzar Prueba Gratis" : "Suscribirme"
                        }
                        </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>

        {isPro && (
          <View style={{ marginTop: 32, alignItems: "center" }}>
            <Text style={{ color: theme.textMuted, fontSize: 12, textAlign: "center", marginBottom: 8 }}>
              ¿Ya no querés un plan PRO? Podés volver al plan gratuito cuando quieras.
            </Text>
            <TouchableOpacity
              onPress={handleDowngradeToFree}
              disabled={purchasing}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: theme.textMuted,
                backgroundColor: theme.background,
              }}
            >
              <Text style={{ color: theme.textMuted, fontWeight: "700", fontSize: 12 }}>
                Volver al plan gratuito
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Enlaces Legales (Requerido por Apple) */}
        <View style={{ marginTop: 40, paddingBottom: 20, alignItems: 'center' }}>
          
          <TouchableOpacity 
            onPress={handleRestorePurchases}
            disabled={restoring}
            style={{ marginBottom: 20, padding: 10 }}
          >
             <Text style={{ color: theme.accent, fontSize: 14, fontWeight: "600" }}>
               {restoring ? "Restaurando..." : "Restaurar Compras"}
             </Text>
          </TouchableOpacity>

          <Text style={{ color: theme.textMuted, fontSize: 11, textAlign: "center", marginBottom: 16, paddingHorizontal: 20 }}>
            El pago se cargará a tu cuenta de Apple ID o Google Play al confirmar la compra. 
            La suscripción se renueva automáticamente a menos que se cancele al menos 24 horas antes del final del período actual. 
            Podés gestionar y cancelar tus suscripciones desde la configuración de tu cuenta en la tienda de aplicaciones.
          </Text>

          <View style={{ flexDirection: 'row', gap: 20 }}>
            <TouchableOpacity onPress={() => router.push("/legal-terms" as any)}>
              <Text style={{ color: theme.textMuted, fontSize: 12, textDecorationLine: 'underline' }}>
                Términos de Uso
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/privacy" as any)}>
              <Text style={{ color: theme.textMuted, fontSize: 12, textDecorationLine: 'underline' }}>
                Política de Privacidad
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <CustomAlert {...alertConfig} />
      {/* Debug Info para Admins */}
      {isAdmin && (
          <View style={{ padding: 16, marginTop: 20, backgroundColor: "#000", borderRadius: 8 }}>
              <Text style={{ color: "#0F0", fontWeight: "bold", marginBottom: 8 }}>[DEBUG INFO]</Text>
              <Text style={{ color: "#FFF", fontSize: 10 }}>Configured: {debugInfo?.isConfigured ? 'YES' : 'NO'}</Text>
              <Text style={{ color: "#FFF", fontSize: 10 }}>Init Error: {debugInfo?.initError || 'None'}</Text>
              <Text style={{ color: "#FFF", fontSize: 10 }}>Offerings Found: {debugInfo?.allOfferings.join(', ') || 'None'}</Text>
              <Text style={{ color: "#FFF", fontSize: 10 }}>Current Offering: {currentOffering?.identifier || 'NULL'}</Text>
              <Text style={{ color: "#FFF", fontSize: 10 }}>Packages: {currentOffering?.availablePackages.map(p => p.identifier).join(', ') || 'None'}</Text>
          </View>
      )}
      <View style={{ height: 40 }} />
    </SafeAreaView>
  );
}
