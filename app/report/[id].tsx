import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView
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

  const REASONS = [
    "Contenido inapropiado",
    "Spam o fraude",
    "Información falsa",
    "Acoso",
    "Otro"
  ];

  const handleSubmit = async () => {
    if (!reason) {
      Alert.alert("Error", "Seleccioná un motivo.");
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      await addDoc(collection(db, "reports"), {
        targetId: id,
        targetType: type || "vehicle",
        reason,
        details,
        reportedBy: user.uid,
        createdAt: serverTimestamp(),
        status: "pending"
      });
      
      Alert.alert("Reporte enviado", "Gracias por ayudarnos a mantener segura la comunidad.", [
        { text: "OK", onPress: () => router.back() }
      ]);
    } catch (e) {
      Alert.alert("Error", "No se pudo enviar el reporte.");
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
    </SafeAreaView>
  );
}
