/**
 * Pantalla de verificación de identidad.
 *
 * Integración con MetaMap (getmati.com):
 * 1. Crear cuenta en app.getmati.com → obtener CLIENT_ID y FLOW_ID
 * 2. Agregar a .env:  EXPO_PUBLIC_METAMAP_CLIENT_ID y EXPO_PUBLIC_METAMAP_FLOW_ID
 * 3. npm install react-native-metamap (y seguir su guía de configuración nativa)
 * 4. Descomentar el bloque marcado con TODO abajo
 */
import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type KycStatus = "idle" | "pending" | "verified" | "failed";

const STEPS = [
  { icon: "camera-outline", label: "Foto del DNI (frente y dorso)" },
  { icon: "person-outline", label: "Selfie con verificación de vida" },
  { icon: "checkmark-circle-outline", label: "Validación automática (~30 seg)" },
];

export default function VerifyIdentityScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();

  const [status, setStatus] = useState<KycStatus>("idle");
  const [saving, setSaving] = useState(false);

  const startVerification = async () => {
    if (!user) return;
    setStatus("pending");

    /**
     * TODO: Integrar MetaMap SDK aquí.
     *
     * import MetaMapRNSdk from "react-native-metamap";
     *
     * MetaMapRNSdk.showMetaMapFlow(
     *   process.env.EXPO_PUBLIC_METAMAP_CLIENT_ID!,
     *   process.env.EXPO_PUBLIC_METAMAP_FLOW_ID!,
     *   { fixedLanguage: "es" },
     *   async (result) => {
     *     if (result.identityId) {
     *       await markVerified(result.identityId);
     *     } else {
     *       setStatus("failed");
     *     }
     *   }
     * );
     *
     * Por ahora simula el flujo para desarrollo.
     */
    await new Promise((r) => setTimeout(r, 1500));
    setStatus("failed"); // En producción, esto lo controla el callback del SDK
  };

  const markVerified = async (identityId: string) => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        kycStatus: "verified",
        kycVerifiedAt: serverTimestamp(),
        kycIdentityId: identityId,
      });
      setStatus("verified");
    } catch {
      setStatus("failed");
    } finally {
      setSaving(false);
    }
  };

  // Placeholder for dev: mark as verified manually
  const devMarkVerified = () => markVerified("dev-identity-id");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Header */}
        <View style={{ alignItems: "center", marginBottom: 24 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: `${theme.accent}22`,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
            }}
          >
            <Ionicons name="shield-checkmark-outline" size={36} color={theme.accent} />
          </View>
          <Text style={{ color: theme.title, fontSize: 20, fontWeight: "700", textAlign: "center" }}>
            Verificá tu identidad
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: "center", marginTop: 6, lineHeight: 20 }}>
            Ganás el badge de usuario verificado y más confianza de compradores y vendedores.
          </Text>
        </View>

        {/* Steps */}
        <View
          style={{
            backgroundColor: theme.card,
            borderRadius: 14,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <Text style={{ color: theme.title, fontWeight: "700", fontSize: 15, marginBottom: 12 }}>
            El proceso tarda ~2 minutos
          </Text>
          {STEPS.map((step, i) => (
            <View
              key={i}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                marginBottom: i < STEPS.length - 1 ? 12 : 0,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: `${theme.accent}22`,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={step.icon as any} size={18} color={theme.accent} />
              </View>
              <Text style={{ color: theme.text, fontSize: 14, flex: 1 }}>{step.label}</Text>
            </View>
          ))}
        </View>

        {/* Privacy note */}
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            backgroundColor: theme.card,
            borderRadius: 12,
            padding: 12,
            marginBottom: 24,
            alignItems: "flex-start",
          }}
        >
          <Ionicons name="lock-closed-outline" size={16} color={theme.textMuted} style={{ marginTop: 1 }} />
          <Text style={{ color: theme.textMuted, fontSize: 12, flex: 1, lineHeight: 18 }}>
            Tus datos se procesan de forma segura por MetaMap (proveedor certificado). MatchCars no almacena tu DNI ni tu selfie.{" "}
            <Text
              style={{ color: theme.accent }}
              onPress={() => Linking.openURL("https://getmati.com/privacy")}
            >
              Ver política de privacidad
            </Text>
          </Text>
        </View>

        {/* CTA */}
        {status === "idle" && (
          <TouchableOpacity
            onPress={startVerification}
            style={{
              backgroundColor: theme.accent,
              borderRadius: 14,
              paddingVertical: 15,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
              Empezar verificación
            </Text>
          </TouchableOpacity>
        )}

        {status === "pending" && (
          <View style={{ alignItems: "center", gap: 12 }}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={{ color: theme.textMuted, fontSize: 14 }}>
              Procesando verificación...
            </Text>
          </View>
        )}

        {status === "verified" && (
          <View style={{ alignItems: "center", gap: 12 }}>
            <Ionicons name="checkmark-circle" size={56} color="#10B981" />
            <Text style={{ color: "#10B981", fontSize: 18, fontWeight: "700" }}>
              ¡Identidad verificada!
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: "center" }}>
              Ya tenés el badge de usuario verificado en tu perfil.
            </Text>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                backgroundColor: theme.accent,
                borderRadius: 14,
                paddingVertical: 12,
                paddingHorizontal: 32,
                marginTop: 8,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                Volver al perfil
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {status === "failed" && (
          <View style={{ gap: 12 }}>
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                backgroundColor: "#EF444422",
                borderRadius: 12,
                padding: 12,
                alignItems: "center",
              }}
            >
              <Ionicons name="alert-circle-outline" size={18} color="#EF4444" />
              <Text style={{ color: "#EF4444", fontSize: 13, flex: 1 }}>
                No pudimos completar la verificación. Podés intentarlo de nuevo.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setStatus("idle")}
              style={{
                backgroundColor: theme.accent,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                Reintentar
              </Text>
            </TouchableOpacity>
            {/* Dev shortcut — quitar en producción */}
            {__DEV__ && (
              <TouchableOpacity
                onPress={devMarkVerified}
                disabled={saving}
                style={{ alignItems: "center", marginTop: 4 }}
              >
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                  [DEV] Marcar como verificado
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
