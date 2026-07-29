import { CarCard } from "@/components/cards/carcard";
import { useHistory } from "@/contexts/HistoryContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { Vehicle } from "@/types/vehicle";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { documentId, getDocs, query, where, collection } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function RecentlyViewedScreen() {
  const { viewedIds, clearHistory } = useHistory();
  const { theme } = useTheme();
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVehicles = async () => {
      if (viewedIds.length === 0) {
        setVehicles([]);
        setLoading(false);
        return;
      }
      try {
        const chunks = [];
        for (let i = 0; i < viewedIds.length; i += 10) {
            chunks.push(viewedIds.slice(i, i + 10));
        }

        const allDocs: any[] = [];
        for (const chunk of chunks) {
            if (chunk.length === 0) continue;
            const q = query(collection(db, "vehicles"), where(documentId(), "in", chunk));
            const snap = await getDocs(q);
            snap.forEach(d => allDocs.push({ id: d.id, ...d.data() }));
        }
        
        // Sort by viewed order (viewedIds is ordered most recent first)
        const sorted = viewedIds
            .map(id => allDocs.find(v => v.id === id))
            .filter(v => v !== undefined) as Vehicle[];

        // Keep only active vehicles (no sold, blocked, rejected, deleted or unpublished)
        const activeOnly = sorted.filter((v: any) => {
          const status = v?.status;
          const published = v?.published;
          if (
            status === "sold" ||
            status === "pending" ||
            status === "pending_review" ||
            status === "rejected" ||
            status === "blocked" ||
            status === "deleted"
          ) {
            return false;
          }
          if (published === false) return false;
          return true;
        });

        setVehicles(activeOnly);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    
    fetchVehicles();
  }, [viewedIds]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontWeight: '700', color: theme.text }}>Vistos Recientemente</Text>
        </View>
        {vehicles.length > 0 && (
            <TouchableOpacity onPress={clearHistory}>
                <Text style={{ color: theme.error, fontWeight: '600' }}>Borrar</Text>
            </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
            data={vehicles}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
                <View style={{ paddingHorizontal: 16 }}>
                    <CarCard vehicle={item} />
                </View>
            )}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
                <View style={{ padding: 32, alignItems: 'center' }}>
                    <Text style={{ color: theme.textMuted, textAlign: 'center' }}>No tienes vehículos vistos recientemente.</Text>
                </View>
            }
        />
      )}
    </SafeAreaView>
  );
}
