import { Header } from "@/components/Header";
import { OfferCard } from "@/components/OfferCard";
import { WebContainer } from "@/components/WebContainer";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { canAccessCRM } from "@/lib/planChecks";
import { sendNotificationEmail } from "@/lib/mail";
import { Lead, LeadStatus, Offer, OfferSummary } from "@/types/commerce";
import { formatTimeAgo } from "@/utils/dateUtils";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { addDoc, collection, doc, increment, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Linking, Platform, Share, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LeadsScreen() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const router = useRouter();
  const [leads, setLeads] = useState<(Lead & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }
    const col = collection(db, "leads");
    const q = query(col, where("sellerId", "==", user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!snap) {
          setLeads([]);
          setLoading(false);
          return;
        }
        const arr: (Lead & { id: string })[] = [];
        snap.forEach((d) => {
          const data = d.data() as Lead;
          arr.push({ ...data, id: d.id });
        });
        arr.sort((a, b) => {
          const ta = (a.lastMessageAt as any)?.seconds ?? 0;
          const tb = (b.lastMessageAt as any)?.seconds ?? 0;
          return tb - ta;
        });
        setLeads(arr);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [user?.uid]);

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Header />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ color: theme.text, fontSize: 16, textAlign: "center" }}>
            Para ver tus leads, iniciá sesión o registrate.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const isDealer = !!profile?.plan && profile.plan.includes("pro_dealer");
  // El CRM (esta pantalla entera: ver/gestionar leads, ofertas, marcar
  // vendido) es una feature de plan desde Pro Plus — antes esto solo
  // gateaba el header con KPIs de acá abajo, así que cualquier usuario
  // (incluso free) con un lead propio podía ver y operar todo sin
  // restricción si llegaba a esta pantalla. Mismo gap que se encontró y
  // arregló en el portal — se cierra acá también.
  const hasCRM = !!profile?.plan && canAccessCRM(profile.plan);

  if (!hasCRM) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Header title="Leads" showBack />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Ionicons name="lock-closed-outline" size={40} color={theme.textMuted} style={{ marginBottom: 12, opacity: 0.6 }} />
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700", textAlign: "center", marginBottom: 6 }}>
            Función exclusiva de planes pagos
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: "center", lineHeight: 20 }}>
            El CRM de Leads está disponible desde el plan Pro Plus.
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/(screens)/subscribe" as any)}
            style={{ marginTop: 16, backgroundColor: theme.accent, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999 }}
          >
            <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>Ver planes</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const statusOrder: LeadStatus[] = ["new", "contacted", "negotiation", "won", "lost"];

  const statusPalette: Record<
    LeadStatus,
    { bg: string; color: string }
  > = {
    new: { bg: "#DBEAFE", color: "#1D4ED8" },
    contacted: { bg: "#FEF3C7", color: "#92400E" },
    negotiation: { bg: "#ECFEFF", color: "#0E7490" },
    won: { bg: "#DCFCE7", color: "#166534" },
    lost: { bg: "#FEE2E2", color: "#991B1B" },
  };

  const statusLabels: Record<LeadStatus, string> = {
    new: "Nuevo",
    contacted: "Contactado",
    negotiation: "En negociación",
    won: "Vendido",
    lost: "Perdido",
  };

  const getDiffInDays = (from: any, to: any) => {
    if (!from || !to) return null;
    try {
      const fromDate = from.toDate ? from.toDate() : new Date(from);
      const toDate = to.toDate ? to.toDate() : new Date(to);
      const diffMs = toDate.getTime() - fromDate.getTime();
      if (!isFinite(diffMs) || diffMs <= 0) return null;
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch {
      return null;
    }
  };

  const filteredLeads = useMemo(() => {
    if (statusFilter === "all") return leads;
    return leads.filter((l) => l.status === statusFilter);
  }, [leads, statusFilter]);

  const dealerStats = useMemo(() => {
    const total = leads.length;
    const newCount = leads.filter((l) => l.status === "new").length;
    const negotiationCount = leads.filter((l) => l.status === "negotiation").length;
    const wonCount = leads.filter((l) => l.status === "won").length;
    const wonWithPrice = leads.filter((l) => l.status === "won" && l.dealPrice);
    const arsTotal = wonWithPrice
      .filter((l) => (l.dealCurrency || "ARS") !== "USD")
      .reduce((s, l) => s + (l.dealPrice || 0), 0);
    const usdTotal = wonWithPrice
      .filter((l) => l.dealCurrency === "USD")
      .reduce((s, l) => s + (l.dealPrice || 0), 0);
    const conversionRate = total > 0 ? Math.round((wonCount / total) * 100) : 0;
    return { total, newCount, negotiationCount, wonCount, arsTotal, usdTotal, conversionRate };
  }, [leads]);

  const handleCycleStatus = async (lead: Lead & { id: string }) => {
    const current = (lead.status || "new") as LeadStatus;
    if (current === "won" || current === "lost" || current === "negotiation") {
      return;
    }
    const idx = current === "new" ? 0 : 1;
    const nextStatus: LeadStatus = idx === 0 ? "contacted" : "negotiation";
    const ref = doc(db, "leads", lead.id);
    const now = serverTimestamp();
    const updates: any = { status: nextStatus };
    if (nextStatus === "contacted" && !lead.contactedAt) {
      updates.contactedAt = now;
    } else if (nextStatus === "negotiation" && !lead.negotiationAt) {
      updates.negotiationAt = now;
    }
    await updateDoc(ref, updates);
  };

  const safeCycleStatus = async (lead: Lead & { id: string }) => {
    try {
      await handleCycleStatus(lead);
    } catch (e) {
      console.error("Error updating lead status", e);
      Alert.alert("Error", "No se pudo cambiar el estado. Intentá de nuevo.");
    }
  };

  const markLeadAsLost = async (lead: Lead & { id: string }) => {
    const ref = doc(db, "leads", lead.id);
    const now = serverTimestamp();
    const updates: any = { status: "lost" };
    if (!lead.lostAt) {
      updates.lostAt = now;
    }
    await updateDoc(ref, updates);
  };

  const safeMarkLeadAsLost = async (lead: Lead & { id: string }) => {
    try {
      await markLeadAsLost(lead);
    } catch (e) {
      console.error("Error updating lead status", e);
      Alert.alert("Error", "No se pudo cambiar el estado. Intentá de nuevo.");
    }
  };

  const markLeadWonFromSale = async (payload: {
    leadId: string;
    finalPrice?: number;
    currency?: string;
  }) => {
    const ref = doc(db, "leads", payload.leadId);
    const now = serverTimestamp();
    const updates: any = {
      status: "won",
    };
    if (typeof payload.finalPrice === "number" && payload.finalPrice > 0) {
      updates.dealPrice = payload.finalPrice;
    }
    if (payload.currency) {
      updates.dealCurrency = payload.currency;
    }
    updates.wonAt = now;
    await updateDoc(ref, updates);
  };

  const confirmCycleStatus = (lead: Lead & { id: string }) => {
    const current = (lead.status || "new") as LeadStatus;
    if (current === "won" || current === "lost") {
      Alert.alert("Lead cerrado", "Este lead ya está cerrado como vendido o perdido.");
      return;
    }
    if (current === "negotiation") {
      Alert.alert("Cerrar lead", "¿Cómo terminó este lead?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Perdido", onPress: () => safeMarkLeadAsLost(lead) },
        {
          text: "Vendido",
          onPress: () => {
            if (lead.vehicleId && lead.buyerId) {
              router.push({
                pathname: "/(tabs)/mycars",
                params: {
                  saleVehicleId: lead.vehicleId,
                  saleBuyerId: lead.buyerId,
                  leadId: lead.id,
                },
              } as any);
            } else {
              Alert.alert(
                "Falta información",
                "No se pudo identificar el vehículo o el comprador para esta venta."
              );
            }
          },
        },
      ]);
      return;
    }
    const next: LeadStatus = current === "new" ? "contacted" : "negotiation";
    const currentLabel = statusLabels[current];
    const nextLabel = statusLabels[next];
    Alert.alert("Cambiar estado del lead", `¿Querés cambiar de "${currentLabel}" a "${nextLabel}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Confirmar", onPress: () => safeCycleStatus(lead) },
    ]);
  };

  const handleOfferActionInLead = async (
    lead: Lead & { id: string },
    action: "accept" | "reject" | "counter",
    counterData?: { amount: number; currency: "ARS" | "USD"; note?: string }
  ) => {
    if (!lead.offer?.id) return;
    const now = serverTimestamp();
    const offerRef = doc(db, "offers", lead.offer.id);
    const leadRef = doc(db, "leads", lead.id);

    if (action === "accept") {
      const acceptedAmount = lead.offer.status === "countered" && lead.offer.counterAmount
        ? lead.offer.counterAmount : lead.offer.amount;
      const acceptedCurrency = lead.offer.status === "countered" && lead.offer.counterCurrency
        ? lead.offer.counterCurrency : lead.offer.currency;
      await updateDoc(offerRef, { status: "accepted", resolvedAt: now, updatedAt: now });
      await updateDoc(leadRef, {
        "offer.status": "accepted", status: "won", wonAt: now,
        dealPrice: acceptedAmount, dealCurrency: acceptedCurrency,
      });
      const msgText = `Oferta aceptada: ${acceptedCurrency} ${Number(acceptedAmount).toLocaleString("es-AR")}`;
      const convId = lead.conversationId;
      await addDoc(collection(db, "conversations", convId, "messages"), { senderId: user!.uid, text: msgText, createdAt: now });
      await updateDoc(doc(db, "conversations", convId), { lastMessage: msgText, lastSenderId: user!.uid, updatedAt: now });
      // Notify buyer
      addDoc(collection(db, "users", lead.buyerId, "offer_notifications"), {
        type: "offer_accepted",
        offerId: lead.offer.id ?? "",
        conversationId: convId,
        vehicleId: lead.vehicleId,
        buyerId: lead.buyerId,
        sellerId: lead.sellerId ?? user!.uid,
        amount: acceptedAmount,
        currency: acceptedCurrency,
        vehicleSnapshot: lead.vehicleSnapshot ?? {},
        buyerSnapshot: lead.buyerSnapshot ?? {},
        read: false,
        createdAt: now,
      }).catch(() => {});

      {
        const carModel = `${lead.vehicleSnapshot?.brand ?? ""} ${lead.vehicleSnapshot?.model ?? ""}`.trim();
        const amountText = `${acceptedCurrency} ${Number(acceptedAmount).toLocaleString("es-AR")}`;
        sendNotificationEmail("offer_accepted", {
          recipientUid: lead.buyerId,
          senderName: "MatchCars",
          subject: `¡Tu oferta por ${carModel} fue aceptada!`,
          carModel,
          amount: amountText,
        }).catch(() => {});
      }
    } else if (action === "reject") {
      await updateDoc(offerRef, { status: "rejected", resolvedAt: now, updatedAt: now });
      await updateDoc(leadRef, { "offer.status": "rejected" });
      const msgText = "Oferta rechazada";
      const convId = lead.conversationId;
      await addDoc(collection(db, "conversations", convId, "messages"), { senderId: user!.uid, text: msgText, createdAt: now });
      await updateDoc(doc(db, "conversations", convId), { lastMessage: msgText, lastSenderId: user!.uid, updatedAt: now });
    } else if (action === "counter" && counterData) {
      await updateDoc(offerRef, {
        status: "countered", counterAmount: counterData.amount, counterCurrency: counterData.currency,
        ...(counterData.note ? { counterNote: counterData.note } : {}), updatedAt: now,
      });
      await updateDoc(leadRef, {
        "offer.status": "countered", "offer.counterAmount": counterData.amount,
        "offer.counterCurrency": counterData.currency,
        ...(counterData.note ? { "offer.counterNote": counterData.note } : {}),
      });
      const msgText = `Contraoferta: ${counterData.currency} ${Number(counterData.amount).toLocaleString("es-AR")}`;
      const convId = lead.conversationId;
      await addDoc(collection(db, "conversations", convId, "messages"), { senderId: user!.uid, text: msgText, createdAt: now });
      await updateDoc(doc(db, "conversations", convId), { lastMessage: msgText, lastSenderId: user!.uid, updatedAt: now });
      // Notify buyer
      addDoc(collection(db, "users", lead.buyerId, "offer_notifications"), {
        type: "counter_received",
        offerId: lead.offer?.id ?? "",
        conversationId: convId,
        vehicleId: lead.vehicleId,
        buyerId: lead.buyerId,
        sellerId: lead.sellerId ?? user!.uid,
        amount: counterData.amount,
        currency: counterData.currency,
        vehicleSnapshot: lead.vehicleSnapshot ?? {},
        buyerSnapshot: lead.buyerSnapshot ?? {},
        read: false,
        createdAt: now,
      }).catch(() => {});

      {
        const carModel = `${lead.vehicleSnapshot?.brand ?? ""} ${lead.vehicleSnapshot?.model ?? ""}`.trim();
        const amountText = `${counterData.currency} ${Number(counterData.amount).toLocaleString("es-AR")}`;
        sendNotificationEmail("counter_received", {
          recipientUid: lead.buyerId,
          senderName: (profile?.firstName && profile?.lastName) ? `${profile.firstName} ${profile.lastName}`.trim() : (profile?.firstName || "El vendedor"),
          subject: `Te hicieron una contraoferta por ${carModel}`,
          carModel,
          amount: amountText,
        }).catch(() => {});
      }
    }
  };

  const renderStatus = (status: Lead["status"]) => {
    const s = (status || "new") as LeadStatus;
    const label = statusLabels[s];
    const palette = statusPalette[s];
    return (
      <View
        style={{
          alignSelf: "flex-start",
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 999,
          backgroundColor: palette.bg,
        }}
      >
        <Text style={{ color: palette.color, fontSize: 11, fontWeight: "600" }}>{label}</Text>
      </View>
    );
  };

  // Lead entrante sin cuenta en la app: cargado a mano en el portal o vía el
  // formulario "Consultar" de la web (source "web"). No hay chat ni perfil —
  // al tocarlo se muestran los datos de contacto para responder directo.
  const openManualLead = (item: Lead & { id: string }) => {
    const mc = item.manualContact;
    if (!mc) return;
    const bits = [mc.phone && `Tel: ${mc.phone}`, mc.email && `Email: ${mc.email}`].filter(Boolean).join("\n");
    const body = `${mc.notes || item.lastMessage || ""}\n\n${bits}`.trim();
    const actions: any[] = [];
    if (mc.phone) {
      const digits = mc.phone.replace(/\D/g, "");
      actions.push({ text: "WhatsApp", onPress: () => Linking.openURL(`https://wa.me/${digits}`).catch(() => {}) });
      actions.push({ text: "Llamar", onPress: () => Linking.openURL(`tel:${mc.phone}`).catch(() => {}) });
    }
    if (mc.email) {
      actions.push({ text: "Email", onPress: () => Linking.openURL(`mailto:${mc.email}`).catch(() => {}) });
    }
    actions.push({ text: "Cerrar", style: "cancel" });
    Alert.alert(`${mc.name}${item.source === "web" ? " · consulta web" : ""}`, body || "Sin mensaje.", actions);
  };

  const renderItem = ({ item }: { item: Lead & { id: string } }) => {
    const veh = item.vehicleSnapshot;
    const title =
      veh?.brand || veh?.model
        ? `${veh?.brand ?? ""} ${veh?.model ?? ""} ${veh?.year ?? ""}`.trim()
        : "Consulta general";
    const buyer = item.buyerSnapshot;
    const isManual = !item.buyerId && !!item.manualContact;
    const buyerName =
      item.manualContact?.name ||
      (buyer?.firstName || buyer?.lastName
        ? `${buyer?.firstName ?? ""} ${buyer?.lastName ?? ""}`.trim()
        : "Comprador");
    const buyerInitials = buyer?.initials || buyerName.slice(0, 2).toUpperCase();
    const buyerAvatarColor = buyer?.avatarColor || theme.accent;
    const hasUnread = item.unreadCount > 0;
    const basePrice = item.vehicleSnapshot?.price ?? item.estimatedValue;
    const priceCurrency = item.vehicleSnapshot?.currency || item.currency;
    const dealPrice = item.dealPrice;
    const dealCurrency = item.dealCurrency || priceCurrency;
    const lastMessagePreview = item.lastMessage || "";
    const lastActivityLabel = item.lastMessageAt ? formatTimeAgo(item.lastMessageAt) : "";
    const currentIndex = statusOrder.indexOf(item.status || "new");
    const createdAt = (item as any).createdAt;
    const contactedAt = (item as any).contactedAt;
    const negotiationAt = item.negotiationAt;
    const wonAt = item.wonAt;
    const lostAt = item.lostAt;
    return (
      <TouchableOpacity
        onPress={() =>
          isManual
            ? openManualLead(item)
            : router.push({
                pathname: "/(screens)/chat/[uid]",
                params: { uid: item.buyerId, conversationId: item.conversationId, vehicleId: item.vehicleId },
              })
        }
        style={{
          padding: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.background,
          backgroundColor: theme.card,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <TouchableOpacity
          onPress={() =>
            isManual ? openManualLead(item) : router.push(`/(screens)/user-profile/${item.buyerId}` as any)
          }
          activeOpacity={0.8}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: buyerAvatarColor,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 14 }}>{buyerInitials}</Text>
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
            <Text
              style={{
                color: theme.text,
                fontWeight: "700",
                fontSize: 14,
                flex: 1,
                marginRight: 8,
              }}
              numberOfLines={1}
            >
              {title}
            </Text>
            {lastActivityLabel !== "" && (
              <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                {lastActivityLabel}
              </Text>
            )}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Text style={{ color: theme.textMuted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
              {buyerName}
            </Text>
            {item.source === "web" && (
              <View style={{ backgroundColor: theme.accent + "22", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                <Text style={{ color: theme.accent, fontSize: 10, fontWeight: "700" }}>WEB</Text>
              </View>
            )}
          </View>
          {item.status === "won" && dealPrice && dealCurrency && (
            <>
              <Text
                style={{
                  color: theme.accent,
                  fontSize: 12,
                  fontWeight: "600",
                  marginBottom: 0,
                }}
                numberOfLines={1}
              >
                Cierre: {dealCurrency} {Number(dealPrice).toLocaleString("es-AR")}
              </Text>
              {basePrice && priceCurrency && (
                <Text
                  style={{
                    color: theme.textMuted,
                    fontSize: 11,
                    marginBottom: 2,
                  }}
                  numberOfLines={1}
                >
                  Publicado: {priceCurrency} {Number(basePrice).toLocaleString("es-AR")}
                </Text>
              )}
            </>
          )}
          {item.status !== "won" && basePrice && priceCurrency && (
            <Text
              style={{
                color: theme.accent,
                fontSize: 12,
                fontWeight: "600",
                marginBottom: 2,
              }}
              numberOfLines={1}
            >
              {priceCurrency} {Number(basePrice).toLocaleString("es-AR")}
            </Text>
          )}
          {!!lastMessagePreview && (
            <Text
              style={{
                color: hasUnread ? theme.text : theme.textMuted,
                fontSize: 12,
                marginBottom: 4,
              }}
              numberOfLines={1}
            >
              {lastMessagePreview}
            </Text>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4, marginTop: 2 }}>
            {statusOrder.map((st, index) => {
              const reached = index <= currentIndex;
              const isCurrent = index === currentIndex;
              const palette = statusPalette[st];
              const baseCircleSize = 7;
              const isTerminal = st === "won" || st === "lost";
              const showAsActiveTerminal = isTerminal && item.status === st;
              return (
                <View key={st} style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                  {showAsActiveTerminal ? (
                    <View
                      style={{
                        width: baseCircleSize + 6,
                        height: baseCircleSize + 6,
                        borderRadius: (baseCircleSize + 6) / 2,
                        backgroundColor: palette.bg,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: palette.color,
                      }}
                    >
                      <Ionicons
                        name="flag-outline"
                        size={10}
                        color={palette.color}
                      />
                    </View>
                  ) : (
                    <View
                      style={[
                        {
                          width: baseCircleSize,
                          height: baseCircleSize,
                          borderRadius: baseCircleSize / 2,
                          backgroundColor: reached ? palette.bg : theme.background,
                          borderWidth: 1,
                          borderColor: reached ? palette.color : palette.bg,
                        },
                        isCurrent ? { transform: [{ scale: 1.25 }] } : null,
                      ]}
                    />
                  )}
                  {index < statusOrder.length - 1 && (
                    <View
                      style={{
                        flex: 1,
                        height: 2,
                        backgroundColor:
                          index < currentIndex && !isTerminal
                            ? palette.color
                            : theme.likeBoxBackground,
                        marginHorizontal: 2,
                      }}
                    />
                  )}
                </View>
              );
            })}
          </View>
          {(() => {
            let label: string | null = null;
            if (item.status === "won") {
              const dTotal = getDiffInDays(createdAt, wonAt);
              if (dTotal !== null) label = `Vendido en ${dTotal} días`;
            } else if (item.status === "lost") {
              const dTotal = getDiffInDays(createdAt, lostAt);
              if (dTotal !== null) label = `Perdido en ${dTotal} días`;
            } else if (item.status === "negotiation") {
              const dToNegotiation = getDiffInDays(createdAt, negotiationAt);
              if (dToNegotiation !== null) label = `En negociación hace ${dToNegotiation} días`;
            }
            if (!label) return null;
            return (
              <Text
                style={{
                  color: theme.textMuted,
                  fontSize: 11,
                  marginBottom: 2,
                  flexShrink: 1,
                }}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {label}
              </Text>
            );
          })()}
          {/* Offer card (seller view) */}
          {item.offer && (item.offer.status === "pending" || item.offer.status === "countered") && (
            <View style={{ marginBottom: 8 }}>
              <OfferCard
                offer={{ ...item.offer, leadId: item.id, conversationId: item.conversationId, vehicleId: item.vehicleId, sellerId: item.sellerId, buyerId: item.buyerId, updatedAt: null } as Offer & { id: string }}
                viewerRole="seller"
                onAccept={() => handleOfferActionInLead(item, "accept")}
                onReject={() => handleOfferActionInLead(item, "reject")}
                onCounter={(amount, currency, note) => handleOfferActionInLead(item, "counter", { amount, currency, note })}
              />
            </View>
          )}
          {item.offer && (item.offer.status === "pending" || item.offer.status === "countered") && (
            <View style={{ backgroundColor: "#F59E0B22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start", marginBottom: 6 }}>
              <Text style={{ color: "#B45309", fontSize: 11, fontWeight: "700" }}>
                {item.offer.status === "countered" ? "CONTRAOFERTA ENVIADA" : "OFERTA PENDIENTE"}
              </Text>
            </View>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            {renderStatus(item.status)}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <TouchableOpacity
                onPress={() => confirmCycleStatus(item)}
                activeOpacity={0.8}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: theme.border,
                  marginRight: hasUnread ? 8 : 0,
                  backgroundColor: theme.background,
                }}
              >
                <Text style={{ color: theme.text, fontSize: 11, fontWeight: "600" }}>Cambiar estado</Text>
              </TouchableOpacity>
              {hasUnread && (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 999,
                    backgroundColor: theme.accent,
                  }}
                >
                  <Text style={{ color: "#FFF", fontSize: 11, fontWeight: "700" }}>
                    {item.unreadCount} sin leer
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const content = (
    <>
      <Header title="Leads" showBack />
      <View style={{ flex: 1 }}>
        {hasCRM && (
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
            {/* Title + Share */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <View>
                <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}>{isDealer ? "CRM de Agencia" : "Mis consultas"}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                  Organizá las consultas por tus autos.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() =>
                  Share.share({
                    message: `Mirá mi catálogo de autos en MatchCars: https://matchcars.app/user-profile/${user.uid}`,
                    url: `https://matchcars.app/user-profile/${user.uid}`,
                  })
                }
                style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.inputBackground, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.border }}
              >
                <Ionicons name="share-outline" size={16} color={theme.accent} />
                <Text style={{ color: theme.accent, fontSize: 13, fontWeight: "700" }}>Compartir catálogo</Text>
              </TouchableOpacity>
            </View>

            {/* KPI Cards */}
            {leads.length > 0 && (
              <>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                  <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.border }}>
                    <Text style={{ color: theme.text, fontSize: 20, fontWeight: "800" }}>{dealerStats.total}</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 11 }}>Total</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: "#DBEAFE", borderRadius: 10, padding: 10 }}>
                    <Text style={{ color: "#1D4ED8", fontSize: 20, fontWeight: "800" }}>{dealerStats.newCount}</Text>
                    <Text style={{ color: "#1D4ED8", fontSize: 11 }}>Nuevos</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: "#ECFEFF", borderRadius: 10, padding: 10 }}>
                    <Text style={{ color: "#0E7490", fontSize: 20, fontWeight: "800" }}>{dealerStats.negotiationCount}</Text>
                    <Text style={{ color: "#0E7490", fontSize: 11 }}>Negociando</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: "#DCFCE7", borderRadius: 10, padding: 10 }}>
                    <Text style={{ color: "#166534", fontSize: 20, fontWeight: "800" }}>{dealerStats.wonCount}</Text>
                    <Text style={{ color: "#166534", fontSize: 11 }}>Vendidos</Text>
                  </View>
                </View>

                {/* Revenue + Conversion */}
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.card, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.border, gap: 8 }}>
                  <Ionicons name="trending-up-outline" size={18} color={theme.accent} />
                  <View style={{ flex: 1 }}>
                    {dealerStats.arsTotal > 0 && (
                      <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700" }}>
                        ARS {dealerStats.arsTotal.toLocaleString("es-AR")}
                      </Text>
                    )}
                    {dealerStats.usdTotal > 0 && (
                      <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700" }}>
                        USD {dealerStats.usdTotal.toLocaleString("es-AR")}
                      </Text>
                    )}
                    {dealerStats.arsTotal === 0 && dealerStats.usdTotal === 0 && (
                      <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                        Ingresos: registrá el precio al marcar como Vendido
                      </Text>
                    )}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: theme.text, fontSize: 18, fontWeight: "800" }}>{dealerStats.conversionRate}%</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 10 }}>conversión</Text>
                  </View>
                </View>
              </>
            )}
          </View>
        )}
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : leads.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
            <Ionicons
              name="people-circle-outline"
              size={64}
              color={theme.textMuted}
              style={{ marginBottom: 12, opacity: 0.5 }}
            />
            <Text
              style={{
                color: theme.text,
                fontSize: 18,
                fontWeight: "600",
                marginBottom: 6,
                textAlign: "center",
              }}
            >
              Todavía no tenés leads
            </Text>
            <Text
              style={{
                color: theme.textMuted,
                fontSize: 13,
                textAlign: "center",
                lineHeight: 20,
              }}
            >
              Cuando los compradores te escriban por tus publicaciones, vas a ver las oportunidades acá.
            </Text>
          </View>
        ) : (
          <>
            <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
              <View
                style={{
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: theme.inputBackground,
                }}
              >
                <Text
                  style={{
                    color: theme.textMuted,
                    fontSize: 11,
                    marginBottom: 6,
                  }}
                >
                  Filtrar por estado
                </Text>
                {(() => {
                  const defs: { key: "all" | LeadStatus; label: string }[] = [
                    { key: "all", label: "Todos" },
                    { key: "new", label: "Nuevos" },
                    { key: "contacted", label: "Contactados" },
                    { key: "negotiation", label: "En negociación" },
                    { key: "won", label: "Vendidos" },
                    { key: "lost", label: "Perdidos" },
                  ];
                  return (
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        justifyContent: "space-between",
                      }}
                    >
                      {defs.map((f) => {
                        const active = statusFilter === f.key;
                        const palette =
                          f.key === "all"
                            ? { bg: theme.background, color: theme.text }
                            : statusPalette[f.key as LeadStatus];
                        return (
                          <TouchableOpacity
                            key={f.key}
                            onPress={() => setStatusFilter(f.key as any)}
                            style={{
                              width: "48%",
                              paddingHorizontal: 10,
                              paddingVertical: 8,
                              borderRadius: 999,
                              marginBottom: 8,
                              alignItems: "center",
                              backgroundColor: active ? palette.bg : theme.background,
                              borderWidth: active ? 0 : 1,
                              borderColor: palette.bg,
                            }}
                          >
                            <Text
                              style={{
                                color: active ? palette.color : theme.text,
                                fontSize: 12,
                                fontWeight: active ? "700" : "500",
                              }}
                            >
                              {f.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })()}
              </View>
            </View>
          <FlatList
            data={filteredLeads}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}
          />
          </>
        )}
      </View>
    </>
  );

  if (Platform.OS === "web") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <WebContainer>{content}</WebContainer>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {content}
    </SafeAreaView>
  );
}
