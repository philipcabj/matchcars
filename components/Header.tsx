// app/components/Header.tsx
import { CustomAlert } from "@/components/CustomAlert";
import { useNotifications } from "@/contexts/NotificationContext";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";

const iconImage = require('@/assets/images/icono.png');

export interface HeaderProps {
  title?: string;
  showBack?: boolean;
  onBackPress?: () => void;
  customTitle?: React.ReactNode;
  hideRightOptions?: boolean;
  showHome?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ title, showBack, onBackPress, customTitle, hideRightOptions, showHome }) => {
  const { theme } = useTheme();
  const { user, profile, logout } = useAuth();
  const router = useRouter();
  const { totalUnreadCount } = useNotifications();

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

  const handleAvatarPress = () => {
    if (!user) {
      router.push("/login");
    } else {
      router.push("/profile");
    }
  };

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

      {/* DERECHA: Campanita + logout + avatar */}
      {!hideRightOptions && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => { if (!user) { router.push("/login"); } else { router.push("/(screens)/notifications"); } }}>
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
                  paddingHorizontal: 4
                }}>
                  <Text style={{ color: "white", fontSize: 10, fontWeight: "bold" }}>
                    {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {user && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
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
              style={{
                backgroundColor: theme.removeButton,
                borderRadius: 999,
                paddingVertical: 8,
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Salir</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handleAvatarPress}
            activeOpacity={0.8}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: avatarColor,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {profile?.photoURL ? (
              <Image 
                source={{ uri: profile.photoURL }} 
                style={{ width: 38, height: 38 }} 
                contentFit="cover"
              />
            ) : (
              <Text
                style={{
                  color: "#FFFFFF",
                  fontWeight: "700",
                }}
              >
                {initials}
              </Text>
            )}
          </TouchableOpacity>
        </View>
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
