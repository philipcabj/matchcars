import { useNotifications } from "@/contexts/NotificationContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabsLayout() {
  const { theme } = useTheme();
  const { unreadMessagesCount, unreadLikesCount, unreadMatchesCount } = useNotifications();
  const insets = useSafeAreaInsets();

  const handleTabPress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: {
          fontSize: 9,
          marginBottom: 4,
          textAlign: 'center',
        },
        tabBarItemStyle: undefined,
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
        listeners={{ tabPress: handleTabPress }}
        options={{
          title: "Autos",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={"car-sport-outline" as any} size={size ?? 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="favorites"
        listeners={{ tabPress: handleTabPress }}
        options={{
          title: "Favoritos",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={"heart-outline" as any} size={size ?? 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        listeners={{ tabPress: handleTabPress }}
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
        listeners={{ tabPress: handleTabPress }}
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
        listeners={{ tabPress: handleTabPress }}
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
        listeners={{ tabPress: handleTabPress }}
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
