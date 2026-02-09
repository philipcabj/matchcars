import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Linking, Platform, Text, TouchableOpacity, View } from 'react-native';

export const DownloadAppBanner = ({ compact = false, message = "Para contactar al vendedor", floating = false }: { compact?: boolean, message?: string, floating?: boolean }) => {
  const { theme } = useTheme();

  const openStore = () => {
    // Replace with your actual store links
    const androidUrl = 'https://play.google.com/store/apps/details?id=com.matchcars.app';
    const iosUrl = 'https://apps.apple.com/ar/app/matchcars/id6739093393'; // Replace if you have the ID
    
    if (Platform.OS === 'ios') {
      Linking.openURL(iosUrl); 
    } else {
      Linking.openURL(androidUrl);
    }
  };

  if (floating) {
    return (
        <View style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            backgroundColor: theme.card,
            padding: 16,
            borderRadius: 16,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 5,
            borderWidth: 1,
            borderColor: theme.inputBackground,
            zIndex: 100,
            maxWidth: 300
        }}>
             <TouchableOpacity 
                onPress={() => Linking.openURL('https://apps.apple.com/ar/app/matchcars/id6739093393')} 
                style={{ 
                    backgroundColor: '#000', 
                    paddingHorizontal: 16, 
                    paddingVertical: 10, 
                    borderRadius: 10, 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    gap: 8,
                    marginBottom: 8
                }}
             >
                <Ionicons name="logo-apple" size={20} color="#fff" />
                <View>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '500' }}>Consiguelo en el</Text>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>App Store</Text>
                </View>
             </TouchableOpacity>

             <TouchableOpacity 
                onPress={() => Linking.openURL('https://play.google.com/store/apps/details?id=com.matchcars.app')} 
                style={{ 
                    backgroundColor: '#000', 
                    paddingHorizontal: 16, 
                    paddingVertical: 10, 
                    borderRadius: 10, 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    gap: 8 
                }}
             >
                <Ionicons name="logo-google-playstore" size={20} color="#fff" />
                <View>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '500' }}>DISPONIBLE EN</Text>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>Google Play</Text>
                </View>
             </TouchableOpacity>
        </View>
    )
  }

  if (compact) {
    return (
        <TouchableOpacity 
            onPress={openStore} 
            activeOpacity={0.8}
            style={{ 
                backgroundColor: theme.primary, 
                paddingVertical: 14,
                paddingHorizontal: 20, 
                borderRadius: 12, 
                alignItems: 'center', 
                marginTop: 12,
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
                shadowColor: theme.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 4,
            }}
        >
            <Ionicons name="phone-portrait" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Descargar App para contactar</Text>
        </TouchableOpacity>
    )
  }

  return (
    <View style={{ 
        padding: 24, 
        backgroundColor: theme.card, 
        borderRadius: 20, 
        marginTop: 24, 
        alignItems: 'center', 
        borderWidth: 1, 
        borderColor: theme.likeBoxBackground,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 15,
        elevation: 2,
    }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.primary + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <Ionicons name="phone-portrait" size={32} color={theme.primary} />
      </View>
      
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 8 }}>
        {message}
      </Text>
      
      <Text style={{ color: theme.textMuted, textAlign: 'center', marginBottom: 20, maxWidth: 300, lineHeight: 22 }}>
        Descargá la app oficial de Matchcars para chatear con vendedores, guardar favoritos y recibir notificaciones.
      </Text>
      
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
         <TouchableOpacity 
            onPress={() => Linking.openURL('https://play.google.com/store/apps/details?id=com.matchcars.app')} 
            style={{ 
                backgroundColor: '#000', 
                paddingHorizontal: 16, 
                paddingVertical: 12, 
                borderRadius: 12, 
                flexDirection: 'row', 
                alignItems: 'center', 
                gap: 8 
            }}
         >
            <Ionicons name="logo-google-playstore" size={24} color="#fff" />
            <View>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '500' }}>DISPONIBLE EN</Text>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>Google Play</Text>
            </View>
         </TouchableOpacity>
         
         <TouchableOpacity 
            onPress={() => Linking.openURL('https://apps.apple.com/ar/app/matchcars/id6739093393')} 
            style={{ 
                backgroundColor: '#000', 
                paddingHorizontal: 16, 
                paddingVertical: 12, 
                borderRadius: 12, 
                flexDirection: 'row', 
                alignItems: 'center', 
                gap: 8 
            }}
         >
            <Ionicons name="logo-apple" size={24} color="#fff" />
            <View>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '500' }}>CONSIGUELO EN EL</Text>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>App Store</Text>
            </View>
         </TouchableOpacity>
      </View>
    </View>
  );
};
