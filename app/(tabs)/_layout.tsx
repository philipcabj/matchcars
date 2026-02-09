import { useNotifications } from "@/contexts/NotificationContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Platform } from "react-native";

export default function TabsLayout() {
  const { theme } = useTheme();
  const { unreadMessagesCount, unreadLikesCount, unreadMatchesCount } = useNotifications();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: {
          fontSize: Platform.OS === 'web' ? 10 : 9,
          marginBottom: 4,
          ...(Platform.OS === 'web' ? { width: 90, textAlign: 'center' } : {}),
        },
        tabBarItemStyle: Platform.OS === 'web' ? { minWidth: 90 } : undefined,
        tabBarStyle: {
          backgroundColor: theme.tabBackground,
          borderTopColor: "#00000033",
          // Altura base (60) + padding inferior necesario (insets.bottom)
          height: 60 + (Platform.OS === 'ios' ? insets.bottom : insets.bottom > 0 ? insets.bottom : 10),
          paddingBottom: Platform.OS === 'ios' ? insets.bottom : insets.bottom > 0 ? insets.bottom : 10,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Autos",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={"car-sport-outline" as any} size={size ?? 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: "Favoritos",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={"heart-outline" as any} size={size ?? 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: "Matches",
          tabBarBadge: unreadMatchesCount > 0 ? unreadMatchesCount : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={"heart" as any} size={size ?? 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="interesados"
        options={{
          title: "Interesados",
          tabBarBadge: unreadLikesCount > 0 ? unreadLikesCount : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={"people-outline" as any} size={size ?? 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Mensajes",
          tabBarBadge: unreadMessagesCount > 0 ? unreadMessagesCount : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={"chatbubbles-outline" as any} size={size ?? 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="mycars"
        options={{
          title: "Mis autos",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={"albums-outline" as any} size={size ?? 24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
