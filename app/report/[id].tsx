import { CustomAlert } from "@/components/CustomAlert";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { notifyAdminNewReport } from "@/lib/admin-notifications";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { addDoc, collection, doc, increment, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import React, { useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ReportScreen() {
  const { id, type } = useLocalSearchParams(); // id: vehicleId or userId, type: 'vehicle' | 'user'
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
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

  const REASONS = [
    "Contenido inapropiado",
    "Spam o fraude",
    "Información falsa",
    "Acoso",
    "Otro"
  ];

  const handleSubmit = async () => {
    if (!reason) {
      showAlert("Error", "Seleccioná un motivo.", "error");
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      const reportRef = await addDoc(collection(db, "reports"), {
        targetId: id,
        targetType: type || "vehicle",
        reason,
        details,
        reportedBy: user.uid,
        createdAt: serverTimestamp(),
        status: "pending"
      });

      notifyAdminNewReport(reportRef.id, {
        targetId: id,
        targetType: type || "vehicle",
        reason,
        details,
        reportedBy: user.uid,
      }).catch(() => {});

      if (type === "user") {
        // Bloquear al usuario automáticamente
        const userRef = doc(db, "users", user.uid, "blocked", id as string);
        await setDoc(userRef, {
            blockedAt: serverTimestamp(),
            reason,
        });

        // Incrementar flags del usuario reportado
        try {
            const reportedUserRef = doc(db, "users", id as string);
            await updateDoc(reportedUserRef, { flags: increment(1) });
        } catch (e) {
            logger.log("Error incrementing flags:", e);
        }
      }
      
      showAlert("Reporte enviado", "Gracias por ayudarnos a mantener segura la comunidad. Se ha bloqueado la comunicación con este usuario.", "success", () => router.back());
    } catch {
      showAlert("Error", "No se pudo enviar el reporte.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 16 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }}>
          <Ionicons name="close" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: "700", color: theme.text }}>
          Reportar {type === "user" ? "usuario" : "publicación"}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: theme.text, fontSize: 16, marginBottom: 16 }}>
          ¿Cuál es el problema?
        </Text>
        
        {REASONS.map((r) => (
          <TouchableOpacity
            key={r}
            onPress={() => setReason(r)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: theme.card,
            }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: reason === r ? theme.accent : theme.textMuted,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              {reason === r && (
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: theme.accent,
                  }}
                />
              )}
            </View>
            <Text style={{ color: theme.text, fontSize: 16 }}>{r}</Text>
          </TouchableOpacity>
        ))}

        <Text style={{ color: theme.text, fontSize: 16, marginTop: 24, marginBottom: 8 }}>
          Detalles adicionales (opcional)
        </Text>
        <TextInput
          style={{
            backgroundColor: theme.inputBackground,
            color: theme.text,
            padding: 12,
            borderRadius: 8,
            minHeight: 100,
            textAlignVertical: "top",
          }}
          placeholder="Describí el problema..."
          placeholderTextColor={theme.textMuted}
          multiline
          value={details}
          onChangeText={setDetails}
        />

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={loading}
          style={{
            backgroundColor: theme.error || "red",
            padding: 16,
            borderRadius: 12,
            alignItems: "center",
            marginTop: 32,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
              Enviar reporte
            </Text>
          )}
        </TouchableOpacity>
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
