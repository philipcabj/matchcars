import { Ionicons } from "@expo/vector-icons";
import { trackEvent } from "@/lib/analytics";
import { Redirect, useRouter } from "expo-router";
import Head from "expo-router/head";
import React, { useEffect, useState } from "react";
import { Image, Linking, Platform, Text, TouchableOpacity, View } from "react-native";

const webLogo = require("@/assets/images/icon.png");

export default function Index() {
  const router = useRouter();
  const [isMobileWeb, setIsMobileWeb] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (Platform.OS === "web") {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      if (/android|ipad|iphone|ipod/i.test(userAgent)) {
        setIsMobileWeb(true);
      }

      const updateHeight = () => {
        setViewportHeight(window.innerHeight);
      };

      updateHeight();
      window.addEventListener("resize", updateHeight);
      window.addEventListener("orientationchange", updateHeight);

      return () => {
        window.removeEventListener("resize", updateHeight);
        window.removeEventListener("orientationchange", updateHeight);
      };
    }
  }, []);

  // Mobile: Redirect directly to App
  if (Platform.OS !== "web") {
    return <Redirect href="/(tabs)" />;
  }

  const isWeb = Platform.OS === "web";
  const isCompact = isWeb && viewportHeight !== undefined && viewportHeight < 750;

  const containerHeightStyle =
    isWeb && viewportHeight
      ? { minHeight: viewportHeight }
      : isWeb
      ? { minHeight: "100vh" as any }
      : {};

  const logoSize = isCompact ? 120 : 150;
  const titleFontSize = isCompact ? 34 : 40;
  const bodyFontSize = isCompact ? 16 : 18;
  const bodyLineHeight = isCompact ? 24 : 28;
  const heroMarginBottom = isCompact ? 28 : 40;
  const buttonsMarginBottom = isCompact ? 40 : 60;
  const dealerPaddingTop = isCompact ? 28 : 40;
  const rootPaddingVertical = isCompact ? 24 : 32;

  // Web: Landing Page
  return (
    <>
      <Head>
        <title>Matchcars | Compra y venta de autos usados en Argentina</title>
        <meta
          name="description"
          content="Matchcars es el marketplace de autos usados en Argentina. Compará publicaciones de particulares y agencias verificadas y cerrá tu próxima compra con más información."
        />
        <link rel="canonical" href="https://matchcars.app/" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Matchcars",
              url: "https://matchcars.app/",
              potentialAction: {
                "@type": "SearchAction",
                target: "https://matchcars.app/autos?query={search_term}",
                "query-input": "required name=search_term",
              },
            }),
          }}
        />
      </Head>
    <View
      style={{
        flex: 1,
        backgroundColor: "#0E1117",
        alignItems: "center",
        justifyContent: isCompact ? "flex-start" : "center",
        paddingHorizontal: 20,
        paddingVertical: rootPaddingVertical,
        ...containerHeightStyle,
      }}
    >
      <View style={{ maxWidth: 800, width: "100%", alignItems: "center" }}>
        
        <View style={{ marginBottom: heroMarginBottom, alignItems: "center" }}>
            <Image
              source={webLogo}
              style={{
                width: logoSize,
                height: logoSize,
                borderRadius: logoSize / 2,
                marginBottom: 24,
              }}
            />
            <Text style={{ fontSize: titleFontSize, fontWeight: "900", color: "white", textAlign: "center", marginBottom: 16 }}>
                MatchCars
            </Text>
            <Text style={{ fontSize: bodyFontSize, color: "#94A3B8", textAlign: "center", maxWidth: 600, lineHeight: bodyLineHeight }}>
                La nueva forma de conectar con tu próximo auto. Descubrí, compará y contactá agencias de confianza desde tu celular.
            </Text>
        </View>

        {/* Download Buttons */}
        <View style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap', justifyContent: 'center', marginBottom: buttonsMarginBottom }}>
            <TouchableOpacity 
                onPress={() => {
                  trackEvent("app_download_click", { platform: "android", location: "landing" });
                  Linking.openURL('https://play.google.com/store/apps/details?id=com.matchcars.app');
                }}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'black', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#334155' }}
            >
                <Ionicons name="logo-google-playstore" size={24} color="white" style={{ marginRight: 12 }} />
                <View>
                    <Text style={{ color: '#94A3B8', fontSize: 12 }}>DISPONIBLE EN</Text>
                    <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>Google Play</Text>
                </View>
            </TouchableOpacity>

            <TouchableOpacity 
                onPress={() => {
                  trackEvent("app_download_click", { platform: "ios", location: "landing" });
                  Linking.openURL('https://apps.apple.com/ar/app/matchcars/id6757968664');
                }}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'black', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#334155' }}
            >
                <Ionicons name="logo-apple" size={24} color="white" style={{ marginRight: 12 }} />
                <View>
                    <Text style={{ color: '#94A3B8', fontSize: 12 }}>CONSIGUELO EN EL</Text>
                    <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>App Store</Text>
                </View>
            </TouchableOpacity>
        </View>

        {/* Dealer Access & Mobile Link */}
        <View style={{ borderTopWidth: 1, borderTopColor: '#334155', paddingTop: dealerPaddingTop, alignItems: 'center', width: '100%' }}>
            {!isMobileWeb && (
                <>
                    <Text style={{ color: '#CBD5E1', marginBottom: 16, fontSize: 16 }}>¿Sos una Agencia o Concesionaria?</Text>
                    <TouchableOpacity 
                        onPress={() => router.push('/login')}
                        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(249, 115, 22, 0.1)', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 30, marginBottom: 30 }}
                    >
                        <Text style={{ color: '#F97316', fontWeight: 'bold', marginRight: 8 }}>Acceso para Agencias</Text>
                        <Ionicons name="arrow-forward" size={16} color="#F97316" />
                    </TouchableOpacity>
                </>
            )}

            <TouchableOpacity onPress={() => router.push('/(tabs)')}>
                <Text style={{ color: '#64748B', textDecorationLine: 'underline', fontSize: 14 }}>
                    Soy particular / Ver autos
                </Text>
            </TouchableOpacity>
        </View>

      </View>
    </View>
    </>
  );
}
