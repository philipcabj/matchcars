// app/terms.tsx
import { CustomAlert } from "@/components/CustomAlert";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

export default function TermsScreen() {
  const { theme } = useTheme();
  const { user, acceptTerms } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
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

  const handleAccept = async () => {
    if (!user) {
      showAlert(
        "Sesión requerida",
        "Necesitás iniciar sesión para aceptar los términos.",
        "info",
        () => router.replace("/login")
      );
      return;
    }

    try {
      setSaving(true);
      await acceptTerms();

      // No hace falta actualizar el profile local ahora mismo;
      // en el próximo arranque se recarga desde Firestore.
      router.replace("/(tabs)");
    } catch (err) {
      console.error("Error guardando aceptación de términos:", err);
      showAlert(
        "Error",
        "No se pudo guardar la aceptación de los términos. Intentalo de nuevo.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.background,
        paddingHorizontal: 16,
        paddingTop: 40,
        paddingBottom: 24,
      }}
    >
      <Text
        style={{
          fontSize: 24,
          fontWeight: "700",
          color: theme.text,
          marginBottom: 12,
        }}
      >
        Términos y Condiciones
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: theme.secondaryText,
          marginBottom: 16,
        }}
      >
        Por favor leé atentamente antes de continuar.
      </Text>

      <ScrollView
        style={{
          flex: 1,
          borderRadius: 12,
          backgroundColor: theme.card,
          padding: 16,
          marginBottom: 16,
        }}
      >
        {/* Aquí podés pegar tus T&C reales */}
        <Text style={{ color: theme.text, fontSize: 14, marginBottom: 12 }}>
          1. MatchCars actúa como plataforma para conectar personas
          interesadas en comprar, vender, permutar o financiar vehículos.
        </Text>
        <Text style={{ color: theme.text, fontSize: 14, marginBottom: 12 }}>
          2. Los datos de publicación de los vehículos son responsabilidad de
          quien los carga. MatchCars no garantiza la veracidad ni el estado
          real del vehículo.
        </Text>
        <Text style={{ color: theme.text, fontSize: 14, marginBottom: 12 }}>
          3. El uso de la app implica la aceptación de que el equipo de
          MatchCars pueda contactarte por los medios proporcionados para
          coordinar visitas, ofertas y opciones de financiación entre
          privados.
        </Text>
        <Text style={{ color: theme.text, fontSize: 14, marginBottom: 12 }}>
          4. Cualquier operación final (compra, venta, permuta, financiación)
          deberá formalizarse por los medios legales correspondientes. Te
          recomendamos siempre recurrir a profesionales idóneos para
          documentación y verificación de vehículo.
        </Text>
        <Text style={{ color: theme.text, fontSize: 14, marginBottom: 12 }}>
          5. MatchCars tiene una política de TOLERANCIA CERO respecto al contenido
          objetable o usuarios abusivos. Nos reservamos el derecho de eliminar
          cualquier contenido que se considere ofensivo, ilegal o inapropiado,
          así como de bloquear y expulsar a los usuarios que generen dicho
          contenido, dentro de las 24 horas de haber sido reportados.
        </Text>
        <Text style={{ color: theme.text, fontSize: 14, marginBottom: 12 }}>
          6. MatchCars podrá actualizar estos términos en el futuro. Te
          avisaremos dentro de la app cuando haya cambios relevantes.
        </Text>
      </ScrollView>

      <TouchableOpacity
        onPress={handleAccept}
        disabled={saving}
        style={{
          backgroundColor: theme.accent,
          borderRadius: 999,
          paddingVertical: 12,
          alignItems: "center",
        }}
      >
        {saving ? (
          <ActivityIndicator color={theme.buttonText} />
        ) : (
          <Text
            style={{
              color: theme.buttonText,
              fontSize: 16,
              fontWeight: "700",
            }}
          >
            Acepto los términos y continuar
          </Text>
        )}
      </TouchableOpacity>

      <CustomAlert 
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={closeAlert}
      />
    </View>
  );
}
