// app/components/Header.tsx
import { db } from "@/lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";

export function Header() {
  const { theme } = useTheme();
  const { user, profile, logout } = useAuth();
  const router = useRouter();

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

  const [hasUnread, setHasUnread] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<any>(null);
  useEffect(() => {
    if (!user) {
      setLastSeenAt(null);
      return;
    }
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      const data = snap.data() as any;
      setLastSeenAt(data?.notificationsLastSeenAt || null);
    }, () => setLastSeenAt(null));
    return () => unsub();
  }, [user]);
  useEffect(() => {
    if (!user) {
      setHasUnread(false);
      return;
    }
    const q = query(collection(db, "conversations"), where("members", "array-contains", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      let flag = false;
      snap.forEach((d) => {
        const data = d.data() as any;
        const updatedAt = data?.updatedAt;
        const lastSenderId = data?.lastSenderId;
        if (lastSenderId && lastSenderId !== user.uid) {
          if (!lastSeenAt) {
            flag = true;
          } else if (updatedAt && typeof updatedAt.toMillis === "function" && typeof lastSeenAt?.toMillis === "function") {
            if (updatedAt.toMillis() > lastSeenAt.toMillis()) flag = true;
          }
        }
      });
      setHasUnread(flag);
    }, () => setHasUnread(false));
    return () => unsub();
  }, [user, lastSeenAt]);

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
      {/* IZQUIERDA: Marca + saludo */}
      <View>
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

        {user && (
          <Text
            style={{
              color: theme.textLight,
              fontSize: 13,
              marginTop: 4,
            }}
          >
            Bienvenido, {fullName || "usuario"}
          </Text>
        )}
      </View>

      {/* DERECHA: Campanita + logout + avatar */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => { if (!user) { router.push("/login"); } else { router.push("/(screens)/notifications"); } }}>
          <View>
            <Ionicons name="notifications-outline" size={24} color={theme.text} />
            {hasUnread && (
              <View style={{ position: "absolute", top: -2, right: -2, width: 10, height: 10, borderRadius: 5, backgroundColor: "#FF3B30" }} />
            )}
          </View>
        </TouchableOpacity>

        {user && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              Alert.alert(
                "Cerrar sesión",
                "¿Seguro que querés salir?",
                [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Salir",
                    style: "destructive",
                    onPress: () => {
                      logout().catch(() => {});
                    },
                  },
                ]
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
          }}
        >
          <Text
            style={{
              color: "#FFFFFF",
              fontWeight: "700",
            }}
          >
            {initials}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
