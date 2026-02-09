// app/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import * as Linking from 'expo-linking';
import { Redirect, Stack, usePathname } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, LogBox, Platform, Text, View } from "react-native";
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Ignorar logs de advertencia/error en pantalla (YellowBox/RedBox) para el usuario final
LogBox.ignoreAllLogs(true);

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { RevenueCatProvider } from "@/contexts/RevenueCatContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";

export const linking = {
  prefixes: [Linking.createURL('/'), 'matchcars://', 'https://matchcars.app'],
  config: {
    screens: {
      '(tabs)': {
        screens: {
          index: 'index',
          favorites: 'favorites',
          matches: 'matches',
          messages: 'messages',
          profile: 'profile',
        },
      },
      '(screens)': {
        screens: {
          'chat/[uid]': 'chat/:uid',
        },
      },
      login: 'login',
      register: 'register',
      terms: 'terms',
      'legal-terms': 'legal-terms',
      privacy: 'privacy',
      'car/[id]': 'car/:id',
    },
  },
};

import { CompareFloatButton } from "@/components/CompareFloatButton";
import { CompareProvider } from "@/contexts/CompareContext";

function RootStack() {
  const { theme } = useTheme();
  const { user, profile, initializing } = useAuth();
  const pathname = usePathname();
  
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Inyectar CSS global para Ionicons usando el archivo en /fonts/Ionicons.ttf
      const style = document.createElement('style');
      style.textContent = `
        @font-face {
          font-family: 'Ionicons';
          src: url('/fonts/Ionicons.ttf') format('truetype');
          font-style: normal;
          font-weight: normal;
        }
      `;
      document.head.appendChild(style);
    }

    if (Platform.OS === 'android') {
      // Asegurar que la barra de navegación sea visible (reset de estado previo)
      try {
        const NavigationBar = require('expo-navigation-bar');
        NavigationBar.setVisibilityAsync('visible');
      } catch (error) {
        // Ignorar si no está instalado o falla
      }
    }
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={{ marginTop: 20, color: theme.text }}>Cargando recursos...</Text>
      </View>
    );
  }

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
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="terms" options={{ headerShown: false }} />
        <Stack.Screen name="legal-terms" options={{ headerShown: false }} />
        <Stack.Screen name="privacy" options={{ headerShown: false }} />
        <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        {/* acá podés agregar screens como add-car si no están dentro de tabs */}
      </Stack>
      <CompareFloatButton />
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <NotificationProvider>
            <RevenueCatProvider>
              <CompareProvider>
                <RootStack />
              </CompareProvider>
            </RevenueCatProvider>
          </NotificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
