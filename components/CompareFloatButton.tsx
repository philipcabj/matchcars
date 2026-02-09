import { useCompare } from '@/contexts/CompareContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function CompareFloatButton() {
  const { selectedVehicles, clearSelection } = useCompare();
  const { theme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  if (Platform.OS === 'web') return null;

  if (selectedVehicles.length === 0) return null;
  
  // Hide on compare screen
  if (pathname === '/compare') return null;

  // Adjust bottom position to avoid tab bar (approx 60-80px)
  const tabPaths = ['/', '/favorites', '/matches', '/interesados', '/messages', '/mycars'];
  const isTab = tabPaths.includes(pathname);
  const bottomOffset = isTab ? 80 : 20;

  return (
    <View style={[styles.container, { bottom: insets.bottom + bottomOffset }]}>
      <TouchableOpacity 
        style={[styles.button, { backgroundColor: theme.accent }]}
        onPress={() => router.push('/compare')}
        activeOpacity={0.9}
      >
        <View style={styles.badge}>
            <Text style={styles.badgeText}>{selectedVehicles.length}</Text>
        </View>
        <Ionicons name="git-compare-outline" size={24} color="#FFF" />
        <Text style={styles.text}>Comparar</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[styles.closeButton, { backgroundColor: theme.card }]}
        onPress={clearSelection}
      >
        <Ionicons name="close" size={20} color={theme.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 9999,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
    gap: 8,
  },
  text: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 16,
  },
  badge: {
    position: 'absolute',
    top: -5,
    left: -5,
    backgroundColor: '#FF3B30',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFF',
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  }
});
