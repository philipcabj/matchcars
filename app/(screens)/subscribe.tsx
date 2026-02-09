import { CustomAlert } from "@/components/CustomAlert";
import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { ENTITLEMENT_ID, useRevenueCat } from "@/contexts/RevenueCatContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { PurchasesPackage } from "react-native-purchases";
import { SafeAreaView } from "react-native-safe-area-context";

// Definición de la estructura visual de los planes
type PlanDefinition = {
  id: string; // Base ID (e.g., 'pro', 'pro_plus')
  title: string;
  features: string[];
  color: string;
  recommended?: boolean;
  packageIdMonthly: string; // ID en RevenueCat
  packageIdAnnual: string;  // ID en RevenueCat
  fallbackPriceMonthly: number;
  fallbackPriceAnnual: number;
  hasTrial?: boolean;
};

const PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    id: "pro",
    title: "PRO",
    packageIdMonthly: "matchcars_pro_mensual",
    packageIdAnnual: "matchcars_pro_anual",
    fallbackPriceMonthly: 4.99,
    fallbackPriceAnnual: 34.99,
    features: [
      "⭐ 3 destacados por mes (7 días c/u)",
      "🚀 Posicionamiento mejorado",
      "📊 Vistas y Likes en tus autos",
      "🏷️ Badge PRO",
      "📹 Video Walkaround",
      "🚗 Autos ilimitados",
    ],
    color: "#4A90E2",
    hasTrial: true,
  },
  {
    id: "pro_plus",
    title: "PRO Plus",
    packageIdMonthly: "matchcars_pro_plus_mensual",
    packageIdAnnual: "matchcars_pro_plus_anual",
    fallbackPriceMonthly: 9.99,
    fallbackPriceAnnual: 69.99,
    features: [
      "⭐ 6 destacados por mes (7 días c/u)",
      "🚀 Posicionamiento + Fines de semana",
      "📈 Análisis de Precio de Mercado",
      "📄 Ficha PDF con QR para imprimir",
      "📊 Vistas y Likes",
      "🏷️ Badge PRO",
      "📹 Video Walkaround",
      "📩 Contacto prioritario",
      "🚗 Autos ilimitados",
    ],
    color: "#50E3C2",
    recommended: true,
    hasTrial: true,
  },
  {
    id: "pro_dealer",
    title: "PRO Dealer",
    packageIdMonthly: "matchcars_dealer_mensual",
    packageIdAnnual: "matchcars_dealer_anual",
    fallbackPriceMonthly: 19.99,
    fallbackPriceAnnual: 143.99,
    features: [
      "⭐ Destacados ilimitados (7 días c/u)",
      "🚀 Posicionamiento Máximo",
      "📈 Análisis de Precio y Sugerencias",
      "📊 Reportes de Rendimiento",
      "📄 Ficha PDF con QR para imprimir",
      "✅ Badge Agencia Verificada",
      "📹 Video Walkaround",
      "👥 Gestión multi-auto",
      "📩 Contacto prioritario",
      "🚗 Autos ilimitados",
    ],
    color: "#9013FE",
    hasTrial: true,
  },
];

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
    try {
      const { customerInfo } = await purchasePackage(pack);

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
            
            // Si es admin, siempre habilitado. Si es usuario, depende de si hay paquete RC.
            const isButtonEnabled = isAdmin || !!rcPackage;
            
            // Decidir si mostramos el badge de trial
            // Mostramos si RevenueCat dice que hay trial, O si estamos en modo fallback y la definición dice que hay trial
            const showTrialBadge = hasFreeTrial || (!rcPackage && planDef.hasTrial);

            return (
              <View
                key={planDef.id}
                style={{
                  backgroundColor: theme.card,
                  borderRadius: 16,
                  borderWidth: 2,
                  borderColor: planDef.recommended ? planDef.color : "transparent",
                  overflow: "hidden",
                  elevation: 4,
                  shadowColor: "#000",
                  shadowOpacity: 0.1,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                  opacity: isButtonEnabled ? 1 : 0.6, 
                }}
              >
                {planDef.recommended && (
                  <View style={{ backgroundColor: planDef.color, paddingVertical: 4, alignItems: "center" }}>
                    <Text style={{ color: "#000", fontSize: 12, fontWeight: "800", textTransform: "uppercase" }}>
                      Recomendado
                    </Text>
                  </View>
                )}
                <View style={{ padding: 20 }}>
                  <Text style={{ color: planDef.color, fontSize: 14, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 }}>
                    {planDef.title}
                  </Text>
                  {showTrialBadge && (
                    <View style={{ alignSelf: "flex-start", marginTop: 4, backgroundColor: "#E8F5E9", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ color: "#2E7D32", fontSize: 10, fontWeight: "700" }}>
                            PRUEBA {hasFreeTrial ? trialDurationText.toUpperCase() : "7 DÍAS"} GRATIS
                        </Text>
                    </View>
                  )}
                  <View style={{ marginTop: 4 }}>
                      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                        <Text style={{ color: theme.text, fontSize: 28, fontWeight: "800" }}>
                          {priceString}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 14, fontWeight: "600", marginLeft: 4 }}>
                          {period}
                        </Text>
                      </View>
                      {showTrialBadge && (
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
                    disabled={purchasing || !isButtonEnabled}
                    onPress={() => handleSubscribe(rcPackage, planDef.id)}
                    style={{
                      backgroundColor: (!isButtonEnabled) ? theme.textMuted : planDef.color,
                      borderRadius: 12,
                      paddingVertical: 14,
                      marginTop: 20,
                      alignItems: "center",
                    }}
                  >
                    {purchasing ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 16 }}>
                        {!isButtonEnabled 
                            ? "No disponible" 
                            : (isAdmin 
                                ? "Asignar Gratis (Admin)" 
                                : (showTrialBadge ? "Comenzar Prueba Gratis" : "Suscribirme")
                              )
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
