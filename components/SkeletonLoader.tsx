import { useTheme } from '@/contexts/ThemeContext';
import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

interface SkeletonLoaderProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * Skeleton Loader Component
 * Shows an animated placeholder while content is loading
 */
export function SkeletonLoader({ 
  width = '100%', 
  height = 20, 
  borderRadius = 4,
  style 
}: SkeletonLoaderProps) {
  const { theme } = useTheme();
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0.3, { duration: 800 })
      ),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: theme.inputBackground,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

/**
 * Skeleton Card Component
 * Pre-built skeleton for vehicle cards
 */
export function SkeletonCard() {
  const { theme } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      {/* Image skeleton */}
      <SkeletonLoader width="100%" height={200} borderRadius={12} />
      
      <View style={styles.cardContent}>
        {/* Title skeleton */}
        <SkeletonLoader width="80%" height={24} style={{ marginBottom: 8 }} />
        
        {/* Price skeleton */}
        <SkeletonLoader width="40%" height={20} style={{ marginBottom: 12 }} />
        
        {/* Details skeleton */}
        <View style={styles.detailsRow}>
          <SkeletonLoader width={60} height={16} />
          <SkeletonLoader width={60} height={16} />
          <SkeletonLoader width={60} height={16} />
        </View>
      </View>
    </View>
  );
}

/**
 * Skeleton List Component
 * Shows multiple skeleton cards
 */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    overflow: 'hidden',
  },
  card: {
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  cardContent: {
    padding: 16,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  list: {
    padding: 16,
  },
});
