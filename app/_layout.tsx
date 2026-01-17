// app/_layout.tsx
import { Stack, usePathname, Redirect } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, Text, View, Platform } from "react-native";
import * as NavigationBar from 'expo-navigation-bar';

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";

function RootStack() {
  const { theme } = useTheme();
  const { user, profile, initializing } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('hidden');
      NavigationBar.setBehaviorAsync('overlay-swipe');
    }
  }, []);

  // Solo spinner mientras Firebase inicializa la sesión
  if (initializing) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={theme.accent} />
        <Text
          style={{
            color: theme.text,
            marginTop: 12,
          }}
        >
          Cargando sesión...
        </Text>
      </View>
    );
  }

  // Redirigir a Términos si el usuario no los aceptó aún (evitar bucle si ya estamos en /terms)
  if (user && profile && profile.acceptedTerms !== true && pathname !== "/terms") {
    return <Redirect href="/terms" />;
  }

  // Siempre tenemos las tabs; login/register son pantallas aparte
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="terms" options={{ headerShown: false }} />
      {/* acá podés agregar screens como add-car si no están dentro de tabs */}
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RootStack />
      </AuthProvider>
    </ThemeProvider>
  );
}
