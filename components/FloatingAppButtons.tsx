import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Linking, Platform, StyleSheet, TouchableOpacity, View } from "react-native";

export const FloatingAppButtons = () => {
  if (Platform.OS !== 'web') return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        onPress={() => Linking.openURL('https://play.google.com/store/apps/details?id=com.matchcars.app')} 
        style={styles.button}
        activeOpacity={0.8}
      >
        <Ionicons name="logo-google-playstore" size={24} color="#fff" />
      </TouchableOpacity>
      
      <TouchableOpacity 
        onPress={() => Linking.openURL('https://apps.apple.com/ar/app/matchcars/id6757968664')} 
        style={styles.button}
        activeOpacity={0.8}
      >
        <Ionicons name="logo-apple" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    flexDirection: 'row',
    gap: 12,
    zIndex: 9999, // High z-index to be on top
  },
  button: {
    backgroundColor: '#000',
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  }
});
