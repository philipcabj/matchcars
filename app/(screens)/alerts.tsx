import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatNumber } from "../../utils/format";

interface Alert {
  id: string;
  brand?: string;
  model?: string;
  minYear?: string;
  maxYear?: string;
  minPrice?: string;
  maxPrice?: string;
  createdAt: any;
}

interface PriceAlert {
  id: string;
  vehicleId: string;
  brand: string;
  model: string;
  year: string;
  coverImage: string | null;
  currency: string;
  currentPrice: number;
  initialPrice: number;
  createdAt: any;
}

export default function AlertsScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"search" | "price">("search");
  
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form State
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [minYear, setMinYear] = useState("");
  const [maxYear, setMaxYear] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  useEffect(() => {
    if (!user) return;
    
    // Search Alerts Listener
    const q = query(collection(db, "users", user.uid, "alerts"));
    const unsub = onSnapshot(q, (snap) => {
      const list: Alert[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Alert));
      list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setAlerts(list);
      setLoading(false);
    });

    // Price Alerts Listener
    const qPrice = query(collection(db, "users", user.uid, "price_alerts"));
    const unsubPrice = onSnapshot(qPrice, (snap) => {
      const list: PriceAlert[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as PriceAlert));
      list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setPriceAlerts(list);
    });

    return () => {
        unsub();
        unsubPrice();
    };
  }, [user]);

  const handleCreateAlert = async () => {
    if (!user) return;
    if (!brand && !model && !minYear && !maxYear && !minPrice && !maxPrice) {
        alert("Ingresá al menos un criterio de búsqueda.");
        return;
    }

    setCreating(true);
    try {
      await addDoc(collection(db, "users", user.uid, "alerts"), {
        brand: brand.trim() || null,
        model: model.trim() || null,
        minYear: minYear.trim() || null,
        maxYear: maxYear.trim() || null,
        minPrice: minPrice.trim() || null,
        maxPrice: maxPrice.trim() || null,
        createdAt: serverTimestamp(),
      });
      setModalVisible(false);
      resetForm();
    } catch (e) {
      console.error(e);
      alert("Error al crear la alerta.");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteAlert = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "alerts", id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeletePriceAlert = async (vehicleId: string) => {
    if (!user) return;
    try {
      // Delete from user's price alerts
      await deleteDoc(doc(db, "users", user.uid, "price_alerts", vehicleId));
      
      // Also remove from vehicle's price_alerts subcollection to keep sync
      // Note: This requires write permission on vehicle subcollection, which user should have if they are just removing their own subscription
      await deleteDoc(doc(db, "vehicles", vehicleId, "price_alerts", user.uid));
    } catch (e) {
      console.error("Error deleting price alert:", e);
      alert("Error al eliminar la alerta de precio.");
    }
  };

  const resetForm = () => {
    setBrand("");
    setModel("");
    setMinYear("");
    setMaxYear("");
    setMinPrice("");
    setMaxPrice("");
  };

  const renderSearchAlert = ({ item }: { item: Alert }) => (
    <View style={{ backgroundColor: theme.card, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: theme.badgeBorder, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ gap: 4, flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>
                {item.brand ? item.brand : "Cualquier marca"} {item.model ? item.model : ""}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                {item.minYear || item.maxYear ? `Año: ${item.minYear || '0'} - ${item.maxYear || '∞'}` : 'Cualquier año'}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                {item.minPrice || item.maxPrice ? `Precio: ${item.minPrice || '0'} - ${item.maxPrice || '∞'}` : 'Cualquier precio'}
            </Text>
        </View>
        <TouchableOpacity onPress={() => handleDeleteAlert(item.id)} style={{ padding: 8 }}>
            <Ionicons name="trash-outline" size={20} color={theme.error} />
        </TouchableOpacity>
    </View>
  );

  const renderPriceAlert = ({ item }: { item: PriceAlert }) => (
    <TouchableOpacity 
        onPress={() => router.push(`/car/${item.vehicleId}`)}
        style={{ backgroundColor: theme.card, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.badgeBorder, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
        <Image 
            source={{ uri: item.coverImage || 'https://via.placeholder.com/100' }} 
            style={{ width: 60, height: 60, borderRadius: 8, backgroundColor: theme.border }} 
        />
        <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: theme.text, fontWeight: '700' }} numberOfLines={1}>
                {item.brand} {item.model} {item.year}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ color: theme.accent, fontWeight: '600' }}>
                    {item.currency} {formatNumber(item.currentPrice)}
                </Text>
                {item.currentPrice < item.initialPrice && (
                    <Text style={{ color: theme.success, fontSize: 12 }}>
                        ↓ {Math.round(((item.initialPrice - item.currentPrice) / item.initialPrice) * 100)}%
                    </Text>
                )}
            </View>
        </View>
        <TouchableOpacity onPress={() => handleDeletePriceAlert(item.vehicleId)} style={{ padding: 8 }}>
            <Ionicons name="trash-outline" size={20} color={theme.error} />
        </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontWeight: '700', color: theme.text }}>Mis Alertas</Text>
        </View>
        {activeTab === 'search' && (
            <TouchableOpacity 
                onPress={() => setModalVisible(true)}
                style={{ backgroundColor: theme.accent, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}
            >
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>+ Nueva Alerta</Text>
            </TouchableOpacity>
        )}
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 12, gap: 12 }}>
          <TouchableOpacity 
            onPress={() => setActiveTab('search')}
            style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderBottomWidth: 2, borderColor: activeTab === 'search' ? theme.accent : 'transparent' }}
          >
              <Text style={{ color: activeTab === 'search' ? theme.accent : theme.textMuted, fontWeight: '600' }}>Búsquedas</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setActiveTab('price')}
            style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderBottomWidth: 2, borderColor: activeTab === 'price' ? theme.accent : 'transparent' }}
          >
              <Text style={{ color: activeTab === 'price' ? theme.accent : theme.textMuted, fontWeight: '600' }}>Seguimiento de Precios</Text>
          </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
            data={activeTab === 'search' ? alerts : priceAlerts}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            renderItem={activeTab === 'search' ? renderSearchAlert : renderPriceAlert as any}
            ListEmptyComponent={
                <View style={{ padding: 32, alignItems: 'center', gap: 12 }}>
                    <Ionicons name="notifications-off-outline" size={48} color={theme.textMuted} />
                    <Text style={{ color: theme.textMuted, textAlign: 'center' }}>
                        {activeTab === 'search' 
                            ? "No tienes alertas de búsqueda activas." 
                            : "No estás siguiendo el precio de ningún vehículo."}
                    </Text>
                </View>
            }
        />
      )}

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: theme.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text }}>Crear Alerta de Búsqueda</Text>
                    <TouchableOpacity onPress={() => setModalVisible(false)}>
                        <Ionicons name="close" size={24} color={theme.text} />
                    </TouchableOpacity>
                </View>
                
                <ScrollView contentContainerStyle={{ gap: 16 }}>
                    <View>
                        <Text style={{ color: theme.text, marginBottom: 8, fontWeight: '600' }}>Marca</Text>
                        <TextInput 
                            placeholder="Ej. Toyota"
                            placeholderTextColor={theme.textMuted}
                            value={brand}
                            onChangeText={setBrand}
                            style={{ backgroundColor: theme.inputBackground, padding: 12, borderRadius: 8, color: theme.text }}
                        />
                    </View>
                    <View>
                        <Text style={{ color: theme.text, marginBottom: 8, fontWeight: '600' }}>Modelo</Text>
                        <TextInput 
                            placeholder="Ej. Corolla"
                            placeholderTextColor={theme.textMuted}
                            value={model}
                            onChangeText={setModel}
                            style={{ backgroundColor: theme.inputBackground, padding: 12, borderRadius: 8, color: theme.text }}
                        />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.text, marginBottom: 8, fontWeight: '600' }}>Año Mínimo</Text>
                            <TextInput 
                                placeholder="Ej. 2015"
                                placeholderTextColor={theme.textMuted}
                                value={minYear}
                                onChangeText={setMinYear}
                                keyboardType="numeric"
                                style={{ backgroundColor: theme.inputBackground, padding: 12, borderRadius: 8, color: theme.text }}
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.text, marginBottom: 8, fontWeight: '600' }}>Año Máximo</Text>
                            <TextInput 
                                placeholder="Ej. 2024"
                                placeholderTextColor={theme.textMuted}
                                value={maxYear}
                                onChangeText={setMaxYear}
                                keyboardType="numeric"
                                style={{ backgroundColor: theme.inputBackground, padding: 12, borderRadius: 8, color: theme.text }}
                            />
                        </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.text, marginBottom: 8, fontWeight: '600' }}>Precio Mínimo</Text>
                            <TextInput 
                                placeholder="0"
                                placeholderTextColor={theme.textMuted}
                                value={minPrice}
                                onChangeText={setMinPrice}
                                keyboardType="numeric"
                                style={{ backgroundColor: theme.inputBackground, padding: 12, borderRadius: 8, color: theme.text }}
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.text, marginBottom: 8, fontWeight: '600' }}>Precio Máximo</Text>
                            <TextInput 
                                placeholder="0"
                                placeholderTextColor={theme.textMuted}
                                value={maxPrice}
                                onChangeText={setMaxPrice}
                                keyboardType="numeric"
                                style={{ backgroundColor: theme.inputBackground, padding: 12, borderRadius: 8, color: theme.text }}
                            />
                        </View>
                    </View>

                    <TouchableOpacity 
                        onPress={handleCreateAlert}
                        disabled={creating}
                        style={{ backgroundColor: theme.accent, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 12 }}
                    >
                        {creating ? (
                            <ActivityIndicator color="#FFF" />
                        ) : (
                            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>Crear Alerta</Text>
                        )}
                    </TouchableOpacity>
                    <View style={{ height: 20 }} />
                </ScrollView>
            </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
