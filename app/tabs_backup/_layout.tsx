// app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useTheme } from "@/contexts/ThemeContext";


export default function TabsLayout() {
const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
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
               <Ionicons
              // 👇 casteamos para que TS no joda
              name={"car-sport-outline" as any}
              size={size ?? 24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: "Favoritos",
          tabBarIcon: ({ color, size }) => (
              <Ionicons
              name={"heart-outline" as any}
              size={size ?? 24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="interesados"
        options={{
          title: "Interesados",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="group" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: "Matches",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="favorite-border" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="mycars"
        options={{
          title: "Mis autos",
          tabBarIcon: ({ color, size }) => (
             <Ionicons
              name={"albums-outline" as any}
              size={size ?? 24}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
