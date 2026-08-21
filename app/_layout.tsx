// app/_layout.tsx
import AnimatedSplash from "@/components/AnimatedSplash";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { trackEvent } from "@/lib/analytics";
import { logger } from "@/lib/logger";
import { initializeMetaSDK } from "@/lib/metaSDK";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import * as Linking from 'expo-linking';
import { Redirect, Stack, usePathname, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { Image, LogBox, Platform, Text, TouchableOpacity, View } from "react-native";
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Ignorar logs de advertencia/error en pantalla (YellowBox/RedBox) para el usuario final
LogBox.ignoreAllLogs(true);

// Mantiene visible el splash nativo hasta que AnimatedSplash lo oculte a
// propósito (SplashScreen.hideAsync() en su primer useEffect) — sin esto,
// Expo lo oculta solo apenas arranca el JS y el splash animado nunca tiene
// nada que reemplazar (aparecía "de la nada" en vez de continuar el nativo).
SplashScreen.preventAutoHideAsync().catch(() => {});

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { RevenueCatProvider } from "@/contexts/RevenueCatContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";

const webLogo = require('@/assets/images/icon.png');

// Initialize Meta SDK on app start
if (Platform.OS !== 'web') {
  initializeMetaSDK();
}

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

function RootStackContent() {
  const pathname = usePathname();
  const router = useRouter();
  
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    ArchivoBlack: require("@/assets/fonts/ArchivoBlack-Regular.ttf"),
    Archivo: require("@/assets/fonts/Archivo-SemiBold.ttf"),
  });
  const [splashDone, setSplashDone] = useState(false);

  // Only try to access theme AFTER initial render to avoid context issues
  const { theme } = useTheme();
  const { user, profile, initializing, logout } = useAuth();
  // AnimatedSplash arranca su fade-out (2100ms) recién cuando esto pasa a
  // true — cubre fuentes Y sesión de Firebase, así el logo/tipografía nunca
  // se ven "a medio cargar" ni queda una segunda pantalla de carga después.
  const appReady = fontsLoaded && !initializing;

  useEffect(() => {
    if (Platform.OS === 'web') {
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
      try {
        const NavigationBar = require('expo-navigation-bar');
        NavigationBar.setVisibilityAsync('visible');
      } catch (error) {}
    }

    try {
      const anyGlobal = global as any;
      const errorUtils = anyGlobal.ErrorUtils;
      if (errorUtils && typeof errorUtils.setGlobalHandler === "function") {
        const prevHandler = typeof errorUtils.getGlobalHandler === "function" ? errorUtils.getGlobalHandler() : null;
        errorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
          if (error && typeof error.message === "string" && error.message.includes("Cannot read property 'forEach' of null")) {
            logger.log("Silenced forEach null error", error);
            return;
          }
          if (prevHandler) {
            prevHandler(error, isFatal);
          }
        });
      }
    } catch {}
  }, []);

  if (!splashDone) {
    return <AnimatedSplash appReady={appReady} onFinish={() => setSplashDone(true)} />;
  }

  // MOBILE WEB LOGIN GUARD: Prevent accessing /login on mobile web
  if (Platform.OS === 'web' && (pathname === '/login' || pathname === '/register')) {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const isMobile = /android|ipad|iphone|ipod/i.test(userAgent);
      
      if (isMobile) {
          return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, padding: 20 }}>
                <View style={{ maxWidth: 500, alignItems: 'center' }}>
                    <Image source={webLogo} style={{ width: 96, height: 96, marginBottom: 12 }} />
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
                        <Text
                          onPress={() => {
                            trackEvent("app_download_click", { platform: "android", location: "mobile_web_login_guard" });
                            Linking.openURL('https://play.google.com/store/apps/details?id=com.matchcars.app');
                          }}
                          style={{ color: theme.accent, fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          Android
                        </Text>
                        <Text style={{ color: theme.textMuted }}>|</Text>
                        <Text
                          onPress={() => {
                            trackEvent("app_download_click", { platform: "ios", location: "mobile_web_login_guard" });
                            Linking.openURL('https://apps.apple.com/ar/app/matchcars/id6757968664');
                          }}
                          style={{ color: theme.accent, fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          iOS
                        </Text>
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

  // El spinner de "Cargando sesión..." ya no hace falta acá — appReady
  // (arriba) incluye !initializing, así que AnimatedSplash no llega a
  // splashDone hasta que Firebase también terminó de inicializar la sesión.

  // Redirigir a Términos si el usuario no los aceptó aún (evitar bucle si ya estamos en /terms)
  if (user && profile && profile.acceptedTerms !== true && pathname !== "/terms") {
    return <Redirect href="/terms" />;
  }

  // WEB GUARD: Restrict usage to Dealers only
   // If user is logged in on Web but is NOT a 'pro_dealer', we block access.
   // We check if plan starts with 'pro_dealer' to cover both monthly and annual plans
   
   const isPublicShowroomRoute =
     pathname?.startsWith('/embed/') ||
     pathname?.startsWith('/agencia/') ||
     pathname?.startsWith('/user-profile/');

   if (Platform.OS === 'web' && user && profile && !isPublicShowroomRoute) {
     const isDealer = profile.plan && (profile.plan === 'pro_dealer' || profile.plan.startsWith('pro_dealer'));

     if (!isDealer) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, padding: 20 }}>
            <View style={{ maxWidth: 500, alignItems: 'center' }}>
                <Image source={webLogo} style={{ width: 96, height: 96, marginBottom: 12 }} />
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
                    {`(Debug Info: Tu plan actual es ${profile.plan || 'gratis'})`}
                </Text>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 30 }}>
                    <Text
                      onPress={() => {
                        trackEvent("app_download_click", { platform: "android", location: "web_guard" });
                        Linking.openURL('https://play.google.com/store/apps/details?id=com.matchcars.app');
                      }}
                      style={{ color: theme.accent, fontWeight: 'bold' }}
                    >
                      Android
                    </Text>
                    <Text style={{ color: theme.textMuted }}>|</Text>
                    <Text
                      onPress={() => {
                        trackEvent("app_download_click", { platform: "ios", location: "web_guard" });
                        Linking.openURL('https://apps.apple.com/ar/app/matchcars/id6757968664');
                      }}
                      style={{ color: theme.accent, fontWeight: 'bold' }}
                    >
                      iOS
                    </Text>
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
      </Stack>
      <CompareFloatButton />
    </View>
  );
}

// Wrapper component to ensure all hooks are called within providers
function RootStack() {
  return <RootStackContent />;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}
