import { useTheme } from "@/contexts/ThemeContext";
import { Offer, OfferStatus } from "@/types/commerce";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Keyboard, Modal, Text, TextInput, TouchableOpacity, View } from "react-native";

interface Props {
  offer: Offer & { id: string };
  viewerRole: "buyer" | "seller";
  onAccept?: () => Promise<void>;
  onReject?: () => Promise<void>;
  onCounter?: (amount: number, currency: "ARS" | "USD", note?: string) => Promise<void>;
  onWithdraw?: () => Promise<void>;
}

const STATUS_CONFIG: Record<OfferStatus, { icon: string; color: string; label: string }> = {
  pending:   { icon: "time-outline",          color: "#F59E0B", label: "Pendiente" },
  countered: { icon: "swap-horizontal-outline", color: "#6366F1", label: "Contraoferta" },
  accepted:  { icon: "checkmark-circle",       color: "#10B981", label: "Aceptada" },
  rejected:  { icon: "close-circle",           color: "#EF4444", label: "Rechazada" },
  expired:   { icon: "alert-circle-outline",   color: "#9CA3AF", label: "Expirada" },
  withdrawn: { icon: "remove-circle-outline",  color: "#9CA3AF", label: "Retirada" },
};

export function OfferCard({ offer, viewerRole, onAccept, onReject, onCounter, onWithdraw }: Props) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [counterModalVisible, setCounterModalVisible] = useState(false);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterCurrency, setCounterCurrency] = useState<"ARS" | "USD">(offer.currency);
  const [counterNote, setCounterNote] = useState("");

  const status = offer.status;
  const cfg = STATUS_CONFIG[status];

  const isExpiredByTime = status === "pending" && offer.expiresAt?.toDate
    ? offer.expiresAt.toDate() < new Date()
    : false;

  const effectiveStatus: OfferStatus = isExpiredByTime ? "expired" : status;
  const effectiveCfg = STATUS_CONFIG[effectiveStatus];

  const fmt = (amount: number, currency: string) =>
    `${currency} ${Number(amount).toLocaleString("es-AR")}`;

  const run = async (fn?: () => Promise<void>) => {
    if (!fn) return;
    setLoading(true);
    try { await fn(); } finally { setLoading(false); }
  };

  const submitCounter = async () => {
    const parsed = parseFloat(counterAmount.replace(/\./g, "").replace(",", "."));
    if (!parsed || parsed <= 0 || !onCounter) return;
    setLoading(true);
    try {
      await onCounter(parsed, counterCurrency, counterNote.trim() || undefined);
      setCounterModalVisible(false);
    } finally {
      setLoading(false);
    }
  };

  const isClosed = effectiveStatus === "accepted" || effectiveStatus === "rejected"
    || effectiveStatus === "expired" || effectiveStatus === "withdrawn";

  return (
    <View style={{
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1.5,
      borderColor: effectiveCfg.color + "44",
      marginVertical: 4,
    }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 }}>
        <Ionicons name={effectiveCfg.icon as any} size={20} color={effectiveCfg.color} />
        <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14, flex: 1 }}>
          Oferta Formal
        </Text>
        <View style={{ backgroundColor: effectiveCfg.color + "22", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
          <Text style={{ color: effectiveCfg.color, fontSize: 11, fontWeight: "700" }}>{effectiveCfg.label}</Text>
        </View>
      </View>

      {/* Main amount — show counter amount when accepted/countered */}
      {(() => {
        const isCounteredOrAccepted = (effectiveStatus === "accepted" || effectiveStatus === "countered") && offer.counterAmount;
        const mainAmount = isCounteredOrAccepted ? offer.counterAmount! : offer.amount;
        const mainCurrency = isCounteredOrAccepted ? (offer.counterCurrency ?? offer.currency) : offer.currency;
        return (
          <View style={{ marginBottom: 4 }}>
            <Text style={{ color: effectiveCfg.color, fontSize: 22, fontWeight: "800" }}>
              {fmt(mainAmount, mainCurrency)}
            </Text>
            {isCounteredOrAccepted && (
              <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 1 }}>
                Oferta original: {fmt(offer.amount, offer.currency)}
              </Text>
            )}
          </View>
        );
      })()}

      {/* Conditions */}
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {offer.includesTradeIn && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.inputBackground, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
            <Ionicons name="swap-horizontal-outline" size={13} color={theme.textMuted} />
            <Text style={{ color: theme.textMuted, fontSize: 11 }}>
              {offer.tradeInDescription ? `Permuta: ${offer.tradeInDescription}` : "Incluye permuta"}
            </Text>
          </View>
        )}
        {offer.includesFinancing && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.inputBackground, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
            <Ionicons name="card-outline" size={13} color={theme.textMuted} />
            <Text style={{ color: theme.textMuted, fontSize: 11 }}>Necesita financiación</Text>
          </View>
        )}
      </View>

      {offer.note ? (
        <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8, fontStyle: "italic" }}>"{offer.note}"</Text>
      ) : null}

      {/* Counter offer display */}
      {(status === "countered") && offer.counterAmount && (
        <View style={{ backgroundColor: "#6366F122", borderRadius: 10, padding: 10, marginBottom: 10 }}>
          <Text style={{ color: "#6366F1", fontSize: 11, fontWeight: "700", marginBottom: 2 }}>
            {viewerRole === "seller" ? "Tu contraoferta" : "Contraoferta del vendedor"}
          </Text>
          <Text style={{ color: "#6366F1", fontSize: 18, fontWeight: "800" }}>
            {fmt(offer.counterAmount, offer.counterCurrency ?? offer.currency)}
          </Text>
          {offer.counterNote ? (
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4, fontStyle: "italic" }}>"{offer.counterNote}"</Text>
          ) : null}
        </View>
      )}

      {/* Expiry */}
      {status === "pending" && !isExpiredByTime && offer.expiresAt?.toDate && (
        <Text style={{ color: theme.textMuted, fontSize: 11, marginBottom: 8 }}>
          Expira: {offer.expiresAt.toDate().toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        </Text>
      )}

      {/* Actions */}
      {!isClosed && !loading && (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
          {/* Seller: offer pending → Accept / Reject / Counter */}
          {viewerRole === "seller" && status === "pending" && (
            <>
              <TouchableOpacity
                onPress={() => run(onAccept)}
                style={{ flex: 1, backgroundColor: "#10B981", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}
              >
                <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>Aceptar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCounterModalVisible(true)}
                style={{ flex: 1, backgroundColor: "#6366F1", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}
              >
                <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>Contraoferta</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => run(onReject)}
                style={{ backgroundColor: theme.inputBackground, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: "center", borderWidth: 1, borderColor: "#EF4444" }}
              >
                <Text style={{ color: "#EF4444", fontWeight: "700", fontSize: 13 }}>Rechazar</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Seller: countered → waiting */}
          {viewerRole === "seller" && status === "countered" && (
            <Text style={{ color: theme.textMuted, fontSize: 12, fontStyle: "italic" }}>
              Esperando respuesta del comprador...
            </Text>
          )}

          {/* Buyer: pending → waiting + withdraw */}
          {viewerRole === "buyer" && status === "pending" && (
            <>
              <Text style={{ color: theme.textMuted, fontSize: 12, flex: 1, fontStyle: "italic", alignSelf: "center" }}>
                Esperando respuesta del vendedor...
              </Text>
              <TouchableOpacity
                onPress={() => run(onWithdraw)}
                style={{ backgroundColor: theme.inputBackground, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.textMuted }}
              >
                <Text style={{ color: theme.textMuted, fontWeight: "600", fontSize: 12 }}>Retirar</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Buyer: countered → Accept or Reject */}
          {viewerRole === "buyer" && status === "countered" && (
            <>
              <TouchableOpacity
                onPress={() => run(onAccept)}
                style={{ flex: 1, backgroundColor: "#10B981", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}
              >
                <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>Aceptar contraoferta</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => run(onReject)}
                style={{ backgroundColor: theme.inputBackground, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: "#EF4444" }}
              >
                <Text style={{ color: "#EF4444", fontWeight: "700", fontSize: 13 }}>Rechazar</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {loading && <ActivityIndicator color={theme.primary} style={{ marginTop: 8 }} />}

      {/* Counter modal */}
      <Modal visible={counterModalVisible} transparent animationType="fade" onRequestClose={() => setCounterModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 20 }}>
            <Text style={{ color: theme.text, fontSize: 17, fontWeight: "700", marginBottom: 4 }}>Enviar contraoferta</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 16 }}>
              Oferta original: {fmt(offer.amount, offer.currency)}
            </Text>

            {/* Currency toggle */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {(["ARS", "USD"] as const).map(c => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setCounterCurrency(c)}
                  style={{
                    paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8,
                    backgroundColor: counterCurrency === c ? theme.primary : theme.inputBackground,
                    borderWidth: 1, borderColor: counterCurrency === c ? theme.primary : theme.likeBoxBackground,
                  }}
                >
                  <Text style={{ color: counterCurrency === c ? "#FFF" : theme.text, fontWeight: "700" }}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              value={counterAmount}
              onChangeText={(t) => {
                const digits = t.replace(/\./g, "").replace(/[^0-9]/g, "");
                setCounterAmount(digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "");
              }}
              placeholder="Monto"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              style={{ backgroundColor: theme.inputBackground, color: theme.text, padding: 12, borderRadius: 10, fontSize: 18, fontWeight: "700", marginBottom: 10 }}
            />
            <TextInput
              value={counterNote}
              onChangeText={setCounterNote}
              placeholder="Nota opcional..."
              placeholderTextColor={theme.textMuted}
              multiline
              style={{ backgroundColor: theme.inputBackground, color: theme.text, padding: 12, borderRadius: 10, marginBottom: 16, minHeight: 60, textAlignVertical: "top" }}
            />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => setCounterModalVisible(false)}
                style={{ flex: 1, padding: 13, borderRadius: 10, alignItems: "center", backgroundColor: theme.inputBackground }}
              >
                <Text style={{ color: theme.text, fontWeight: "600" }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitCounter}
                disabled={loading}
                style={{ flex: 2, padding: 13, borderRadius: 10, alignItems: "center", backgroundColor: "#6366F1", opacity: loading ? 0.7 : 1 }}
              >
                <Text style={{ color: "#FFF", fontWeight: "700" }}>Enviar contraoferta</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
