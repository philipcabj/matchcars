import React from 'react';
import { View, Platform, ViewStyle, StyleProp } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export const WebContainer = ({ children, style }: { children: React.ReactNode, style?: StyleProp<ViewStyle> }) => {
  const { theme } = useTheme();
  
  // On mobile, just return fragment or view without specific constraints
  if (Platform.OS !== 'web') {
    return <View style={[{ flex: 1 }, style]}>{children}</View>;
  }

  // On web, center content with max-width
  return (
    <View style={{ flex: 1, alignItems: 'center', width: '100%', backgroundColor: theme.background }}>
        <View style={[{
          flex: 1,
          width: '100%',
          maxWidth: 800, // Reasonable width for a feed/detail view
          backgroundColor: theme.background,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
          elevation: 2,
        }, style]}>
          {children}
        </View>
    </View>
  );
};
