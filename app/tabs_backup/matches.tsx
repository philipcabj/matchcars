// app/(tabs)/matches.tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function MatchesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Matches</Text>
      <Text style={styles.subtitle}>
        Próximamente: acá vas a ver los matches entre tus autos y los de otros
        usuarios, y vas a poder iniciar un chat.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090909",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    color: "#ccc",
    fontSize: 14,
    textAlign: "center",
  },
});
