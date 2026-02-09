import { useNotifications } from "@/contexts/NotificationContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";

export default function TabsLayout() {
  const { theme } = useTheme();
  const { unreadMessagesCount, unreadLikesCount, unreadMatchesCount } = useNotifications();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: {
          fontSize: 9,
          marginBottom: 4,
        },
        tabBarStyle: {
          backgroundColor: theme.tabBackground,
          borderTopColor: "#00000033",
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
