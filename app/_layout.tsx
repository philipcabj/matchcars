// app/_layout.tsx
import * as Linking from 'expo-linking';
import * as NavigationBar from 'expo-navigation-bar';
import * as Notifications from 'expo-notifications';
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
import { registerForPushNotificationsAsync } from "@/lib/notifications";

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

function RootStack() {
  const { theme } = useTheme();
  const { user, profile, initializing } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (user?.uid) {
      registerForPushNotificationsAsync(user.uid);
    }
  }, [user?.uid]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
      const url = response.notification.request.content.data.url;
      if (url) {
        Linking.openURL(url as string);
      }
    });
    return () => subscription.remove();
  }, []);

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
      <Stack.Screen name="legal-terms" options={{ headerShown: false }} />
      <Stack.Screen name="privacy" options={{ headerShown: false }} />
      <Stack.Screen name="(admin)" options={{ headerShown: false }} />
      {/* acá podés agregar screens como add-car si no están dentro de tabs */}
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <NotificationProvider>
            <RevenueCatProvider>
              <RootStack />
            </RevenueCatProvider>
          </NotificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
