import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import type { BuyerPreferences } from "@/types/user";
import { Ionicons } from "@expo/vector-icons";
import { doc, updateDoc } from "firebase/firestore";
import React, { useState } from "react";
import {
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const PROVINCES = [
  "Buenos Aires", "CABA", "Córdoba", "Santa Fe", "Mendoza",
  "Tucumán", "Salta", "Neuquén", "Río Negro", "Entre Ríos",
  "Chubut", "Corrientes", "Misiones", "San Juan", "San Luis",
  "La Pampa", "Catamarca", "La Rioja", "Chaco", "Formosa",
  "Jujuy", "Santiago del Estero", "Santa Cruz", "Tierra del Fuego",
];

interface Props {
  visible: boolean;
  userId: string;
  initial?: BuyerPreferences;
  onSave: (prefs: BuyerPreferences) => void;
  onDismiss: () => void;
}

type UseType = BuyerPreferences["useType"];

const USE_OPTIONS: { value: UseType; label: string; icon: string }[] = [
  { value: "familia", label: "Familia", icon: "people-outline" },
  { value: "ciudad", label: "Ciudad", icon: "business-outline" },
  { value: "trabajo", label: "Trabajo", icon: "briefcase-outline" },
  { value: "finde", label: "Fines de semana", icon: "sunny-outline" },
];

const FUEL_OPTIONS = [
  { value: "nafta", label: "Nafta" },
  { value: "diesel", label: "Diesel" },
  { value: "gnc", label: "GNC" },
  { value: "hibrido", label: "Híbrido" },
  { value: "electrico", label: "Eléctrico" },
];

function SectionTitle({ children }: { children: string }) {
  const { theme } = useTheme();
  return (
    <Text style={{ color: theme.text, fontWeight: "600", fontSize: 13, marginBottom: 8, marginTop: 4 }}>
      {children}
    </Text>
  );
}

export function BuyerPreferencesModal({ visible, userId, initial, onSave, onDismiss }: Props) {
  const { theme } = useTheme();

  // Price stored in ARS, displayed in miles (÷1000), formatted with thousands separator
  const formatMiles = (digits: string) =>
    digits ? Number(digits).toLocaleString("es-AR") : "";

  const [budgetMax, setBudgetMax] = useState(
    initial?.budgetMax ? formatMiles(String(Math.round(initial.budgetMax / 1_000))) : ""
  );
  const [province, setProvince] = useState<string>(initial?.province ?? "");
  const [useType, setUseType] = useState<UseType>(initial?.useType);
  const [wantsSwap, setWantsSwap] = useState<boolean>(initial?.wantsSwap ?? false);
  const [fuelType, setFuelType] = useState<string>(initial?.fuelType ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const raw = parseFloat(budgetMax.replace(/\./g, "").replace(",", "."));
    const budgetNum = isNaN(raw) ? undefined : raw * 1_000; // miles → pesos
    const prefs: BuyerPreferences = {
      budgetMax: budgetNum,
      province: province || undefined,
      useType,
      wantsSwap,
      fuelType: fuelType || undefined,
    };
    try {
      await updateDoc(doc(db, "users", userId), { buyerPreferences: prefs });
    } catch {
      // Silent
    }
    setSaving(false);
    onSave(prefs);
  };

  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={label}
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1.5,
        marginRight: 6,
        borderColor: selected ? theme.accent : theme.likeBoxBackground,
        backgroundColor: selected ? `${theme.accent}22` : theme.card,
      }}
    >
      <Text style={{ color: selected ? theme.accent : theme.text, fontSize: 12, fontWeight: selected ? "700" : "400" }}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" }}>
        <View
          style={{
            backgroundColor: theme.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: "88%",
          }}
        >
          {/* Handle bar */}
          <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.likeBoxBackground }} />
          </View>

          {/* Fixed header */}
          <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: theme.title, fontSize: 17, fontWeight: "700" }}>¿Qué auto buscás?</Text>
              <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
              Usamos esto para mostrarte qué tan bien encaja cada auto con lo que buscás.
            </Text>
          </View>

          {/* Scrollable content */}
          <ScrollView
            style={{ paddingHorizontal: 20 }}
            contentContainerStyle={{ paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Budget */}
            <SectionTitle>Presupuesto máximo (en miles de $)</SectionTitle>
            <TextInput
              value={budgetMax}
              onChangeText={(text) => {
                const digits = text.replace(/\D/g, "");
                setBudgetMax(formatMiles(digits));
              }}
              keyboardType="numeric"
              placeholder="Ej: 15.000"
              placeholderTextColor={theme.textMuted}
              style={{
                backgroundColor: theme.card,
                color: theme.text,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 10,
                fontSize: 15,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: theme.likeBoxBackground,
              }}
            />

            {/* Province — horizontal scroll */}
            <SectionTitle>Provincia</SectionTitle>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 4 }}
              style={{ marginBottom: 16 }}
            >
              {PROVINCES.map((p) =>
                chip(p, province === p, () => setProvince(province === p ? "" : p))
              )}
            </ScrollView>

            {/* Use type */}
            <SectionTitle>¿Para qué lo usás?</SectionTitle>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 4 }}
              style={{ marginBottom: 16 }}
            >
              {USE_OPTIONS.map((opt) => {
                const selected = useType === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setUseType(selected ? undefined : opt.value)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 20,
                      borderWidth: 1.5,
                      marginRight: 6,
                      borderColor: selected ? theme.accent : theme.likeBoxBackground,
                      backgroundColor: selected ? `${theme.accent}22` : theme.card,
                    }}
                  >
                    <Ionicons name={opt.icon as any} size={13} color={selected ? theme.accent : theme.textMuted} />
                    <Text style={{ color: selected ? theme.accent : theme.text, fontSize: 12, fontWeight: selected ? "700" : "400" }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Fuel */}
            <SectionTitle>Combustible</SectionTitle>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 4 }}
              style={{ marginBottom: 16 }}
            >
              {FUEL_OPTIONS.map((opt) =>
                chip(opt.label, fuelType === opt.value, () => setFuelType(fuelType === opt.value ? "" : opt.value))
              )}
            </ScrollView>

            {/* Swap */}
            <TouchableOpacity
              onPress={() => setWantsSwap((v) => !v)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                backgroundColor: theme.card,
                borderRadius: 12,
                padding: 12,
                marginBottom: 20,
                borderWidth: 1,
                borderColor: wantsSwap ? theme.accent : theme.likeBoxBackground,
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 5,
                  borderWidth: 2,
                  borderColor: wantsSwap ? theme.accent : theme.textMuted,
                  backgroundColor: wantsSwap ? theme.accent : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {wantsSwap && <Ionicons name="checkmark" size={13} color="#fff" />}
              </View>
              <Text style={{ color: theme.text, fontSize: 13 }}>Tengo auto para permutar</Text>
            </TouchableOpacity>

            {/* Save */}
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={{ backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 13, alignItems: "center", opacity: saving ? 0.7 : 1 }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                {saving ? "Guardando..." : "Guardar preferencias"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onDismiss} style={{ marginTop: 10, alignItems: "center" }}>
              <Text style={{ color: theme.textMuted, fontSize: 13 }}>Ahora no</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
