import { CustomAlert } from "@/components/CustomAlert";
import { Header } from "@/components/Header";
import { CarCard } from "@/components/cards/carcard";
import { useAuth } from "@/contexts/AuthContext";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function BoostScreen() {
  const { id } = useLocalSearchParams();
  const { theme } = useTheme();
  const router = useRouter();
  const { user, profile } = useAuth();
  const { currentOffering, purchasePackage } = useRevenueCat();
  
  const [vehicle, setVehicle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ 
    visible: false, 
    title: "", 
    message: "", 
    type: "info" as "success" | "error" | "info" | "warning",
    onClose: () => {}
  });

  const showAlert = (title: string, message: string, type: "success" | "error" | "info" | "warning" = "info", onClose = () => {}) => {
    setAlertConfig({ visible: true, title, message, type, onClose });
  };

  const closeAlert = () => {
    setAlertConfig(prev => ({ ...prev, visible: false }));
    if (alertConfig.onClose) alertConfig.onClose();
  };

  useEffect(() => {
    if (id) fetchVehicle();
  }, [id]);

  const fetchVehicle = async () => {
    try {
      const docRef = doc(db, "vehicles", id as string);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setVehicle({ id: snap.id, ...snap.data() });
      } else {
        showAlert("Error", "Auto no encontrado", "error", () => router.back());
      }
    } catch (e) {
        console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (purchasing) return;
    
    // Buscar paquete en RevenueCat (identificador hipotético)
    const pkg = currentOffering?.availablePackages.find(p => p.identifier === "matchcars_boost_7days"); 
    
    // Fallback para Admin o Desarrollo si no hay paquete configurado
    const isAdmin = profile?.role === 'admin';
    
    if (!pkg && !isAdmin) {
        showAlert("No disponible", "El paquete de Boost no está disponible actualmente en la tienda.", "warning");
        return;
    }

    setPurchasing(true);
    try {
        if (pkg) {
            await purchasePackage(pkg);
        } else if (isAdmin) {
            // Simulación para admin
            await new Promise(r => setTimeout(r, 1000));
        }

        // Success: Update Firestore
        const ref = doc(db, "vehicles", id as string);
        await updateDoc(ref, {
            isFeatured: true,
            featuredAt: serverTimestamp(),
            boostType: "paid_7_days"
        });
        
        showAlert("¡Éxito!", "Tu auto ha sido destacado por 7 días.", "success", () => router.push("/(tabs)/mycars"));
    } catch (e: any) {
        if (!e.userCancelled) {
            showAlert("Error", "No se pudo completar la compra.", "error");
        }
    } finally {
        setPurchasing(false);
    }
  };

  if (loading) return <ActivityIndicator style={{flex:1, backgroundColor: theme.background}} color={theme.accent} />;
  if (!vehicle) return null;

  // Precio a mostrar (mock si no hay paquete)
  const pkg = currentOffering?.availablePackages.find(p => p.identifier === "matchcars_boost_7days");
  const priceString = pkg?.product.priceString || "USD $4.99";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header title="Potenciar Publicación" showBack />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: theme.text, fontSize: 16, marginBottom: 16, lineHeight: 22 }}>
            Destacá tu auto para que aparezca primero en las búsquedas y vendas más rápido.
        </Text>
        
        <View style={{ pointerEvents: "none", opacity: 0.9, marginBottom: 24 }}>
             <CarCard vehicle={vehicle} hideLike />
        </View>

        <View style={{ backgroundColor: theme.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: theme.accent, elevation: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Boost Semanal</Text>
                <View style={{ backgroundColor: "#FFD700", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                    <Text style={{ color: "#000", fontWeight: "800", fontSize: 12 }}>PREMIUM</Text>
                </View>
            </View>
            
            <View style={{ gap: 12, marginBottom: 24 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ backgroundColor: theme.badgeBackground, padding: 6, borderRadius: 8 }}>
                        <Ionicons name="rocket" size={20} color={theme.accent} />
                    </View>
                    <Text style={{ color: theme.text, flex: 1 }}>Posicionamiento prioritario en listados</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ backgroundColor: theme.badgeBackground, padding: 6, borderRadius: 8 }}>
                        <Ionicons name="eye" size={20} color={theme.accent} />
                    </View>
                    <Text style={{ color: theme.text, flex: 1 }}>Hasta 5x más visitas de interesados</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ backgroundColor: theme.badgeBackground, padding: 6, borderRadius: 8 }}>
                        <Ionicons name="time" size={20} color={theme.accent} />
                    </View>
                    <Text style={{ color: theme.text, flex: 1 }}>Duración: 7 días corridos</Text>
                </View>
            </View>

            <TouchableOpacity 
                onPress={handlePurchase}
                disabled={purchasing}
                style={{ backgroundColor: theme.accent, paddingVertical: 16, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
            >
                {purchasing ? (
                    <ActivityIndicator color="#FFF" />
                ) : (
                    <>
                        <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "700" }}>
                            Contratar por {priceString}
                        </Text>
                        <Ionicons name="arrow-forward" size={20} color="#FFF" />
                    </>
                )}
            </TouchableOpacity>
            <Text style={{ textAlign: "center", color: theme.textMuted, fontSize: 12, marginTop: 12 }}>
                Pago único. No es una suscripción recurrente.
            </Text>
        </View>

      </ScrollView>

      <CustomAlert 
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={closeAlert}
      />
    </SafeAreaView>
  );
}
