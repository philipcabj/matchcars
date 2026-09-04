import { CustomAlert } from "@/components/CustomAlert";
import { OfferCard } from "@/components/OfferCard";
import { DownloadAppBanner } from "@/components/DownloadAppBanner";
import { Header } from "@/components/Header";
import { WebContainer } from "@/components/WebContainer";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { sendNotificationEmail } from "@/lib/mail";
import { sendPushNotification } from "@/lib/notifications";
import { submitSellerRating } from "@/lib/ratings";
import { Offer, LeadStatus } from "@/types/commerce";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { addDoc, arrayUnion, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, FlatList, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ChatWithUserScreen() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const router = useRouter();
  const { uid, name: paramName, vehicleId, vehicleData: vehicleDataParam, conversationId: conversationIdParam } = useLocalSearchParams<{ uid: string; name?: string; vehicleId?: string; vehicleData?: string; conversationId?: string }>();
  const peerUid = typeof uid === "string" ? uid : "";
  const [loading, setLoading] = useState(true);
  const [peerName, setPeerName] = useState<string>("");
  const [peerInitials, setPeerInitials] = useState<string>("MC");
  const [peerAvatarColor, setPeerAvatarColor] = useState<string>(theme.accent);
  const [peerPhotoUrl, setPeerPhotoUrl] = useState<string | null>(null);
  const [peerPushToken, setPeerPushToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ id: string; senderId: string; text: string; createdAt: any }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const listRef = useRef<FlatList<any>>(null);
  const [convReadBy, setConvReadBy] = useState<string[]>([]);
  const [convLastSenderId, setConvLastSenderId] = useState<string | null>(null);
  const [peerTypingAt, setPeerTypingAt] = useState<any>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inputHeight, setInputHeight] = useState<number>(40);
  const sendScale = useRef(new Animated.Value(1)).current;

  // Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: "",
    message: "",
    type: "info" as "success" | "error" | "info" | "warning"
  });
  const [blockConfirmVisible, setBlockConfirmVisible] = useState(false);
  const [cancelDealConfirmVisible, setCancelDealConfirmVisible] = useState(false);
  const [markingAsSold, setMarkingAsSold] = useState(false);
  const [saleData, setSaleData] = useState<any>(null);
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);

  const showAlert = (title: string, message: string, type: "success" | "error" | "info" | "warning" = "info") => {
    setAlertConfig({ title, message, type });
    setAlertVisible(true);
  };

  const [activeVehicleData, setActiveVehicleData] = useState<any>(null);
  const [currentVehicleId, setCurrentVehicleId] = useState<string | null>(vehicleId || null);

  useEffect(() => {
    if (vehicleId) setCurrentVehicleId(vehicleId);
  }, [vehicleId]);

  // Initial load from params
  useEffect(() => {
    if (vehicleDataParam) {
        try {
            const parsed = JSON.parse(vehicleDataParam);
            const normalized = {
                ...parsed,
                cover: parsed.coverImage ?? parsed.images?.cover ?? parsed.images?.gallery?.[0] ?? parsed.cover ?? ""
            };
            setActiveVehicleData(normalized);
        } catch {}
    }
  }, [vehicleDataParam]);

  // Real-time listener for vehicle data (if vehicleId exists)
  useEffect(() => {
    if (!currentVehicleId) return;
    
    // Si ya tenemos una cover válida de los params, quizás no sea urgente, 
    // pero igual escuchamos cambios para precio/estado, etc.
    // La prioridad es que si NO hay cover, esto la traiga.

    const unsub = onSnapshot(doc(db, "vehicles", currentVehicleId), (snap) => {
      if (snap.exists()) {
        const v = snap.data() as any;
        const cover = v.coverImage ?? v.images?.cover ?? v.images?.gallery?.[0] ?? v.cover ?? "";
        setActiveVehicleData((prev: any) => ({
          ...(prev || {}),
          id: snap.id,
          brand: v.brand,
          model: v.model,
          year: v.year,
          price: v.price,
          currency: v.currency,
          status: v.status,
          cover: cover || prev?.cover || "",
          sellerId: v.userId || prev?.sellerId || null,
        }));
      }
    });

    return () => unsub();
  }, [currentVehicleId]);

  const resolveLeadParticipants = async () => {
    if (!user?.uid || !peerUid) return null;
    const vid = currentVehicleId || activeVehicleData?.id || (vehicleId as string | undefined) || null;
    if (!vid) return null;
    let sellerId = activeVehicleData?.sellerId as string | undefined;
    if (!sellerId) {
      try {
        const vSnap = await getDoc(doc(db, "vehicles", vid));
        if (vSnap.exists()) {
          const v = vSnap.data() as any;
          sellerId = v.userId as string | undefined;
          if (sellerId) {
            setActiveVehicleData((prev: any) => ({
              ...(prev || {}),
              sellerId,
            }));
          }
        }
      } catch {}
    }
    if (!sellerId) return null;
    const buyerId = sellerId === user.uid ? peerUid : user.uid;
    return { sellerId, buyerId, vehicleId: vid };
  };

  const handleOfferAction = async (action: "accept" | "reject" | "withdraw", counterData?: { amount: number; currency: "ARS" | "USD"; note?: string }) => {
    if (!activeOffer || !user?.uid) return;
    const isSeller = user.uid === activeOffer.sellerId;
    const now = serverTimestamp();
    const offerRef = doc(db, "offers", activeOffer.id);
    const leadRef = doc(db, "leads", activeOffer.leadId);

    if (action === "accept") {
      const acceptedAmount = activeOffer.status === "countered" && activeOffer.counterAmount
        ? activeOffer.counterAmount : activeOffer.amount;
      const acceptedCurrency = activeOffer.status === "countered" && activeOffer.counterCurrency
        ? activeOffer.counterCurrency : activeOffer.currency;
      await updateDoc(offerRef, { status: "accepted", resolvedAt: now, updatedAt: now });
      await updateDoc(leadRef, {
        "offer.status": "accepted", status: "won", wonAt: now,
        dealPrice: acceptedAmount, dealCurrency: acceptedCurrency,
      }).catch(() => {});
      const msgText = `Oferta aceptada: ${acceptedCurrency} ${Number(acceptedAmount).toLocaleString("es-AR")}`;
      await addDoc(collection(db, "conversations", convId, "messages"), { senderId: user.uid, text: msgText, createdAt: now });
      await updateDoc(doc(db, "conversations", convId), { lastMessage: msgText, lastSenderId: user.uid, updatedAt: now });
      // Notify the other party
      const notifyUid = isSeller ? activeOffer.buyerId : activeOffer.sellerId;
      const notifType = isSeller ? "offer_accepted" : "counter_accepted";
      addDoc(collection(db, "users", notifyUid, "offer_notifications"), {
        type: notifType,
        offerId: activeOffer.id,
        conversationId: convId,
        vehicleId: activeOffer.vehicleId,
        buyerId: activeOffer.buyerId,
        sellerId: activeOffer.sellerId,
        amount: acceptedAmount,
        currency: acceptedCurrency,
        vehicleSnapshot: activeOffer.vehicleSnapshot ?? {},
        buyerSnapshot: activeOffer.buyerSnapshot ?? {},
        read: false,
        createdAt: now,
      }).catch(() => {});

      {
        const carModel = `${activeOffer.vehicleSnapshot?.brand ?? ""} ${activeOffer.vehicleSnapshot?.model ?? ""}`.trim();
        const amountText = `${acceptedCurrency} ${Number(acceptedAmount).toLocaleString("es-AR")}`;
        sendNotificationEmail(notifType, {
          recipientUid: notifyUid,
          senderName: "MatchCars",
          subject: notifType === "offer_accepted" ? `¡Tu oferta por ${carModel} fue aceptada!` : `¡Tu contraoferta por ${carModel} fue aceptada!`,
          carModel,
          amount: amountText,
        }).catch(() => {});
        if (peerPushToken) {
          sendPushNotification(peerPushToken, "¡Acuerdo cerrado!", `Llegaron a un acuerdo por ${amountText} · ${carModel}`, { url: `matchcars://chat/${user.uid}${currentVehicleId ? `?vehicleId=${currentVehicleId}` : ""}` });
        }
      }
    } else if (action === "reject") {
      await updateDoc(offerRef, { status: "rejected", resolvedAt: now, updatedAt: now });
      await updateDoc(leadRef, { "offer.status": "rejected" }).catch(() => {});
      const msgText = isSeller ? "Oferta rechazada" : "Contraoferta rechazada";
      await addDoc(collection(db, "conversations", convId, "messages"), { senderId: user.uid, text: msgText, createdAt: now });
      await updateDoc(doc(db, "conversations", convId), { lastMessage: msgText, lastSenderId: user.uid, updatedAt: now });
    } else if (action === "withdraw") {
      await updateDoc(offerRef, { status: "withdrawn", updatedAt: now });
      await updateDoc(leadRef, {
        "offer.status": "withdrawn",
        ...(activeOffer.status === "accepted" ? { status: "contacted" } : {}),
      }).catch(() => {});
      // Si era un acuerdo aceptado, notificar a la otra parte y revertir vehículo si es el vendedor
      if (activeOffer.status === "accepted") {
        const notifyUid = isSeller ? activeOffer.buyerId : activeOffer.sellerId;
        if (notifyUid) {
          addDoc(collection(db, "users", notifyUid, "offer_notifications"), {
            type: "deal_canceled",
            offerId: activeOffer.id,
            vehicleId: activeOffer.vehicleId,
            buyerId: activeOffer.buyerId,
            sellerId: activeOffer.sellerId,
            vehicleSnapshot: activeOffer.vehicleSnapshot ?? {},
            read: false,
            createdAt: now,
          }).catch(() => {});

          const carModel = `${activeOffer.vehicleSnapshot?.brand ?? ""} ${activeOffer.vehicleSnapshot?.model ?? ""}`.trim();
          sendNotificationEmail("deal_canceled", {
            recipientUid: notifyUid,
            senderName: "MatchCars",
            subject: `El acuerdo por ${carModel} fue cancelado`,
            carModel,
          }).catch(() => {});
        }
        if (isSeller && activeOffer.vehicleId) {
          updateDoc(doc(db, "vehicles", activeOffer.vehicleId), {
            status: "available", published: true,
          }).catch(() => {});
        }
      }
    } else if (counterData && isSeller) {
      await updateDoc(offerRef, {
        status: "countered", counterAmount: counterData.amount, counterCurrency: counterData.currency,
        ...(counterData.note ? { counterNote: counterData.note } : {}), updatedAt: now,
      });
      await updateDoc(leadRef, {
        "offer.status": "countered", "offer.counterAmount": counterData.amount,
        "offer.counterCurrency": counterData.currency,
        ...(counterData.note ? { "offer.counterNote": counterData.note } : {}),
      }).catch(() => {});
      const msgText = `Contraoferta: ${counterData.currency} ${Number(counterData.amount).toLocaleString("es-AR")}`;
      await addDoc(collection(db, "conversations", convId, "messages"), { senderId: user.uid, text: msgText, createdAt: now });
      await updateDoc(doc(db, "conversations", convId), { lastMessage: msgText, lastSenderId: user.uid, updatedAt: now });
      // Notify buyer
      addDoc(collection(db, "users", activeOffer.buyerId, "offer_notifications"), {
        type: "counter_received",
        offerId: activeOffer.id,
        conversationId: convId,
        vehicleId: activeOffer.vehicleId,
        buyerId: activeOffer.buyerId,
        sellerId: user.uid,
        amount: counterData.amount,
        currency: counterData.currency,
        vehicleSnapshot: activeOffer.vehicleSnapshot ?? {},
        buyerSnapshot: activeOffer.buyerSnapshot ?? {},
        read: false,
        createdAt: now,
      }).catch(() => {});

      {
        const myName = (profile?.firstName && profile?.lastName)
          ? `${profile.firstName} ${profile.lastName}`.trim()
          : (profile?.firstName || user.displayName || (user.email?.split('@')[0] ?? "El vendedor"));
        const carModel = `${activeOffer.vehicleSnapshot?.brand ?? ""} ${activeOffer.vehicleSnapshot?.model ?? ""}`.trim();
        const amountText = `${counterData.currency} ${Number(counterData.amount).toLocaleString("es-AR")}`;
        sendNotificationEmail("counter_received", {
          recipientUid: activeOffer.buyerId,
          senderName: myName,
          subject: `Te hicieron una contraoferta por ${carModel}`,
          carModel,
          amount: amountText,
        }).catch(() => {});
        if (peerPushToken) {
          sendPushNotification(peerPushToken, "Te hicieron una contraoferta", `${myName} contraofertó ${amountText} por ${carModel}`, { url: `matchcars://chat/${user.uid}${currentVehicleId ? `?vehicleId=${currentVehicleId}` : ""}` });
        }
      }
    }
  };

  // Con comprador real: el auto pasa a "reserved" (no "sold" todavía) hasta
  // que el comprador confirme que lo recibió (ver handleConfirmReceived /
  // handleDenyReceived más abajo) — evita cerrar la venta unilateralmente.
  // Sin buyerId (no debería pasar acá: este botón solo existe si hay una
  // oferta con comprador real) se deja como red de seguridad yendo directo
  // a "sold", igual que antes.
  const handleMarkAsSold = async () => {
    if (!activeOffer?.vehicleId || !user?.uid || markingAsSold) return;
    setMarkingAsSold(true);
    try {
      const vehicleRef = doc(db, "vehicles", activeOffer.vehicleId);
      const offerRef = doc(db, "offers", activeOffer.id);
      // ID = vehicleId → un único documento de venta por vehículo, sin duplicados
      const saleRef = doc(db, "sales", activeOffer.vehicleId);
      const buyerId = activeOffer.buyerId ?? peerUid;
      const pendingConfirmation = !!buyerId;
      const deadline = Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1000);
      await runTransaction(db, async (t) => {
        const vehicleSnap = await t.get(vehicleRef);
        if (!vehicleSnap.exists()) throw new Error("Vehículo no encontrado.");
        t.update(vehicleRef, {
          status: pendingConfirmation ? "reserved" : "sold",
          published: false,
          soldAt: serverTimestamp(),
          soldViaOfferId: activeOffer.id,
        });
        t.update(offerRef, { vehicleSold: true });
        t.set(saleRef, {
          vehicleId: activeOffer.vehicleId,
          sellerId: user.uid,
          buyerId,
          finalPrice: activeOffer.counterAmount ?? activeOffer.amount ?? 0,
          currency: activeOffer.counterCurrency ?? activeOffer.currency ?? "ARS",
          soldAt: serverTimestamp(),
          source: "matchcars",
          vehicleSnapshot: activeOffer.vehicleSnapshot ?? {},
          confirmedByBuyer: pendingConfirmation ? null : true,
          ...(pendingConfirmation ? { buyerConfirmDeadline: deadline } : { confirmedAt: serverTimestamp() }),
        }, { merge: true });
      });
      showAlert(
        pendingConfirmation ? "¡Listo!" : "¡Venta registrada!",
        pendingConfirmation ? "Le avisamos al comprador — se confirma cuando él lo reciba." : "El vehículo fue marcado como vendido.",
        "success"
      );
      if (buyerId) {
        addDoc(collection(db, "users", buyerId, "offer_notifications"), {
          type: "vehicle_sold", offerId: activeOffer.id, vehicleId: activeOffer.vehicleId,
          sellerId: user.uid, buyerId,
          vehicleSnapshot: activeOffer.vehicleSnapshot ?? {}, read: false, createdAt: serverTimestamp(),
        }).catch(() => {});

        const carModel = `${activeOffer.vehicleSnapshot?.brand ?? ""} ${activeOffer.vehicleSnapshot?.model ?? ""}`.trim();
        sendNotificationEmail("vehicle_sold", {
          recipientUid: buyerId,
          senderName: "MatchCars",
          subject: `Confirmá la recepción de tu ${carModel}`,
          carModel,
        }).catch(() => {});
        if (peerPushToken) {
          sendPushNotification(peerPushToken, "Confirmá tu compra", `El vendedor marcó ${carModel} como entregado — confirmá que lo recibiste.`, { url: `matchcars://chat/${user.uid}${currentVehicleId ? `?vehicleId=${currentVehicleId}` : ""}` });
        }
      }
    } catch (err: any) {
      showAlert("Error", err?.message ?? "No se pudo marcar como vendido.", "error");
    } finally {
      setMarkingAsSold(false);
    }
  };

  const [confirmingReceipt, setConfirmingReceipt] = useState(false);

  const handleConfirmReceived = async () => {
    if (!currentVehicleId || !user?.uid || confirmingReceipt) return;
    setConfirmingReceipt(true);
    try {
      const vehicleRef = doc(db, "vehicles", currentVehicleId);
      const saleRef = doc(db, "sales", currentVehicleId);
      const sellerId = activeVehicleData?.sellerId;
      await runTransaction(db, async (t) => {
        t.update(vehicleRef, { status: "sold" });
        t.update(saleRef, { confirmedByBuyer: true, confirmedAt: serverTimestamp() });
      });
      showAlert("¡Gracias!", "Venta confirmada. Ahora podés calificar al vendedor.", "success");
      if (sellerId) {
        const carModel = `${activeVehicleData?.brand ?? ""} ${activeVehicleData?.model ?? ""}`.trim();
        sendNotificationEmail("vehicle_sold", { recipientUid: sellerId, senderName: "MatchCars", subject: `¡Venta confirmada! ${carModel}`, carModel }).catch(() => {});
        if (peerPushToken) {
          sendPushNotification(peerPushToken, "¡Venta confirmada!", `El comprador confirmó la recepción de ${carModel}.`, { url: `matchcars://chat/${user.uid}${currentVehicleId ? `?vehicleId=${currentVehicleId}` : ""}` });
        }
      }
    } catch (err: any) {
      showAlert("Error", err?.message ?? "No se pudo confirmar.", "error");
    } finally {
      setConfirmingReceipt(false);
    }
  };

  const handleDenyReceived = async () => {
    if (!currentVehicleId || !user?.uid || confirmingReceipt) return;
    setConfirmingReceipt(true);
    try {
      const vehicleRef = doc(db, "vehicles", currentVehicleId);
      const saleRef = doc(db, "sales", currentVehicleId);
      const participants = await resolveLeadParticipants();
      const sellerId = activeVehicleData?.sellerId;
      await runTransaction(db, async (t) => {
        t.update(vehicleRef, { status: "available", published: true });
        t.update(saleRef, { confirmedByBuyer: false });
      });
      if (participants) {
        const leadId = `${participants.sellerId}_${participants.buyerId}_${participants.vehicleId}`;
        await updateDoc(doc(db, "leads", leadId), {
          status: "negotiation", revertedAt: serverTimestamp(), revertReason: "buyer_declined",
        }).catch(() => {});
      }
      showAlert("Listo", "Le avisamos al vendedor. El auto vuelve a estar disponible.", "info");
      if (sellerId) {
        const carModel = `${activeVehicleData?.brand ?? ""} ${activeVehicleData?.model ?? ""}`.trim();
        sendNotificationEmail("deal_canceled", { recipientUid: sellerId, senderName: "MatchCars", subject: `${carModel}: el comprador indicó que no lo recibió`, carModel }).catch(() => {});
        if (peerPushToken) {
          sendPushNotification(peerPushToken, "La venta no se confirmó", `El comprador indicó que no recibió ${carModel} — volvió a estar disponible.`, { url: `matchcars://chat/${user.uid}${currentVehicleId ? `?vehicleId=${currentVehicleId}` : ""}` });
        }
      }
    } catch (err: any) {
      showAlert("Error", err?.message ?? "No se pudo actualizar.", "error");
    } finally {
      setConfirmingReceipt(false);
    }
  };

  const syncLeadOnMessage = async (messageText: string, createdAt: any) => {
    const participants = await resolveLeadParticipants();
    if (!participants || !user?.uid) return;
    const { sellerId, buyerId, vehicleId } = participants;
    const leadId = `${sellerId}_${buyerId}_${vehicleId}`;
    const ref = doc(db, "leads", leadId);
    const existing = await getDoc(ref);
    const ts = createdAt || serverTimestamp();
    const isSellerSender = user.uid === sellerId;

    if (!existing.exists()) {
      const data: any = {
        sellerId,
        buyerId,
        vehicleId,
        conversationId: convId,
        status: "new" as LeadStatus,
        createdAt: ts,
        lastMessageAt: ts,
        lastSenderId: user.uid,
        lastMessage: messageText,
        unreadCount: isSellerSender ? 0 : 1,
        estimatedValue: activeVehicleData?.price ?? null,
        currency: activeVehicleData?.currency === "USD" ? "USD" : "ARS",
        source: "other",
        messageCount: 1,
      };
      const buyerSnapshot =
        buyerId === user.uid
          ? {
              firstName: profile?.firstName,
              lastName: profile?.lastName,
              initials: profile?.initials,
              avatarColor: profile?.avatarColor,
            }
          : {
              firstName: peerName,
              lastName: undefined,
              initials: peerInitials,
              avatarColor: peerAvatarColor,
            };
      data.buyerSnapshot = buyerSnapshot;
      if (activeVehicleData) {
        data.vehicleSnapshot = {
          brand: activeVehicleData.brand,
          model: activeVehicleData.model,
          year: activeVehicleData.year,
          price: activeVehicleData.price,
          currency: activeVehicleData.currency === "USD" ? "USD" : "ARS",
          coverUrl: activeVehicleData.cover || null,
        };
      }
      await setDoc(ref, data);
      return;
    }

    const prev = existing.data() as any;
    const updates: any = {
      lastMessageAt: ts,
      lastSenderId: user.uid,
      lastMessage: messageText,
      messageCount: (prev.messageCount || 0) + 1,
    };

    if (isSellerSender) {
      updates.lastSellerReplyAt = ts;
      if (prev.status === "new") {
        updates.status = "contacted" as LeadStatus;
      }
      updates.unreadCount = 0;
    } else {
      updates.unreadCount = (prev.unreadCount || 0) + 1;
    }

    if (!prev.vehicleSnapshot && activeVehicleData) {
      updates.vehicleSnapshot = {
        brand: activeVehicleData.brand,
        model: activeVehicleData.model,
        year: activeVehicleData.year,
        price: activeVehicleData.price,
        currency: activeVehicleData.currency === "USD" ? "USD" : "ARS",
        coverUrl: activeVehicleData.cover || null,
      };
    }

    await updateDoc(ref, updates);
  };

  const markLeadAsReadForSeller = async () => {
    const participants = await resolveLeadParticipants();
    if (!participants || !user?.uid) return;
    const { sellerId, buyerId, vehicleId } = participants;
    if (user.uid !== sellerId) return;
    const leadId = `${sellerId}_${buyerId}_${vehicleId}`;
    const ref = doc(db, "leads", leadId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    await updateDoc(ref, { unreadCount: 0 });
  };

  // Si quien navega ya sabe qué documento abrir (ej. messages.tsx, que tiene
  // el id real de la conversación tapeada en la lista) lo pasa directo por
  // `conversationId` y se usa tal cual, sin recalcular nada — así una
  // conversación vieja (esquema par-de-usuarios, de antes de scopear por
  // auto) se sigue abriendo en el mismo documento donde está su historial,
  // en vez de calcular un id "por auto" que no existe. Recalcular por
  // vehicleId (mismo criterio que leadId = sellerId_buyerId_vehicleId) solo
  // aplica para ARRANCAR una conversación nueva sin id conocido todavía (ej.
  // "Mensajear"/"Hacer oferta" desde car/[id].tsx). Sin auto en contexto
  // (ej. "Mensaje" desde un perfil), es el hilo general de siempre.
  const convId = useMemo(() => {
    if (conversationIdParam) return String(conversationIdParam);
    const a = String(user?.uid || "");
    const b = String(peerUid || "");
    const pair = [a, b].sort().join("_");
    return currentVehicleId ? `${pair}_${currentVehicleId}` : pair;
  }, [conversationIdParam, user?.uid, peerUid, currentVehicleId]);

  const [activeOffer, setActiveOffer] = useState<(Offer & { id: string }) | null>(null);

  useEffect(() => {
    if (!convId || !user?.uid) return;
    const uid = user.uid;
    const validStatuses = new Set(["pending", "countered", "accepted", "rejected"]);

    let asBuyer: (Offer & { id: string })[] = [];
    let asSeller: (Offer & { id: string })[] = [];

    const pick = () => {
      const all = [...asBuyer, ...asSeller]
        .filter(o => validStatuses.has(o.status))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setActiveOffer(all[0] ?? null);
    };

    // Two separate queries so the security rule (buyerId/sellerId == uid) is always satisfied
    const unsub1 = onSnapshot(
      query(collection(db, "offers"), where("conversationId", "==", convId), where("buyerId", "==", uid)),
      (snap) => { asBuyer = snap.docs.map(d => ({ id: d.id, ...d.data() } as Offer & { id: string })); pick(); },
      (err) => console.error("[offers/buyerId listener]", err.code, err.message)
    );
    const unsub2 = onSnapshot(
      query(collection(db, "offers"), where("conversationId", "==", convId), where("sellerId", "==", uid)),
      (snap) => { asSeller = snap.docs.map(d => ({ id: d.id, ...d.data() } as Offer & { id: string })); pick(); },
      (err) => console.error("[offers/sellerId listener]", err.code, err.message)
    );

    return () => { unsub1(); unsub2(); };
  }, [convId, user?.uid]);

  // Si la conversación se abrió sin auto en contexto (ej. desde la pestaña
  // Mensajes, cuyo doc de conversación puede no tener vehicleId) pero hay una
  // oferta formal, el auto de la oferta ES el auto de la conversación: lo
  // adoptamos para que aparezca la tarjeta del vehículo, los datos en vivo y
  // los paneles de venta/confirmación.
  useEffect(() => {
    if (!currentVehicleId && activeOffer?.vehicleId) {
      setCurrentVehicleId(activeOffer.vehicleId);
    }
    // Semilla desde el snapshot de la oferta — así hay tarjeta de auto aunque
    // el listener de /vehicles todavía no respondió o la publicación se borró.
    if (activeOffer?.vehicleSnapshot?.brand && !activeVehicleData) {
      const vs = activeOffer.vehicleSnapshot;
      setActiveVehicleData({
        id: activeOffer.vehicleId,
        brand: vs.brand ?? "",
        model: vs.model ?? "",
        year: vs.year ?? null,
        price: vs.price ?? null,
        currency: vs.currency === "USD" ? "USD" : "ARS",
        cover: vs.coverUrl || "",
        sellerId: activeOffer.sellerId ?? null,
      });
    }
  }, [currentVehicleId, activeOffer, activeVehicleData]);

  // Listener del documento de venta — sigue al auto de ESTA conversación
  // (currentVehicleId), no a activeOffer: un cierre manual (portal, sin
  // oferta formal) también tiene que poder mostrar el panel de confirmar/
  // calificar acá.
  useEffect(() => {
    if (!currentVehicleId) { setSaleData(null); return; }
    const unsub = onSnapshot(
      doc(db, "sales", currentVehicleId),
      (snap) => setSaleData(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (err) => console.error("[sale listener]", err.code)
    );
    return () => unsub();
  }, [currentVehicleId]);

  const handleSubmitRating = async () => {
    // Usa saleData (siempre tiene sellerId/buyerId, venga de una oferta
    // formal o de un cierre manual desde el portal) en vez de activeOffer,
    // que puede no existir en el segundo caso.
    if (!ratingScore || !saleData || !currentVehicleId || !user?.uid || submittingRating) return;
    const isSeller = user.uid === saleData.sellerId;
    const ratedUserId = isSeller ? saleData.buyerId : saleData.sellerId;
    if (!ratedUserId) return;
    setSubmittingRating(true);
    try {
      if (isSeller) {
        // Vendedor califica al comprador — sin pantalla pública que lo
        // muestre todavía, se guarda tal cual en la venta.
        await updateDoc(doc(db, "sales", currentVehicleId), {
          ratingBySeller: { score: ratingScore, comment: ratingComment.trim() || null, ratedAt: serverTimestamp(), ratedByUid: user.uid },
        });
      } else {
        // Comprador califica al vendedor — mismo camino que Perfil > Mis
        // Compras (lib/ratings.ts), así se ve reflejado en sellerRating y en
        // `reviews`. Antes esto escribía en ratingSum/ratingCount, campos
        // que ningún lado de la app lee — la calificación se guardaba y
        // desaparecía.
        await submitSellerRating({
          vehicleId: currentVehicleId,
          sellerId: saleData.sellerId,
          reviewerId: user.uid,
          reviewerName: profile?.firstName || profile?.lastName ? `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() : user.displayName || user.email || "Anónimo",
          reviewerPhotoUrl: (profile as any)?.photoURL || user.photoURL || null,
          vehicleBrand: saleData.vehicleSnapshot?.brand ?? null,
          vehicleModel: saleData.vehicleSnapshot?.model ?? null,
          score: ratingScore,
          comment: ratingComment.trim(),
        });
      }
      setRatingScore(0);
      setRatingComment("");
      showAlert("¡Gracias!", "Tu calificación fue enviada.", "success");
    } catch (err: any) {
      showAlert("Error", err?.message ?? "No se pudo enviar la calificación.", "error");
    } finally {
      setSubmittingRating(false);
    }
  };

  const lastSentMessageId = useMemo(() => {
    const mine = messages.filter((m) => m.senderId === user?.uid);
    return mine.length > 0 ? mine[mine.length - 1].id : null;
  }, [messages, user?.uid]);

  const updateTyping = () => {
    if (!user?.uid || !peerUid || !convId) return;
    const now = Date.now();
    const cRef = doc(db, "conversations", convId);
    updateDoc(cRef, {
      typing: {
        [user.uid]: {
          seconds: Math.floor(now / 1000),
        },
      },
    }).catch(() => {});
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      updateDoc(cRef, {
        typing: {
          [user.uid]: null,
        },
      }).catch(() => {});
    }, 7000);
  };

  useEffect(() => {
    if (!user?.uid || !peerUid || !convId) return;
    const cRef = doc(db, "conversations", convId);
    const unsub = onSnapshot(cRef, (snap) => {
      if (snap.exists()) {
        const d = snap.data() as any;
        setConvReadBy(Array.isArray(d.readBy) ? d.readBy : []);
        setConvLastSenderId(typeof d.lastSenderId === "string" ? d.lastSenderId : null);
        const typingObj = d.typing || {};
        const stamp = typingObj?.[peerUid] || null;
        setPeerTypingAt(stamp || null);
        if (stamp) {
          if (peerTypingClearRef.current) clearTimeout(peerTypingClearRef.current);
          peerTypingClearRef.current = setTimeout(() => setPeerTypingAt(null), 6000);
        }
      }
    });
    return () => { unsub(); if (peerTypingClearRef.current) clearTimeout(peerTypingClearRef.current); };
  }, [user?.uid, peerUid, convId]);

  useEffect(() => {
    if (typeof paramName === "string" && paramName.trim()) {
      setPeerName(paramName);
    }
  }, [paramName]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => {
      showSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!user?.uid || !peerUid) return;
    const checkBlocked = async () => {
        try {
            const blockedRef = doc(db, "users", user.uid, "blocked", peerUid);
            const snap = await getDoc(blockedRef);
            if (snap.exists()) {
                setIsBlocked(true);
            }
        } catch {}
    };
    checkBlocked();
  }, [user?.uid, peerUid]);

  useEffect(() => {
    if (!peerUid) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const pSnap = await getDoc(doc(db, "users", peerUid));
        const pd = pSnap.data() as any;
        const name = pd?.firstName || pd?.lastName ? `${pd?.firstName ?? ""} ${pd?.lastName ?? ""}`.trim() : (pd?.displayName || pd?.email || "Usuario");
        setPeerName(name);
        setPeerPushToken(pd?.pushToken || null);
        let initials = String(pd?.initials || "");
        if (!initials) {
          const dn = String(pd?.displayName || "").trim();
          if (dn) {
            const parts = dn.split(/\s+/).filter(Boolean);
            const first = parts[0]?.[0] ?? "";
            const second = parts[1]?.[0] ?? "";
            initials = (first + second) || (parts[0]?.slice(0, 2) ?? "");
          } else {
            const fi = String(pd?.firstName || "").trim()[0] ?? "";
            const li = String(pd?.lastName || "").trim()[0] ?? "";
            initials = (fi + li) || (String(pd?.email || "").slice(0, 2) || "MC");
          }
          initials = initials.toUpperCase();
        }
        setPeerInitials(initials);
        setPeerAvatarColor(pd?.avatarColor || theme.accent);
        setPeerPhotoUrl(pd?.photoURL || pd?.avatar || null);
      } catch {
        setPeerName("Usuario");
        setPeerInitials("MC");
        setPeerAvatarColor(theme.accent);
        setPeerPhotoUrl(null);
      }
    })();
  }, [peerUid, theme.accent]);

  useEffect(() => {
    if (!user?.uid || !peerUid || !convId) {
      setLoading(false);
      return;
    }
    let unsub: (() => void) | undefined;
    let canceled = false;
    (async () => {
      try {
        const cRef = doc(db, "conversations", convId);
        const cSnap = await getDoc(cRef);
        
        const commonData: any = {
          members: [user.uid, peerUid],
          updatedAt: serverTimestamp(),
        };

        if (vehicleId) {
          commonData.vehicleId = vehicleId;
          if (activeVehicleData) {
            commonData.vehicleData = activeVehicleData;
          } else if (!activeVehicleData) {
             try {
                const vRef = doc(db, "vehicles", vehicleId);
                const vSnap = await getDoc(vRef);
                if (vSnap.exists()) {
                     const v = vSnap.data() as any;
                     const vData = {
                         id: vSnap.id,
                         brand: v.brand,
                         model: v.model,
                         year: v.year,
                         price: v.price,
                         currency: v.currency,
                         cover: v.coverImage ?? v.images?.cover ?? v.images?.gallery?.[0] ?? v.cover ?? ""
                     };
                     setActiveVehicleData(vData);
                     commonData.vehicleData = vData;
                }
             } catch {}
          }
        } else if (cSnap.exists()) {
            // Hilo general (sin vehicleId en los params): a lo sumo se muestra
            // el auto cacheado en el doc como contexto informativo, pero NUNCA
            // se cambia currentVehicleId acá — eso saltaría a un hilo por-auto
            // distinto a mitad de conversación. Un hilo general se queda general.
            const d = cSnap.data() as any;
            if (d.vehicleData && !activeVehicleData) {
                setActiveVehicleData(d.vehicleData);
            }
        }
        
        commonData.readBy = arrayUnion(user.uid);
        commonData[`lastSeen.${user.uid}`] = serverTimestamp();

        if (cSnap.exists()) {
          const data = cSnap.data() as any;
          const members: string[] = Array.isArray(data?.members) ? data.members : [];
          const ensureMembers = Array.from(new Set([...(members || []), user.uid, peerUid]));
          
          await updateDoc(cRef, {
            ...commonData,
            members: ensureMembers,
          });
        }
        await markLeadAsReadForSeller();
      } catch {}
      if (canceled) return;
      const ref = query(collection(db, "conversations", convId, "messages"), orderBy("createdAt", "asc"));
      unsub = onSnapshot(
        ref,
        (snap) => {
          if (!snap || !(snap as any).forEach) {
            setMessages([]);
            setLoading(false);
            return;
          }
          const arr: { id: string; senderId: string; text: string; createdAt: any }[] = [];
          snap.forEach((d) => {
            const data = d.data() as any;
            arr.push({ id: d.id, senderId: data.senderId, text: data.text, createdAt: data.createdAt });
          });
          setMessages(arr);
          setLoading(false);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
        },
        () => setLoading(false)
      );
    })();
    return () => { canceled = true; if (unsub) unsub(); };
  }, [user?.uid, peerUid, convId]);

  const send = async () => {
    const text = input.trim();
    if (!text || !user?.uid || !peerUid || !convId || sending) return;

    if (isBlocked) {
        showAlert("Usuario bloqueado", "No podés enviar mensajes a este usuario.", "error");
        return;
    }

    setSending(true);
    try {
      const cRef = doc(db, "conversations", convId);
      const cSnap = await getDoc(cRef);
      if (!cSnap.exists()) {
        await setDoc(cRef, { members: [user.uid, peerUid], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      } else {
        const data = cSnap.data() as any;
        const members: string[] = Array.isArray(data?.members) ? data.members : [];
        const ensureMembers = Array.from(new Set([...(members || []), user.uid, peerUid]));
        if (ensureMembers.length !== members.length) {
          await updateDoc(cRef, { members: ensureMembers, updatedAt: serverTimestamp() });
        }
      }
      const createdAt = serverTimestamp();
      await addDoc(collection(db, "conversations", convId, "messages"), { senderId: user.uid, text, createdAt });
      await updateDoc(cRef, {
        lastMessage: text,
        lastSenderId: user.uid,
        updatedAt: createdAt,
        readBy: [user.uid],
        deletedBy: [],
        [`lastSeen.${user.uid}`]: createdAt,
      });
      await syncLeadOnMessage(text, createdAt);

      // Send email notification
      const myName = (profile?.firstName && profile?.lastName) 
        ? `${profile.firstName} ${profile.lastName}`.trim()
        : (profile?.firstName || user.displayName || (user.email?.split('@')[0] ?? "Usuario")).trim();
      
      let carModel = "";
      // Try from local params
      if (activeVehicleData) {
        carModel = `${activeVehicleData.brand} ${activeVehicleData.model}`.trim();
      } 
      // Try from conversation doc if not in params
      else if (cSnap.exists()) {
        const d = cSnap.data() as any;
        if (d?.vehicleData) {
            carModel = `${d.vehicleData.brand} ${d.vehicleData.model}`.trim();
        }
      }

      sendNotificationEmail("message", {
        recipientUid: peerUid,
        recipientName: peerName,
        senderName: myName,
        senderUid: user.uid,
        subject: carModel ? `Consulta por ${carModel}` : `Nuevo mensaje de ${myName}`,
        messagePreview: text.length > 50 ? text.slice(0, 50) + "..." : text,
        carModel: carModel || undefined
      });

      if (peerPushToken) {
        logger.log("Sending push notification to:", peerPushToken);
        sendPushNotification(
            peerPushToken,
            myName,
            text,
            { url: `matchcars://chat/${user.uid}${currentVehicleId ? `?vehicleId=${currentVehicleId}` : ""}` }
        );
      } else {
        logger.log("No peer push token found for user:", peerUid);
      }

      setInput("");
    } catch (e: any) {
      showAlert("No se pudo enviar", String(e?.message || "Revisá tu conexión o intentá nuevamente."), "error");
    }
    setSending(false);
  };

  const handleBlockUser = () => {
    if (!user?.uid || !peerUid) return;
    setBlockConfirmVisible(true);
  };

  const confirmBlockUser = async () => {
    setBlockConfirmVisible(false);
    if (!user?.uid || !peerUid) return;
    try {
      const blockedRef = doc(db, "users", user.uid, "blocked", peerUid);
      if (isBlocked) {
        await deleteDoc(blockedRef);
        setIsBlocked(false);
        showAlert("Desbloqueado", `${peerName || "Usuario"} fue desbloqueado.`, "success");
      } else {
        await setDoc(blockedRef, { blockedAt: serverTimestamp(), uid: peerUid });
        setIsBlocked(true);
        showAlert("Bloqueado", `${peerName || "Usuario"} fue bloqueado. Ya no podrás intercambiar mensajes.`, "success");
      }
    } catch {
      showAlert("Error", "No se pudo completar la acción.", "error");
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Header />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ color: theme.text, fontSize: 16, textAlign: "center" }}>Para chatear, iniciá sesión o registrate.</Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
            <TouchableOpacity onPress={() => router.push("/login")} style={{ backgroundColor: theme.buttonBackground, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 }}>
              <Text style={{ color: theme.buttonText, fontWeight: "700" }}>Iniciar sesión</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/register")} style={{ backgroundColor: theme.accent, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 }}>
              <Text style={{ color: theme.buttonText, fontWeight: "700" }}>Registrarme</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <WebContainer>
          <Header title={peerName || "Chat"} showBack />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <Ionicons name="chatbubbles-outline" size={64} color={theme.textMuted} style={{ marginBottom: 20 }} />
              <Text style={{ color: theme.text, fontSize: 18, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' }}>
                  Chat disponible en la App
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 14, marginBottom: 30, textAlign: 'center', maxWidth: 400 }}>
                  Para chatear con {peerName || "el vendedor"}, por favor descargá nuestra aplicación móvil.
              </Text>
              <View style={{ width: '100%', maxWidth: 400 }}>
                <DownloadAppBanner message="Descargá la App para chatear" />
              </View>
          </View>
        </WebContainer>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        keyboardVerticalOffset={0}
      >
        <CustomAlert
          visible={alertVisible}
          title={alertConfig.title}
          message={alertConfig.message}
          type={alertConfig.type}
          onClose={() => setAlertVisible(false)}
        />
        <CustomAlert
          visible={blockConfirmVisible}
          title={isBlocked ? "Desbloquear usuario" : "Bloquear usuario"}
          message={isBlocked
            ? `¿Querés desbloquear a ${peerName || "este usuario"}? Podrás volver a intercambiar mensajes.`
            : `¿Querés bloquear a ${peerName || "este usuario"}? No podrás enviarle ni recibir mensajes de su parte.`}
          type="info"
          showCancel
          confirmText={isBlocked ? "Desbloquear" : "Bloquear"}
          cancelText="Cancelar"
          onClose={confirmBlockUser}
          onCancel={() => setBlockConfirmVisible(false)}
        />
        <CustomAlert
          visible={cancelDealConfirmVisible}
          title="Cancelar acuerdo"
          message="¿Estás seguro de que querés cancelar el acuerdo? La oferta quedará anulada y podrás volver a negociar."
          type="warning"
          showCancel
          confirmText="Sí, cancelar"
          cancelText="Volver"
          onClose={() => { setCancelDealConfirmVisible(false); handleOfferAction("withdraw"); }}
          onCancel={() => setCancelDealConfirmVisible(false)}
        />
        <Header
          showBack
          rightContent={
            <TouchableOpacity onPress={handleBlockUser} style={{ padding: 8 }}>
              <Ionicons
                name={isBlocked ? "lock-closed-outline" : "person-remove-outline"}
                size={22}
                color={isBlocked ? theme.accent : theme.textMuted}
              />
            </TouchableOpacity>
          }
          customTitle={
            <TouchableOpacity 
              onPress={() => router.push(`/user-profile/${peerUid}` as any)}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: peerAvatarColor,
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {peerPhotoUrl ? (
                  <ExpoImage source={{ uri: peerPhotoUrl }} style={{ width: 36, height: 36, borderRadius: 18 }} contentFit="cover" />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}>
                    {peerInitials}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, justifyContent: "center" }}>
                <Text
                  style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}
                  numberOfLines={1}
                >
                  {peerName || "Chat"}
                </Text>
                {peerTypingAt?.seconds && (Date.now() - peerTypingAt.seconds * 1000) < 5000 ? (
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                    Escribiendo…
                  </Text>
                ) : (
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                    Ver perfil
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          }
        />
        {activeVehicleData && (
          <TouchableOpacity 
            onPress={() => router.push(`/car/${activeVehicleData.id || currentVehicleId}` as any)}
            activeOpacity={0.8}
            style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.card, padding: 10, marginHorizontal: 16, marginTop: 10, borderRadius: 12, gap: 12, borderWidth: 1, borderColor: theme.badgeBorder }}
          >
            {activeVehicleData.cover ? (
              <ExpoImage
                source={{ uri: activeVehicleData.cover }}
                style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: theme.background }}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: theme.background, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="car-sport-outline" size={24} color={theme.textMuted} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: "700", fontSize: 15 }} numberOfLines={1}>
                {activeVehicleData.brand} {activeVehicleData.model} {activeVehicleData.year}
              </Text>
              <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 13, marginTop: 2 }}>
                {activeVehicleData.currency} {Number(activeVehicleData.price).toLocaleString("es-AR")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
          </TouchableOpacity>
        )}
        {activeVehicleData && (activeVehicleData.status === "sold" || activeVehicleData.status === "deleted") && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: theme.error + "15",
              borderColor: theme.error + "44",
              borderWidth: 1,
              borderRadius: 10,
              padding: 10,
              marginHorizontal: 16,
              marginTop: 8,
            }}
          >
            <Ionicons name="alert-circle" size={18} color={theme.error} />
            <Text style={{ color: theme.error, fontSize: 12, fontWeight: "600", flex: 1 }}>
              {activeVehicleData.status === "sold"
                ? "Este auto ya fue vendido — cualquier oferta nueva no va a poder concretarse."
                : "Esta publicación fue eliminada — cualquier oferta nueva no va a poder concretarse."}
            </Text>
          </View>
        )}
        {/* Active offer card */}
        {activeOffer && (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <OfferCard
              offer={activeOffer}
              viewerRole={user?.uid === activeOffer.sellerId ? "seller" : "buyer"}
              onAccept={() => handleOfferAction("accept")}
              onReject={() => handleOfferAction("reject")}
              onCounter={(amount, currency, note) => handleOfferAction("counter" as any, { amount, currency, note })}
              onWithdraw={() => handleOfferAction("withdraw")}
            />
            {activeOffer.status === "accepted" && ((activeOffer as any).vehicleSold || activeVehicleData?.status === "sold") && (() => {
              const isSeller = user?.uid === activeOffer.sellerId;
              const myRating = isSeller ? saleData?.ratingBySeller : saleData?.ratingByBuyer;
              const theirRating = isSeller ? saleData?.ratingByBuyer : saleData?.ratingBySeller;
              return (
                <View style={{ marginTop: 8, backgroundColor: "#10B98115", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#10B98144" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#10B981", fontWeight: "800", fontSize: 14 }}>¡Vehículo vendido!</Text>
                      <Text style={{ color: theme.textMuted, fontSize: 12 }}>La venta fue registrada exitosamente.</Text>
                    </View>
                  </View>
                  {/* Calificación */}
                  {!myRating ? (
                    <View style={{ borderTopWidth: 1, borderTopColor: theme.border ?? "#E5E7EB", paddingTop: 10 }}>
                      <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13, marginBottom: 6 }}>
                        {isSeller ? "Calificá al comprador" : "Calificá al vendedor"}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
                        {[1, 2, 3, 4, 5].map(star => (
                          <TouchableOpacity key={star} onPress={() => setRatingScore(star)}>
                            <Ionicons
                              name={star <= ratingScore ? "star" : "star-outline"}
                              size={30}
                              color="#F59E0B"
                            />
                          </TouchableOpacity>
                        ))}
                      </View>
                      {ratingScore > 0 && (
                        <>
                          <TextInput
                            value={ratingComment}
                            onChangeText={setRatingComment}
                            placeholder="Comentario opcional..."
                            placeholderTextColor={theme.textMuted}
                            multiline
                            style={{ backgroundColor: theme.inputBackground, color: theme.text, padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 8, minHeight: 50, textAlignVertical: "top" }}
                          />
                          <TouchableOpacity
                            onPress={handleSubmitRating}
                            disabled={submittingRating}
                            style={{ backgroundColor: "#F59E0B", borderRadius: 8, paddingVertical: 9, alignItems: "center", opacity: submittingRating ? 0.7 : 1 }}
                          >
                            <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>
                              {submittingRating ? "Enviando..." : "Enviar calificación"}
                            </Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  ) : (
                    <View style={{ borderTopWidth: 1, borderTopColor: theme.border ?? "#E5E7EB", paddingTop: 10, flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={{ flexDirection: "row", gap: 2 }}>
                        {[1, 2, 3, 4, 5].map(s => (
                          <Ionicons key={s} name={s <= myRating.score ? "star" : "star-outline"} size={16} color="#F59E0B" />
                        ))}
                      </View>
                      <Text style={{ color: theme.textMuted, fontSize: 12 }}>Tu calificación enviada</Text>
                      {!theirRating && (
                        <Text style={{ color: theme.textMuted, fontSize: 11, marginLeft: 4 }}>· Pendiente de la otra parte</Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })()}
            {activeOffer.status === "accepted" && !(activeOffer as any).vehicleSold && activeVehicleData?.status !== "sold" && user?.uid === activeOffer.sellerId && (
              <View style={{ marginTop: 8, backgroundColor: "#10B98115", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#10B98144" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <Ionicons name="checkmark-circle" size={28} color="#10B981" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#10B981", fontWeight: "700", fontSize: 14 }}>¡Precio acordado!</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>¿Querés marcar el auto como vendido?</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setCancelDealConfirmVisible(true)}
                    style={{ flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: "center", borderWidth: 1, borderColor: "#EF4444" }}
                  >
                    <Text style={{ color: "#EF4444", fontWeight: "600", fontSize: 13 }}>Cancelar acuerdo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleMarkAsSold}
                    disabled={markingAsSold}
                    style={{ flex: 2, backgroundColor: "#10B981", borderRadius: 8, paddingVertical: 9, alignItems: "center", opacity: markingAsSold ? 0.6 : 1 }}
                  >
                    <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>
                      {markingAsSold ? "Registrando..." : "Marcar vendido"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {activeOffer.status === "accepted" && !(activeOffer as any).vehicleSold && activeVehicleData?.status !== "sold" && user?.uid === activeOffer.buyerId && (
              <View style={{ marginTop: 8, backgroundColor: "#6366F115", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#6366F144", flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Ionicons name="checkmark-circle" size={26} color="#6366F1" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#6366F1", fontWeight: "700", fontSize: 14 }}>¡Oferta aceptada!</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>Esperando que el vendedor confirme la venta.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setCancelDealConfirmVisible(true)}
                  style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: "#EF4444" }}
                >
                  <Text style={{ color: "#EF4444", fontWeight: "600", fontSize: 12 }}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        {/* Confirmación de entrega — independiente de que haya oferta formal:
            un cierre manual (portal, sin oferta) también deja el auto en
            "reserved" y necesita este mismo panel del lado del comprador. */}
        {activeVehicleData?.status === "reserved" && saleData?.confirmedByBuyer === null && (() => {
          const isSeller = user?.uid === activeVehicleData?.sellerId;
          return (
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              <View style={{ backgroundColor: "#F59E0B15", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#F59E0B44" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Ionicons name="time-outline" size={24} color="#F59E0B" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#F59E0B", fontWeight: "800", fontSize: 14 }}>
                      {isSeller ? "Esperando confirmación del comprador" : "¿Recibiste tu auto?"}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                      {isSeller
                        ? "Le avisamos — la venta se cierra cuando confirme."
                        : "El vendedor marcó esta venta como entregada. Confirmá para calificarlo."}
                    </Text>
                  </View>
                </View>
                {!isSeller && (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                    <TouchableOpacity
                      disabled={confirmingReceipt}
                      onPress={handleConfirmReceived}
                      style={{ flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: "center", backgroundColor: "#10B981", opacity: confirmingReceipt ? 0.7 : 1 }}
                    >
                      <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>Confirmé que lo recibí</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={confirmingReceipt}
                      onPress={handleDenyReceived}
                      style={{ flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: "center", borderWidth: 1, borderColor: "#EF4444", opacity: confirmingReceipt ? 0.7 : 1 }}
                    >
                      <Text style={{ color: "#EF4444", fontWeight: "700", fontSize: 13 }}>No lo recibí</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          );
        })()}
        {/* Calificación tras confirmar — igual criterio que el panel de arriba,
            pero sin depender de que haya offer: sigue a saleData directamente. */}
        {!activeOffer && saleData?.confirmedByBuyer === true && (() => {
          const isSeller = user?.uid === saleData?.sellerId;
          const myRating = isSeller ? saleData?.ratingBySeller : saleData?.ratingByBuyer;
          if (myRating) return null;
          return (
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              <View style={{ backgroundColor: "#10B98115", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#10B98144" }}>
                <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13, marginBottom: 6 }}>
                  {isSeller ? "Calificá al comprador" : "Calificá al vendedor"}
                </Text>
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <TouchableOpacity key={star} onPress={() => setRatingScore(star)}>
                      <Ionicons name={star <= ratingScore ? "star" : "star-outline"} size={30} color="#F59E0B" />
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  value={ratingComment}
                  onChangeText={setRatingComment}
                  placeholder="Comentario (opcional)"
                  placeholderTextColor={theme.textMuted}
                  style={{ borderWidth: 1, borderColor: theme.badgeBorder, borderRadius: 8, padding: 8, color: theme.text, fontSize: 13, marginBottom: 8, minHeight: 40 }}
                  multiline
                />
                <TouchableOpacity
                  onPress={handleSubmitRating}
                  disabled={!ratingScore || submittingRating}
                  style={{ backgroundColor: "#F59E0B", borderRadius: 8, paddingVertical: 9, alignItems: "center", opacity: submittingRating || !ratingScore ? 0.7 : 1 }}
                >
                  <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>
                    {submittingRating ? "Enviando..." : "Enviar calificación"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}
        <View style={{ flex: 1, paddingHorizontal: 16 }}>
          {loading ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const time = item.createdAt ? (item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt.seconds * 1000)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
                const isLastSent = item.id === lastSentMessageId;
                const peerHasRead = convReadBy.includes(peerUid);
                return item.senderId === user.uid ? (
                  <View style={{ alignItems: "flex-end", paddingVertical: 4 }}>
                    <View style={{ maxWidth: "80%", backgroundColor: theme.accent, padding: 12, borderRadius: 16, borderBottomRightRadius: 2 }}>
                      <Text style={{ color: theme.buttonText, fontSize: 16 }}>{item.text}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-end", marginTop: 4, gap: 3 }}>
                        <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 10 }}>{time}</Text>
                        <Ionicons
                          name={isLastSent && peerHasRead ? "checkmark-done" : "checkmark"}
                          size={14}
                          color={isLastSent && peerHasRead ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.55)"}
                        />
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={{ alignItems: "flex-start", paddingVertical: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: peerAvatarColor, alignItems: "center", justifyContent: "center", marginBottom: 4, overflow: "hidden" }}>
                        {peerPhotoUrl ? (
                          <ExpoImage source={{ uri: peerPhotoUrl }} style={{ width: 32, height: 32, borderRadius: 16 }} contentFit="cover" />
                        ) : (
                          <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 12 }}>{peerInitials}</Text>
                        )}
                      </View>
                      <View style={{ maxWidth: "75%", backgroundColor: theme.card, padding: 12, borderRadius: 16, borderBottomLeftRadius: 2 }}>
                        <Text style={{ color: theme.text, fontSize: 16 }}>{item.text}</Text>
                        <Text style={{ color: theme.textMuted, fontSize: 10, alignSelf: "flex-end", marginTop: 4 }}>{time}</Text>
                      </View>
                    </View>
                  </View>
                );
              }}
              contentContainerStyle={{ paddingVertical: 16, paddingHorizontal: 4, flexGrow: 1 }}
              onContentSizeChange={() => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50)}
              ListEmptyComponent={
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
                  <Ionicons name="chatbubbles-outline" size={56} color={theme.textMuted} />
                  <Text style={{ color: theme.textMuted, fontSize: 15, marginTop: 14, textAlign: "center", lineHeight: 22 }}>
                    {activeVehicleData
                      ? `Consultá al vendedor sobre el ${activeVehicleData.brand} ${activeVehicleData.model}`
                      : `Escribí tu primer mensaje a ${peerName || "este usuario"}`}
                  </Text>
                </View>
              }
            />
          )}
        </View>
        <View style={{ paddingHorizontal: 12, paddingTop: 6, marginBottom: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {[
              "¿Sigue disponible?",
              "¿Acepta financiación?",
              "¿Se puede ver hoy?",
              "¿Acepta permuta?",
              "¿Cuál es el precio final?",
              "¡Me interesa, hablamos!",
            ].map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => { setInput(t); updateTyping(); }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: theme.inputBackground,
                  borderWidth: 1,
                  borderColor: theme.likeBoxBackground
                }}
              >
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }} numberOfLines={1}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <View style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.headerBackground }}>
          <View style={{ 
            flexDirection: "row", 
            alignItems: "flex-end", 
            gap: 8,
            backgroundColor: theme.card,
            borderRadius: 28,
            borderWidth: 1,
            borderColor: theme.likeBoxBackground,
            padding: 6,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 4,
            elevation: 2
          }}>
            <View style={{ 
              flex: 1, 
              flexDirection: "row", 
              alignItems: "flex-end",
              paddingHorizontal: 8,
              paddingVertical: 4
            }}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.textMuted} style={{ marginRight: 8, alignSelf: "center" }} />
              <TextInput 
                value={input} 
                onChangeText={(t) => { setInput(t); updateTyping(); }} 
                placeholder="Escribí un mensaje…" 
                placeholderTextColor={theme.textMuted} 
                multiline
                onContentSizeChange={(e) => {
                  const h = e.nativeEvent.contentSize.height;
                  const clamped = Math.max(40, Math.min(120, h));
                  setInputHeight(clamped);
                }}
                style={{ 
                  flex: 1, 
                  minHeight: 40,
                  maxHeight: 120,
                  height: inputHeight,
                  paddingHorizontal: 4, 
                  paddingVertical: 8, 
                  color: theme.text, 
                  fontSize: 16
                }} 
              />
            </View>
            <Animated.View style={{ 
              transform: [{ scale: sendScale }],
            }}>
              <TouchableOpacity 
                onPress={() => {
                  if (!input.trim() || sending || loading) return;
                  Animated.sequence([
                    Animated.timing(sendScale, { toValue: 0.92, duration: 80, useNativeDriver: true }),
                    Animated.timing(sendScale, { toValue: 1, duration: 100, useNativeDriver: true }),
                  ]).start();
                  send();
                }} 
                disabled={!input.trim() || sending || loading} 
                style={{ 
                  backgroundColor: input.trim() && !sending && !loading ? theme.accent : theme.textMuted, 
                  width: 48,
                  height: 48,
                  borderRadius: 24, 
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.15,
                  shadowRadius: 3,
                  elevation: 3
                }}
              >
            <Ionicons name={"arrow-up"} size={20} color={theme.buttonText} />
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
