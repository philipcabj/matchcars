import { CustomAlert } from "@/components/CustomAlert";
import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ─── Monthly payment formula (PMT) ──────────────────────────────────────────
function calcMonthlyPayment(price: number, downPayment: number, annualRate: number, months: number): number {
  const principal = price - downPayment;
  if (principal <= 0 || months <= 0) return 0;
  if (annualRate === 0) return Math.round(principal / months);
  const r = annualRate / 100 / 12;
  return Math.round((principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1));
}

function formatAmount(n: number, currency: string): string {
  return `${currency} ${n.toLocaleString("es-AR")}`;
}

const MONTHS_OPTIONS = [12, 24, 36, 48, 60];
const FINANCING_TYPES = [
  { id: "propio",      label: "Financiación propia", icon: "person-outline" },
  { id: "banco",       label: "Banco / Financiera",  icon: "business-outline" },
  { id: "sin_interes", label: "0% Interés",           icon: "gift-outline" },
] as const;

export default function CarFinancingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vehicleName, setVehicleName] = useState("");
  const [vehiclePrice, setVehiclePrice] = useState(0);
  const [vehicleCurrency, setVehicleCurrency] = useState("ARS");

  // Anticipo
  const [hasDownPayment, setHasDownPayment] = useState(false);
  const [downPaymentStr, setDownPaymentStr] = useState("");

  // Financiación
  const [hasFinancing, setHasFinancing] = useState(false);
  const [financingType, setFinancingType] = useState<"propio" | "banco" | "sin_interes">("propio");
  const [entity, setEntity] = useState("");
  const [months, setMonths] = useState(24);
  const [annualRateStr, setAnnualRateStr] = useState("60");

  const [alertConfig, setAlertConfig] = useState({ visible: false, title: "", message: "", type: "info" as any, onClose: () => {} });
  const showAlert = (title: string, message: string, type: "success" | "error" | "info" = "info", onClose?: () => void) => {
    setAlertConfig({ visible: true, title, message, type, onClose: () => { setAlertConfig(p => ({ ...p, visible: false })); onClose?.(); } });
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "vehicles", id));
        if (!snap.exists()) { showAlert("Error", "Vehículo no encontrado.", "error", () => router.back()); return; }
        const data = snap.data();
        setVehicleName(`${data.brand || ""} ${data.model || ""} ${data.year || ""}`.trim());
        setVehiclePrice(Number(data.price) || 0);
        setVehicleCurrency(data.currency || "ARS");

        const fin = data.financing || {};
        if (fin.downPayment) { setHasDownPayment(true); setDownPaymentStr(String(fin.downPayment)); }
        if (data.acceptsFinancing || fin.months) {
          setHasFinancing(true);
          if (fin.type) setFinancingType(fin.type);
          if (fin.entity) setEntity(fin.entity);
          if (fin.months) setMonths(fin.months);
          // legacy rate field was annual in some versions, normalise
          const storedRate = fin.rate ?? 60;
          setAnnualRateStr(String(storedRate));
        }
      } catch (e) {
        showAlert("Error", "No se pudo cargar el vehículo.", "error", () => router.back());
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const downPayment = Number(downPaymentStr) || 0;
  const annualRate = financingType === "sin_interes" ? 0 : (Number(annualRateStr) || 0);
  const monthly = (hasFinancing && vehiclePrice > 0)
    ? calcMonthlyPayment(vehiclePrice, hasDownPayment ? downPayment : 0, annualRate, months)
    : 0;

  const downPaymentPercent = vehiclePrice > 0 && downPayment > 0
    ? Math.round((downPayment / vehiclePrice) * 100)
    : 0;

  const handleSave = async () => {
    if (!id || !user) return;
    if (hasDownPayment && (!downPayment || downPayment <= 0)) {
      showAlert("Dato faltante", "Ingresá el monto del anticipo.", "info"); return;
    }
    if (hasFinancing && financingType === "banco" && !entity.trim()) {
      showAlert("Dato faltante", "Ingresá el nombre de la entidad financiadora.", "info"); return;
    }

    setSaving(true);
    try {
      const financing = hasFinancing || hasDownPayment ? {
        ...(hasDownPayment ? { downPayment } : { downPayment: null }),
        ...(hasFinancing ? {
          type: financingType,
          entity: financingType === "banco" ? entity.trim() : null,
          months,
          rate: annualRate,
          monthlyPayment: monthly,
        } : {
          type: null, entity: null, months: null, rate: null, monthlyPayment: null,
        }),
      } : null;

      await updateDoc(doc(db, "vehicles", id), {
        acceptsFinancing: hasFinancing,
        financing,
        updatedAt: serverTimestamp(),
      });

      showAlert("Guardado", "Financiación actualizada correctamente.", "success", () => router.back());
    } catch {
      showAlert("Error", "No se pudo guardar. Intentá de nuevo.", "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Pill selector helper ─────────────────────────────────────────────────
  const Pill = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
        backgroundColor: active ? theme.accent : theme.inputBackground,
        borderWidth: 1, borderColor: active ? theme.accent : theme.badgeBorder,
      }}
    >
      <Text style={{ color: active ? "#FFF" : theme.text, fontWeight: "700", fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );

  const SectionTitle = ({ title }: { title: string }) => (
    <Text style={{ color: theme.text, fontSize: 16, fontWeight: "800", marginBottom: 12, marginTop: 4 }}>{title}</Text>
  );

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header title="Financiación" showBack />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 0 }}>

        {/* Vehicle name */}
        <View style={{ backgroundColor: theme.card, borderRadius: 14, padding: 14, marginBottom: 20, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name="car-outline" size={22} color={theme.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 15 }} numberOfLines={1}>{vehicleName}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>{formatAmount(vehiclePrice, vehicleCurrency)}</Text>
          </View>
        </View>

        {/* ── ANTICIPO ──────────────────────────────────────────────────── */}
        <View style={{ backgroundColor: theme.card, borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: hasDownPayment ? 16 : 0 }}>
            <View style={{ flex: 1 }}>
              <SectionTitle title="💰 Anticipo" />
              <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: -8, marginBottom: 4 }}>
                Monto que pedís para reservar el vehículo
              </Text>
            </View>
            <Switch value={hasDownPayment} onValueChange={setHasDownPayment} trackColor={{ true: theme.accent }} />
          </View>

          {hasDownPayment && (
            <View style={{ gap: 12 }}>
              <View>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 6 }}>Monto del anticipo ({vehicleCurrency})</Text>
                <TextInput
                  value={downPaymentStr}
                  onChangeText={setDownPaymentStr}
                  keyboardType="number-pad"
                  placeholder="Ej: 500000"
                  placeholderTextColor={theme.textMuted}
                  style={{ backgroundColor: theme.inputBackground, color: theme.text, borderRadius: 10, padding: 12, fontSize: 16, fontWeight: "700", borderWidth: 1, borderColor: theme.badgeBorder }}
                />
                {downPaymentPercent > 0 && (
                  <Text style={{ color: theme.accent, fontSize: 12, marginTop: 4 }}>
                    = {downPaymentPercent}% del precio total
                  </Text>
                )}
              </View>

              {/* Preview anticipo */}
              <View style={{ backgroundColor: "#F0FFF4", borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="checkmark-circle" size={18} color="#2ECC71" />
                <Text style={{ color: "#166534", fontSize: 13, fontWeight: "600" }}>
                  Se mostrará en la tarjeta:{" "}
                  <Text style={{ fontWeight: "800" }}>Anticipo {vehicleCurrency} {downPayment.toLocaleString("es-AR")}</Text>
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ── FINANCIACIÓN ─────────────────────────────────────────────── */}
        <View style={{ backgroundColor: theme.card, borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: hasFinancing ? 16 : 0 }}>
            <View style={{ flex: 1 }}>
              <SectionTitle title="📅 Financiación en cuotas" />
              <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: -8, marginBottom: 4 }}>
                Ofrecé cuotas para facilitar la venta
              </Text>
            </View>
            <Switch value={hasFinancing} onValueChange={setHasFinancing} trackColor={{ true: theme.accent }} />
          </View>

          {hasFinancing && (
            <View style={{ gap: 18 }}>

              {/* Tipo */}
              <View>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>Tipo de financiación</Text>
                <View style={{ gap: 8 }}>
                  {FINANCING_TYPES.map(ft => (
                    <TouchableOpacity
                      key={ft.id}
                      onPress={() => setFinancingType(ft.id)}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 10,
                        padding: 12, borderRadius: 12, borderWidth: 1.5,
                        borderColor: financingType === ft.id ? theme.accent : theme.badgeBorder,
                        backgroundColor: financingType === ft.id ? theme.accent + "18" : theme.inputBackground,
                      }}
                    >
                      <Ionicons name={ft.icon as any} size={18} color={financingType === ft.id ? theme.accent : theme.textMuted} />
                      <Text style={{ color: financingType === ft.id ? theme.accent : theme.text, fontWeight: "600", fontSize: 14 }}>
                        {ft.label}
                      </Text>
                      {financingType === ft.id && <Ionicons name="checkmark-circle" size={18} color={theme.accent} style={{ marginLeft: "auto" }} />}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Entidad (solo banco) */}
              {financingType === "banco" && (
                <View>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 6 }}>Entidad financiadora</Text>
                  <TextInput
                    value={entity}
                    onChangeText={setEntity}
                    placeholder="Ej: Banco Nación, BBVA, Santander..."
                    placeholderTextColor={theme.textMuted}
                    style={{ backgroundColor: theme.inputBackground, color: theme.text, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: theme.badgeBorder }}
                  />
                </View>
              )}

              {/* Cuotas */}
              <View>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>Cantidad de cuotas</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {MONTHS_OPTIONS.map(m => (
                    <Pill key={m} label={`${m} cuotas`} active={months === m} onPress={() => setMonths(m)} />
                  ))}
                </View>
              </View>

              {/* Tasa (oculta para 0%) */}
              {financingType !== "sin_interes" && (
                <View>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 6 }}>Tasa de interés anual (%)</Text>
                  <TextInput
                    value={annualRateStr}
                    onChangeText={setAnnualRateStr}
                    keyboardType="decimal-pad"
                    placeholder="Ej: 60"
                    placeholderTextColor={theme.textMuted}
                    style={{ backgroundColor: theme.inputBackground, color: theme.text, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: theme.badgeBorder }}
                  />
                </View>
              )}

              {/* Preview cuota */}
              {monthly > 0 && (
                <View style={{ backgroundColor: theme.accent + "15", borderRadius: 12, padding: 14 }}>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>Cuota mensual estimada</Text>
                  <Text style={{ color: theme.accent, fontSize: 22, fontWeight: "800" }}>
                    {vehicleCurrency} {monthly.toLocaleString("es-AR")} / mes
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
                    {months} cuotas{annualRate > 0 ? ` · ${annualRate}% TNA` : " · Sin interés"}
                    {hasDownPayment && downPayment > 0 ? ` · financiando ${formatAmount(vehiclePrice - downPayment, vehicleCurrency)}` : ""}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── PREVIEW TARJETA ──────────────────────────────────────────── */}
        {(hasDownPayment || hasFinancing) && (
          <View style={{ backgroundColor: theme.card, borderRadius: 16, padding: 16, marginBottom: 24 }}>
            <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Vista previa en tarjeta
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {hasDownPayment && downPayment > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F0FFF4", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 }}>
                  <Ionicons name="cash-outline" size={12} color="#166534" />
                  <Text style={{ color: "#166534", fontSize: 11, fontWeight: "700" }}>
                    Anticipo {vehicleCurrency === "USD" ? "USD" : "$"} {downPayment.toLocaleString("es-AR")}
                  </Text>
                </View>
              )}
              {hasFinancing && monthly > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.accent + "18", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 }}>
                  <Ionicons name="calendar-outline" size={12} color={theme.accent} />
                  <Text style={{ color: theme.accent, fontSize: 11, fontWeight: "700" }}>
                    {months}x {vehicleCurrency === "USD" ? "USD" : "$"} {monthly.toLocaleString("es-AR")}
                  </Text>
                </View>
              )}
              {hasFinancing && financingType === "sin_interes" && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FFF9E6", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 }}>
                  <Ionicons name="gift-outline" size={12} color="#D97706" />
                  <Text style={{ color: "#D97706", fontSize: 11, fontWeight: "700" }}>0% interés</Text>
                </View>
              )}
              {hasFinancing && financingType === "banco" && entity && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EFF6FF", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 }}>
                  <Ionicons name="business-outline" size={12} color="#1D4ED8" />
                  <Text style={{ color: "#1D4ED8", fontSize: 11, fontWeight: "700" }}>{entity}</Text>
                </View>
              )}
              {hasFinancing && financingType === "propio" && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F3E8FF", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 }}>
                  <Ionicons name="person-outline" size={12} color="#7C3AED" />
                  <Text style={{ color: "#7C3AED", fontSize: 11, fontWeight: "700" }}>Financiación propia</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Guardar */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={{ backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginBottom: 32 }}
        >
          {saving ? <ActivityIndicator color="#FFF" /> : (
            <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 16 }}>Guardar cambios</Text>
          )}
        </TouchableOpacity>

      </ScrollView>
      <CustomAlert {...alertConfig} showCancel={false} onCancel={() => {}} confirmText="OK" cancelText="" />
    </SafeAreaView>
  );
}
