import { ShareCard, ShareCardData } from "@/components/ShareCard";
import { Analytics } from "@/lib/analytics";
import { logger } from "@/lib/logger";
import { generateAndShareCard } from "@/lib/shareCard";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

let QRCode: any = null;
try {
  QRCode = require("react-native-qrcode-svg").default;
} catch {}

interface ShareSheetProps {
  visible: boolean;
  onClose: () => void;
  url: string;
  title: string;
  theme: any;
  shareCardData?: ShareCardData;
  analyticsId?: string;
}

export function ShareSheet({ visible, onClose, url, title, theme, shareCardData, analyticsId }: ShareSheetProps) {
  const [copied, setCopied] = useState(false);
  const [cardVisible, setCardVisible] = useState(false);
  const [downloadingCard, setDownloadingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const cardRef = useRef<View>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web";
  // Sheet content area is `min(420, windowWidth) - 48` (24px padding each side) —
  // cap the card at that so it never overflows on narrow phones.
  const cardWidth = Math.min(320, (isWebDesktop ? 420 : windowWidth) - 48);

  // Reset the card preview each time the sheet closes, so it reopens fresh.
  useEffect(() => {
    if (!visible) {
      setCardVisible(false);
      setCardError(null);
    }
  }, [visible]);

  const handleConfirmDownload = async () => {
    if (downloadingCard) return;
    setDownloadingCard(true);
    setCardError(null);
    try {
      const imageUrls = [shareCardData?.logoUrl, ...(shareCardData?.vehicles.map((v) => v.coverImage) ?? [])];
      await generateAndShareCard({ cardRef, uid: analyticsId || "matchcars", imageUrls });
      if (analyticsId) Analytics.logShare("card_download", analyticsId);
    } catch (e) {
      logger.warn("[ShareSheet] card download failed", e);
      setCardError("No pudimos generar la imagen. Probá de nuevo.");
    } finally {
      setDownloadingCard(false);
    }
  };

  const handleCopy = async () => {
    if (analyticsId) Analytics.logShare("copy_link", analyticsId);
    if (Platform.OS === "web") {
      try {
        await (navigator as any).clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      } catch {}
    } else {
      try {
        await Share.share({ message: `${title}\n${url}`, url });
      } catch {}
    }
  };

  const handleWhatsApp = () => {
    if (analyticsId) Analytics.logShare("whatsapp", analyticsId);
    const msg = encodeURIComponent(`${title}\n${url}`);
    Linking.openURL(`https://wa.me/?text=${msg}`).catch(() => {});
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isWebDesktop ? "fade" : "slide"}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: isWebDesktop ? "center" : "flex-end",
          alignItems: isWebDesktop ? "center" : "stretch",
        }}
        onPress={onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View
            style={{
              backgroundColor: theme.card,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderBottomLeftRadius: isWebDesktop ? 20 : 0,
              borderBottomRightRadius: isWebDesktop ? 20 : 0,
              maxHeight: windowHeight * 0.85,
              ...(isWebDesktop ? { width: 420, maxWidth: "95vw" as any } : {}),
            }}
          >
            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: 24,
                paddingTop: isWebDesktop ? 20 : 12,
                paddingBottom: isWebDesktop ? 24 : Platform.OS === "ios" ? 40 : 28,
                gap: 20,
              }}
            >
              {/* Handle — only on native bottom sheet */}
              {!isWebDesktop && (
                <View
                  style={{
                    width: 40,
                    height: 4,
                    backgroundColor: theme.border,
                    borderRadius: 2,
                    alignSelf: "center",
                  }}
                />
              )}

              <Text
                style={{ color: theme.text, fontWeight: "800", fontSize: 17, textAlign: "center" }}
              >
                Compartir perfil
              </Text>

              {/* QR Code */}
              {QRCode && (
                <View style={{ alignItems: "center", gap: 8 }}>
                  <View
                    style={{
                      backgroundColor: "#FFFFFF",
                      padding: 12,
                      borderRadius: 16,
                      shadowColor: "#000",
                      shadowOpacity: 0.08,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 4 },
                    }}
                  >
                    <QRCode value={url} size={160} color="#111827" backgroundColor="#FFFFFF" />
                  </View>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                    Escaneá para abrir el perfil
                  </Text>
                </View>
              )}

              {/* URL preview */}
              <View
                style={{
                  backgroundColor: theme.inputBackground ?? theme.background,
                  borderRadius: 10,
                  padding: 10,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text style={{ color: theme.textMuted, fontSize: 12 }} numberOfLines={1}>
                  {url}
                </Text>
              </View>

              {/* Action buttons */}
              <View style={{ flexDirection: "row", gap: 12 }}>
                {/* Copy / Share */}
                <TouchableOpacity
                  onPress={handleCopy}
                  style={{
                    flex: 1,
                    backgroundColor: copied ? "#10B981" : theme.inputBackground ?? theme.background,
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: "center",
                    gap: 6,
                    borderWidth: copied ? 0 : 1,
                    borderColor: theme.border,
                  }}
                >
                  <Ionicons
                    name={copied ? "checkmark-circle" : Platform.OS === "web" ? "copy-outline" : "share-outline"}
                    size={24}
                    color={copied ? "#fff" : theme.text}
                  />
                  <Text
                    style={{
                      color: copied ? "#fff" : theme.text,
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    {copied ? "¡Copiado!" : Platform.OS === "web" ? "Copiar link" : "Compartir"}
                  </Text>
                </TouchableOpacity>

                {/* WhatsApp */}
                <TouchableOpacity
                  onPress={handleWhatsApp}
                  style={{
                    flex: 1,
                    backgroundColor: "#25D366",
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Ionicons name="logo-whatsapp" size={24} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>WhatsApp</Text>
                </TouchableOpacity>

                {/* Native share extra (web only shows copy+wa) */}
                {Platform.OS === "web" && (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(url).catch(() => {})}
                    style={{
                      flex: 1,
                      backgroundColor: theme.inputBackground ?? theme.background,
                      borderRadius: 14,
                      paddingVertical: 14,
                      alignItems: "center",
                      gap: 6,
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                  >
                    <Ionicons name="open-outline" size={24} color={theme.text} />
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>Abrir</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Download branded card (WhatsApp Status / Instagram Story) */}
              {shareCardData && (
                <View style={{ gap: 12 }}>
                  {!cardVisible ? (
                    <TouchableOpacity
                      onPress={() => setCardVisible(true)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        backgroundColor: theme.inputBackground ?? theme.background,
                        borderRadius: 14,
                        paddingVertical: 14,
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      <Ionicons name="image-outline" size={20} color={theme.text} />
                      <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>
                        Descargar tarjeta
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ alignItems: "center", gap: 10 }}>
                      <View style={{ borderRadius: 16, overflow: "hidden" }}>
                        <ShareCard
                          ref={cardRef}
                          qrValue={url}
                          width={cardWidth}
                          agencyName={shareCardData.agencyName}
                          logoUrl={shareCardData.logoUrl}
                          city={shareCardData.city}
                          province={shareCardData.province}
                          rating={shareCardData.rating}
                          reviewCount={shareCardData.reviewCount}
                          vehicles={shareCardData.vehicles}
                        />
                      </View>

                      {cardError && (
                        <Text style={{ color: "#EF4444", fontSize: 12, textAlign: "center" }}>
                          {cardError}
                        </Text>
                      )}

                      <TouchableOpacity
                        onPress={handleConfirmDownload}
                        disabled={downloadingCard}
                        style={{
                          width: "100%",
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          backgroundColor: theme.accent,
                          borderRadius: 14,
                          paddingVertical: 14,
                          opacity: downloadingCard ? 0.6 : 1,
                        }}
                      >
                        {downloadingCard ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Ionicons name="download-outline" size={20} color="#fff" />
                        )}
                        <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>
                          {downloadingCard ? "Generando..." : "Confirmar descarga"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              <TouchableOpacity onPress={onClose} style={{ alignItems: "center", paddingVertical: 4 }}>
                <Text style={{ color: theme.textMuted, fontWeight: "600", fontSize: 14 }}>
                  Cerrar
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
