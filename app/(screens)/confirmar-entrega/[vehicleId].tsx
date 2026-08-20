// app/(screens)/confirmar-entrega/[vehicleId].tsx
// Pantalla que abre el QR de confirmación de entrega (ver
// portal/src/app/dashboard/leads/[id]/page.tsx) cuando quien escanea ya
// tiene la app instalada — universal link (iOS)/App Link (Android) al
// mismo path que la versión web (marketplace/src/app/confirmar-entrega/
// [vehicleId]/page.tsx). A propósito NO usa Firestore directo ni depende de
// tener sesión propia: la autorización es el token del link, igual que la
// versión web, así que habla con el mismo backend (marketplace) en vez de
// reimplementar la transacción + calificación acá con reglas de seguridad
// que asumen un usuario logueado.
import { Header } from "@/components/Header";
import { useTheme } from "@/contexts/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const CONFIRM_DELIVERY_API = "https://matchcars.app/api/confirm-delivery";

type LoadState =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "invalid_token" }
  | { status: "already_confirmed" }
  | { status: "ready"; brand?: string; model?: string; year?: number; sellerName: string }
  | { status: "error" };

export default function ConfirmarEntregaScreen() {
  const { theme } = useTheme();
  const { vehicleId, token } = useLocalSearchParams<{ vehicleId: string; token: string }>();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!vehicleId) return;
    (async () => {
      try {
        const res = await fetch(`${CONFIRM_DELIVERY_API}?vehicleId=${vehicleId}&token=${token ?? ""}`);
        const data = await res.json();
        if (data.state === "ready") {
          setState({ status: "ready", brand: data.vehicle?.brand, model: data.vehicle?.model, year: data.vehicle?.year, sellerName: data.sellerName });
        } else if (data.state === "not_found" || data.state === "invalid_token" || data.state === "already_confirmed") {
          setState({ status: data.state });
        } else {
          setState({ status: "error" });
        }
      } catch {
        setState({ status: "error" });
      }
    })();
  }, [vehicleId, token]);

  const submit = async () => {
    if (!score) {
      setSubmitError("Elegí una puntuación para el vendedor antes de confirmar.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(CONFIRM_DELIVERY_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId, token, score, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No pudimos confirmar la entrega.");
      setDone(true);
    } catch (e: any) {
      setSubmitError(e?.message ?? "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header title="Confirmar entrega" showBack />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {state.status === "loading" && (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        )}

        {state.status === "not_found" && (
          <View style={{ backgroundColor: theme.card, borderRadius: 16, padding: 20, alignItems: "center" }}>
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14 }}>No encontramos esta venta.</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 6, textAlign: "center" }}>
              Verificá el link o pedile a la agencia que te muestre el código de nuevo.
            </Text>
          </View>
        )}

        {state.status === "invalid_token" && (
          <View style={{ backgroundColor: "#EF444415", borderRadius: 16, padding: 20, alignItems: "center", borderWidth: 1, borderColor: "#EF444444" }}>
            <Text style={{ color: "#EF4444", fontWeight: "700", fontSize: 14 }}>Este link no es válido.</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 6, textAlign: "center" }}>
              Pedile a la agencia que te muestre el código de confirmación de nuevo.
            </Text>
          </View>
        )}

        {state.status === "already_confirmed" && (
          <View style={{ backgroundColor: "#10B98115", borderRadius: 16, padding: 20, alignItems: "center", borderWidth: 1, borderColor: "#10B98144" }}>
            <Ionicons name="checkmark-circle" size={32} color="#10B981" />
            <Text style={{ color: "#10B981", fontWeight: "700", fontSize: 14, marginTop: 8 }}>Esta entrega ya fue confirmada.</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4 }}>Gracias — ¡disfrutá tu auto!</Text>
          </View>
        )}

        {state.status === "error" && (
          <View style={{ backgroundColor: theme.card, borderRadius: 16, padding: 20, alignItems: "center" }}>
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14 }}>Algo salió mal.</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 6, textAlign: "center" }}>Probá de nuevo en un momento.</Text>
          </View>
        )}

        {state.status === "ready" && !done && (
          <>
            <View style={{ backgroundColor: theme.card, borderRadius: 16, padding: 20, alignItems: "center" }}>
              <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" }}>
                Confirmar entrega
              </Text>
              <Text style={{ color: theme.text, fontWeight: "800", fontSize: 17, marginTop: 6, textAlign: "center" }}>
                {[state.brand, state.model, state.year].filter(Boolean).join(" ")}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 6, textAlign: "center" }}>
                ¿Confirmás que recibiste este auto de {state.sellerName}?
              </Text>
            </View>

            <View style={{ backgroundColor: theme.card, borderRadius: 16, padding: 20 }}>
              <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14, marginBottom: 10 }}>Puntuá al vendedor</Text>
              <View style={{ flexDirection: "row", justifyContent: "center", gap: 10, marginBottom: 14 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity key={n} onPress={() => setScore(n)}>
                    <Ionicons name={n <= score ? "star" : "star-outline"} size={34} color="#F59E0B" />
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Comentario (opcional)"
                placeholderTextColor={theme.textMuted}
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: theme.border ?? "#E5E7EB",
                  borderRadius: 10,
                  padding: 10,
                  color: theme.text,
                  fontSize: 13,
                  minHeight: 60,
                  marginBottom: 12,
                }}
              />
              {submitError && <Text style={{ color: "#EF4444", fontSize: 12, marginBottom: 10 }}>{submitError}</Text>}
              <TouchableOpacity
                onPress={submit}
                disabled={submitting}
                style={{ backgroundColor: theme.accent, borderRadius: 10, paddingVertical: 12, alignItems: "center", opacity: submitting ? 0.7 : 1 }}
              >
                <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 14 }}>
                  {submitting ? "Confirmando…" : "Confirmar entrega y calificación"}
                </Text>
              </TouchableOpacity>
              <Text style={{ color: theme.textMuted, fontSize: 11, textAlign: "center", marginTop: 8 }}>
                Hace falta puntuar para poder confirmar.
              </Text>
            </View>
          </>
        )}

        {done && (
          <View style={{ backgroundColor: "#10B98115", borderRadius: 16, padding: 20, alignItems: "center", borderWidth: 1, borderColor: "#10B98144" }}>
            <Ionicons name="checkmark-circle" size={32} color="#10B981" />
            <Text style={{ color: "#10B981", fontWeight: "700", fontSize: 14, marginTop: 8 }}>¡Listo! Entrega confirmada.</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4 }}>Gracias por calificar — ¡disfrutá tu auto!</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
