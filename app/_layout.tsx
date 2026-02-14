// app/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import * as Linking from 'expo-linking';
import { Redirect, Stack, usePathname, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, LogBox, Platform, Text, TouchableOpacity, View } from "react-native";
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
import { HistoryProvider } from "@/contexts/HistoryContext";

function RootStack() {
  const { theme } = useTheme();
  const { user, profile, initializing, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  
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

  // MOBILE WEB LOGIN GUARD: Prevent accessing /login on mobile web
  if (Platform.OS === 'web' && (pathname === '/login' || pathname === '/register')) {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const isMobile = /android|ipad|iphone|ipod/i.test(userAgent);
      
      if (isMobile) {
          return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, padding: 20 }}>
                <View style={{ maxWidth: 500, alignItems: 'center' }}>
                    <Ionicons name="phone-portrait-outline" size={64} color={theme.textMuted} />
                    <Text style={{ fontSize: 24, fontWeight: 'bold', color: theme.text, marginTop: 20, textAlign: 'center' }}>
                        Descarga la App
                    </Text>
                    <Text style={{ fontSize: 16, color: theme.textMuted, marginTop: 10, textAlign: 'center', lineHeight: 24 }}>
                        El inicio de sesión y registro en web solo está disponible para Agencias en PC.
                    </Text>
                    <Text style={{ fontSize: 16, color: theme.textMuted, marginTop: 10, textAlign: 'center', lineHeight: 24 }}>
                        Para gestionar tu cuenta, por favor utiliza nuestra App móvil.
                    </Text>

                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 30 }}>
                        <Text onPress={() => Linking.openURL('https://play.google.com/store/apps/details?id=com.matchcars.app')} style={{ color: theme.accent, fontWeight: 'bold', cursor: 'pointer' }}>Android</Text>
                        <Text style={{ color: theme.textMuted }}>|</Text>
                        <Text onPress={() => Linking.openURL('https://apps.apple.com/app/id6739093393')} style={{ color: theme.accent, fontWeight: 'bold', cursor: 'pointer' }}>iOS</Text>
                    </View>
                    
                     <TouchableOpacity onPress={() => router.replace('/')} style={{ marginTop: 40 }}>
                        <Text style={{ color: theme.textMuted, textDecorationLine: 'underline' }}>
                            Volver al Inicio
                        </Text>
                     </TouchableOpacity>
                </View>
            </View>
          );
      }
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

  // WEB GUARD: Restrict usage to Dealers only
   // If user is logged in on Web but is NOT a 'pro_dealer', we block access.
   // We check if plan starts with 'pro_dealer' to cover both monthly and annual plans
   
   if (Platform.OS === 'web' && user && profile) {
     const isDealer = profile.plan && (profile.plan === 'pro_dealer' || profile.plan.startsWith('pro_dealer'));
     
     if (!isDealer) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, padding: 20 }}>
            <View style={{ maxWidth: 500, alignItems: 'center' }}>
                <Ionicons name="phone-portrait-outline" size={64} color={theme.textMuted} />
                <Text style={{ fontSize: 24, fontWeight: 'bold', color: theme.text, marginTop: 20, textAlign: 'center' }}>
                    Experiencia Móvil
                </Text>
                <Text style={{ fontSize: 16, color: theme.textMuted, marginTop: 10, textAlign: 'center', lineHeight: 24 }}>
                    La versión web de MatchCars está reservada exclusivamente para el panel administrativo de Agencias.
                </Text>
                <Text style={{ fontSize: 16, color: theme.textMuted, marginTop: 10, textAlign: 'center', lineHeight: 24 }}>
                    Para buscar autos, ver detalles y contactar vendedores, por favor utiliza nuestra App móvil.
                </Text>

                <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 20, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                    (Debug Info: Tu plan actual es "{profile.plan || 'gratis'}")
                </Text>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 30 }}>
                    <Text onPress={() => Linking.openURL('https://play.google.com/store/apps/details?id=com.matchcars.app')} style={{ color: theme.accent, fontWeight: 'bold' }}>Android</Text>
                    <Text style={{ color: theme.textMuted }}>|</Text>
                    <Text onPress={() => Linking.openURL('https://apps.apple.com/app/id6739093393')} style={{ color: theme.accent, fontWeight: 'bold' }}>iOS</Text>
                </View>
                
                 <TouchableOpacity onPress={() => logout()} style={{ marginTop: 40 }}>
                    <Text style={{ color: theme.textMuted, textDecorationLine: 'underline' }}>
                        Cerrar Sesión
                    </Text>
                 </TouchableOpacity>
            </View>
        </View>
     );
  }
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
                <HistoryProvider>
                  <RootStack />
                </HistoryProvider>
              </CompareProvider>
            </RevenueCatProvider>
          </NotificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
