import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  currentPrice: number;
  avgPrice: number;
  currency: string;
  onLowerPrice: (targetPrice: number) => void;
  onIgnore: () => void;
}

export function PriceRecommendation({ currentPrice, avgPrice, currency, onLowerPrice, onIgnore }: Props) {
  const { theme } = useTheme();

  const diff = ((currentPrice - avgPrice) / avgPrice) * 100;
  
  // Recommended range: slightly below average to average
  const recommendedMin = Math.round(avgPrice * 0.95);
  const recommendedMax = Math.round(avgPrice); 
  
  const fmt = (n: number) => n.toLocaleString("es-AR");

  // Fallback for border color to avoid type errors if badgeBorder is missing
  const borderColor = (theme as any).badgeBorder || theme.textMuted || '#ccc';

  return (
    <View style={[styles.container, { backgroundColor: theme.card, borderColor: borderColor }]}>
      <View style={styles.header}>
        <Ionicons name="trending-down" size={20} color={theme.accent} />
        <Text style={[styles.title, { color: theme.text }]}>Sugerencia de Precio</Text>
      </View>
      
      <Text style={[styles.message, { color: theme.text }]}>
        Este auto está <Text style={{ fontWeight: 'bold', color: '#EF4444' }}>{Math.round(diff)}% arriba</Text> del promedio.
      </Text>
      
      <Text style={[styles.subMessage, { color: theme.textMuted }]}>
        Las publicaciones similares reciben más interés entre {currency} {fmt(recommendedMin)} – {fmt(recommendedMax)}.
      </Text>
      
      <View style={styles.actions}>
        <TouchableOpacity 
          style={[styles.buttonPrimary, { backgroundColor: theme.accent }]}
          onPress={() => onLowerPrice(recommendedMax)}
        >
            <Text style={styles.buttonTextPrimary}>Bajar precio a {currency} {fmt(recommendedMax)}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.buttonSecondary, { backgroundColor: theme.inputBackground }]}
          onPress={onIgnore}
        >
            <Text style={[styles.buttonTextSecondary, { color: theme.textMuted }]}>Ignorar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  message: {
    fontSize: 14,
    marginBottom: 4,
  },
  subMessage: {
    fontSize: 12,
    marginBottom: 16,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  buttonPrimary: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonTextPrimary: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },
  buttonSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonTextSecondary: {
    fontSize: 12,
    fontWeight: '600',
  },
});
