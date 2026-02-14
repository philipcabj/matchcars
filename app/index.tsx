import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Linking, Platform, Text, TouchableOpacity, View } from "react-native";

export default function Index() {
  const router = useRouter();
  const [isMobileWeb, setIsMobileWeb] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      if (/android|ipad|iphone|ipod/i.test(userAgent)) {
        setIsMobileWeb(true);
      }
    }
  }, []);

  // Mobile: Redirect directly to App
  if (Platform.OS !== 'web') {
    return <Redirect href="/(tabs)" />;
  }

  // Web: Landing Page
  return (
    <View style={{ flex: 1, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <View style={{ maxWidth: 800, width: '100%', alignItems: 'center' }}>
        
        {/* Hero Section */}
        <View style={{ marginBottom: 40, alignItems: 'center' }}>
            <View style={{ width: 120, height: 120, backgroundColor: '#F97316', borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
                <Ionicons name="car-sport" size={64} color="white" />
            </View>
            <Text style={{ fontSize: 48, fontWeight: '900', color: 'white', textAlign: 'center', marginBottom: 16 }}>
                MatchCars
            </Text>
            <Text style={{ fontSize: 20, color: '#94A3B8', textAlign: 'center', maxWidth: 600, lineHeight: 30 }}>
                La nueva forma de conectar con tu próximo auto. Descubrí, compará y contactá agencias de confianza desde tu celular.
            </Text>
        </View>

        {/* Download Buttons */}
        <View style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 60 }}>
            <TouchableOpacity 
                onPress={() => Linking.openURL('https://play.google.com/store/apps/details?id=com.matchcars.app')}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'black', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#334155' }}
            >
                <Ionicons name="logo-google-playstore" size={24} color="white" style={{ marginRight: 12 }} />
                <View>
                    <Text style={{ color: '#94A3B8', fontSize: 12 }}>DISPONIBLE EN</Text>
                    <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>Google Play</Text>
                </View>
            </TouchableOpacity>

            <TouchableOpacity 
                onPress={() => Linking.openURL('https://apps.apple.com/ar/app/matchcars/id6757968664')}
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
        <View style={{ borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 40, alignItems: 'center', width: '100%' }}>
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
  );
}
