// app/components/Header.tsx
import { CustomAlert } from "@/components/CustomAlert";
import { useNotifications } from "@/contexts/NotificationContext";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { Modal, Platform, Text, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { db } from "@/lib/firebase";

const iconImage = require('@/assets/images/icon.png');

export interface HeaderProps {
  title?: string;
  showBack?: boolean;
  onBackPress?: () => void;
  customTitle?: React.ReactNode;
  hideRightOptions?: boolean;
  showHome?: boolean;
  rightContent?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, showBack, onBackPress, customTitle, hideRightOptions, showHome, rightContent }) => {
  const { theme } = useTheme();
  const { user, profile, logout } = useAuth();
  const router = useRouter();
  const { totalUnreadCount } = useNotifications();

  const [menuVisible, setMenuVisible] = useState(false);
  const [pendingVehiclesCount, setPendingVehiclesCount] = useState(0);
  const isAdmin = profile?.role === "admin" || profile?.role === "moderator";

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, "vehicles"), where("status", "in", ["pending", "pending_review"]));
    const unsub = onSnapshot(q, (snap) => { setPendingVehiclesCount(snap.size); }, () => {});
    return () => unsub();
  }, [isAdmin]);
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info" as "success" | "error" | "info" | "warning",
    showCancel: false,
    onConfirm: () => {},
    onCancel: () => {},
    confirmText: "OK",
    cancelText: "Cancelar"
  });

  const showAlert = (
    title: string, 
    message: string, 
    type: "success" | "error" | "info" | "warning" = "info",
    showCancel = false,
    onConfirm = () => {},
    confirmText = "OK",
    cancelText = "Cancelar"
  ) => {
    setAlertConfig({ 
      visible: true, 
      title, 
      message, 
      type, 
      showCancel, 
      onConfirm, 
      onCancel: () => setAlertConfig(prev => ({ ...prev, visible: false })),
      confirmText,
      cancelText
    });
  };

  const handleConfirm = () => {
    setAlertConfig(prev => ({ ...prev, visible: false }));
    if (alertConfig.onConfirm) alertConfig.onConfirm();
  };

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.push("/(tabs)");
    }
  };

  const initials =
    profile?.initials ||
    (profile?.firstName && profile?.lastName
      ? `${profile.firstName[0]}${profile.lastName[0]}`
      : user?.email
      ? user.email.slice(0, 2).toUpperCase()
      : "MC");

  const avatarColor =
    profile?.avatarColor || theme.accent;

  const fullName =
    profile?.firstName || profile?.lastName
      ? `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim()
      : user?.email ?? "";

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: theme.headerBackground,
        borderBottomWidth: 1,
        borderBottomColor: theme.badgeBorder,
      }}
    >
      {/* IZQUIERDA: Marca + saludo o Botón Volver + Título */}
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}>
        {showBack ? (
          <>
            <TouchableOpacity onPress={handleBack} style={{ padding: 4 }}>
              <Ionicons name="chevron-back" size={28} color={theme.text} />
            </TouchableOpacity>
            {showHome && (
              <TouchableOpacity onPress={() => router.push("/(tabs)")} style={{ padding: 4, marginRight: 4 }}>
                  <Ionicons name="home-outline" size={24} color={theme.text} />
              </TouchableOpacity>
            )}
            {customTitle ? (
              customTitle
            ) : (
              title && (
                <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700", flex: 1 }} numberOfLines={1}>
                  {title}
                </Text>
              )
            )}
          </>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity 
              onPress={() => router.push("/(tabs)")}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Image 
                source={iconImage} 
                style={{ width: 32, height: 32, borderRadius: 8 }} 
                contentFit="contain"
                transition={200}
              />
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text
                    style={{
                      color: theme.accent,
                      fontSize: 13,
                      fontWeight: "600",
                      letterSpacing: 1,
                    }}
                  >
                    MATCH
                  </Text>
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 22,
                      fontWeight: "800",
                    }}
                  >
                    CARS
                  </Text>
                </View>

                {user && (
                  <Text
                    style={{
                      color: theme.textLight,
                      fontSize: 11,
                      marginTop: -2,
                    }}
                  >
                    Hola, {fullName.split(' ')[0] || "usuario"}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* DERECHA: contenido custom o campanita + logout + avatar */}
      {rightContent ? (
        <View style={{ flexDirection: "row", alignItems: "center" }}>{rightContent}</View>
      ) : !hideRightOptions && (
        <>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          {/* Campanita */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => { if (!user) { router.push("/login"); } else { router.push("/(screens)/notifications"); } }}
            accessibilityLabel={totalUnreadCount > 0 ? `${totalUnreadCount} notificaciones sin leer` : "Notificaciones"}
            accessibilityRole="button"
          >
            <View>
              <Ionicons name="notifications-outline" size={24} color={theme.text} />
              {totalUnreadCount > 0 && (
                <View style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: "#FF3B30",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 4,
                }}>
                  <Text style={{ color: "white", fontSize: 10, fontWeight: "bold" }}>
                    {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {/* Avatar con dropdown */}
          <TouchableOpacity
            onPress={() => user ? setMenuVisible(true) : router.push("/login")}
            activeOpacity={0.8}
            accessibilityLabel={user ? "Menú de perfil" : "Iniciar sesión"}
            accessibilityRole="button"
            style={{ position: "relative" }}
          >
            <View style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: avatarColor,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              borderWidth: profile?.plan && profile.plan !== "free" ? 2 : 0,
              borderColor: (profile?.plan?.includes("dealer_pro_plus") || profile?.plan?.includes("pro_dealer")) ? "#9013FE" : profile?.plan?.includes("pro_plus") ? "#50E3C2" : theme.accent,
            }}>
              {profile?.photoURL ? (
                <Image
                  source={{ uri: profile.photoURL }}
                  style={{ width: 38, height: 38 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                  placeholder={{ color: avatarColor }}
                />
              ) : (
                <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
                  {initials}
                </Text>
              )}
            </View>
            {/* Plan badge */}
            {profile?.plan && profile.plan !== "free" && (
              <View style={{
                position: "absolute",
                bottom: -4,
                right: -4,
                backgroundColor: (profile.plan.includes("dealer_pro_plus") || profile.plan.includes("pro_dealer")) ? "#9013FE" : profile.plan.includes("pro_plus") ? "#50E3C2" : theme.accent,
                borderRadius: 4,
                paddingHorizontal: 3,
                paddingVertical: 1,
              }}>
                <Text style={{ color: "#fff", fontSize: 7, fontWeight: "800", letterSpacing: 0.3 }}>
                  {(profile.plan.includes("dealer_pro_plus") || profile.plan.includes("pro_dealer")) ? "DLR" : profile.plan.includes("pro_plus") ? "PRO+" : "PRO"}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Dropdown menú de perfil */}
        <Modal
          visible={menuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
            <View style={{ flex: 1 }}>
              <TouchableWithoutFeedback>
                <View style={{
                  position: "absolute",
                  top: Platform.OS === "ios" ? 90 : 70,
                  right: 16,
                  backgroundColor: theme.card,
                  borderRadius: 14,
                  paddingVertical: 6,
                  width: 230,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.18,
                  shadowRadius: 12,
                  elevation: 8,
                  borderWidth: 1,
                  borderColor: theme.badgeBorder,
                }}>
                  {/* Cabecera del menú */}
                  <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.badgeBorder }}>
                    <Text style={{ color: theme.text, fontWeight: "700", fontSize: 15 }} numberOfLines={1}>
                      {fullName || "Mi cuenta"}
                    </Text>
                    {profile?.plan && (
                      <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 1 }}>
                        Plan {profile.plan === "free" ? "Gratuito" : (profile.plan.includes("dealer_pro_plus")) ? "Dealer PRO+" : profile.plan.includes("pro_dealer") ? "Dealer" : profile.plan.includes("pro_plus") ? "PRO Plus" : "PRO"}
                      </Text>
                    )}
                  </View>

                  {/* Ver perfil */}
                  <TouchableOpacity
                    onPress={() => { setMenuVisible(false); router.push("/profile"); }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="person-outline" size={20} color={theme.text} />
                    <Text style={{ color: theme.text, fontSize: 14 }} numberOfLines={1}>Ver perfil</Text>
                  </TouchableOpacity>

                  {/* Configuración */}
                  <TouchableOpacity
                    onPress={() => { setMenuVisible(false); router.push("/(screens)/edit-profile"); }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="settings-outline" size={20} color={theme.text} />
                    <Text style={{ color: theme.text, fontSize: 14 }} numberOfLines={1}>Configuración</Text>
                  </TouchableOpacity>

                  {/* Agencias */}
                  <TouchableOpacity
                    onPress={() => { setMenuVisible(false); router.push("/(screens)/agencias" as any); }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="business-outline" size={20} color={theme.text} />
                    <Text style={{ color: theme.text, fontSize: 14 }} numberOfLines={1}>Agencias</Text>
                  </TouchableOpacity>

                  {/* Planes / Suscripción */}
                  <TouchableOpacity
                    onPress={() => { setMenuVisible(false); router.push("/(screens)/subscribe"); }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="star-outline" size={20} color={theme.accent} />
                    <Text style={{ color: theme.text, fontSize: 14, flex: 1 }} numberOfLines={1}>Planes y suscripción</Text>
                    {profile?.plan && profile.plan !== "free" && (
                      <View style={{ backgroundColor: theme.accent, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>ACTIVO</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Panel Admin (solo admins/moderadores) */}
                  {isAdmin && (
                    <TouchableOpacity
                      onPress={() => { setMenuVisible(false); router.push("/(admin)/dashboard"); }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="shield-checkmark-outline" size={20} color="#10B981" />
                      <Text style={{ color: theme.text, fontSize: 14, flex: 1 }} numberOfLines={1}>Panel de Admin</Text>
                      {pendingVehiclesCount > 0 && (
                        <View style={{ backgroundColor: "#FF3B30", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }}>
                          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{pendingVehiclesCount > 99 ? "99+" : pendingVehiclesCount}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  )}

                  {/* Separador */}
                  <View style={{ height: 1, backgroundColor: theme.badgeBorder, marginHorizontal: 12 }} />

                  {/* Cerrar sesión */}
                  <TouchableOpacity
                    onPress={() => {
                      setMenuVisible(false);
                      showAlert(
                        "Cerrar sesión",
                        "¿Seguro que querés salir?",
                        "info",
                        true,
                        () => logout().catch(() => {}),
                        "Salir",
                        "Cancelar"
                      );
                    }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
                    <Text style={{ color: "#FF3B30", fontSize: 14, fontWeight: "600" }} numberOfLines={1}>Cerrar sesión</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
        </>
      )}

      <CustomAlert 
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={handleConfirm}
        showCancel={alertConfig.showCancel}
        onCancel={alertConfig.onCancel}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
      />
    </View>
  );
};
