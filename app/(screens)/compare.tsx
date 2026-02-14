import { useCompare } from '@/contexts/CompareContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LABEL_WIDTH = 110;
const COL_WIDTH = 180;
const ROW_HEIGHT = 60;
const HEADER_HEIGHT = 180;

export default function CompareScreen() {
  const { selectedVehicles, toggleVehicle, clearSelection } = useCompare();
  const { theme, themeName } = useTheme();
  const router = useRouter();

  // Calculate Best Values
  const bestValues = React.useMemo(() => {
    if (selectedVehicles.length < 2) return null;

    const currencies = new Set(selectedVehicles.map(v => v.currency));
    const sameCurrency = currencies.size === 1;

    const prices = selectedVehicles.map(v => Number(v.price)).filter(p => !isNaN(p) && p > 0);
    const years = selectedVehicles.map(v => Number(v.year)).filter(y => !isNaN(y) && y > 0);
    const kms = selectedVehicles.map(v => Number(v.km)).filter(k => !isNaN(k));

    return {
        minPrice: sameCurrency && prices.length > 0 ? Math.min(...prices) : null,
        maxYear: years.length > 0 ? Math.max(...years) : null,
        minKm: kms.length > 0 ? Math.min(...kms) : null
    };
  }, [selectedVehicles]);

  if (selectedVehicles.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontWeight: '700', color: theme.text }}>Comparar</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Ionicons name="git-compare-outline" size={64} color={theme.textMuted} />
            <Text style={{ fontSize: 18, fontWeight: '600', color: theme.text, marginTop: 16, textAlign: 'center' }}>
                No has seleccionado vehículos para comparar.
            </Text>
            <Text style={{ fontSize: 14, color: theme.textMuted, marginTop: 8, textAlign: 'center' }}>
                Agrega vehículos desde el listado usando el botón de comparar.
            </Text>
            <TouchableOpacity 
                style={{ marginTop: 24, backgroundColor: theme.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 }}
                onPress={() => router.back()}
            >
                <Text style={{ color: '#FFF', fontWeight: '700' }}>Volver al listado</Text>
            </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Helper to render a label cell
  const renderLabelCell = (label: string, isHeader = false) => (
    <View style={{ 
        width: LABEL_WIDTH, 
        height: isHeader ? HEADER_HEIGHT : ROW_HEIGHT, 
        justifyContent: 'center', 
        paddingHorizontal: 10,
        borderBottomWidth: 1, 
        borderBottomColor: theme.badgeBorder,
        borderRightWidth: 1,
        borderRightColor: theme.badgeBorder,
        backgroundColor: theme.card 
    }}>
        <Text style={{ fontWeight: '600', color: theme.textMuted, fontSize: 12 }}>{label}</Text>
    </View>
  );

  // Helper to render a data cell
  const renderDataCell = (content: React.ReactNode, isHeader = false, isBest = false) => (
    <View style={{ 
        width: COL_WIDTH, 
        height: isHeader ? HEADER_HEIGHT : ROW_HEIGHT, 
        justifyContent: 'center', 
        alignItems: 'center',
        paddingHorizontal: 10,
        borderBottomWidth: 1, 
        borderBottomColor: theme.badgeBorder,
        borderRightWidth: 1,
        borderRightColor: theme.badgeBorder,
        backgroundColor: isBest ? (themeName === 'dark' ? '#064e3b' : '#dcfce7') : undefined
    }}>
        {content}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Top Header Bar */}
      <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: theme.badgeBorder }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontWeight: '700', color: theme.text }}>Comparar ({selectedVehicles.length})</Text>
        </View>
        <TouchableOpacity onPress={clearSelection}>
            <Text style={{ color: theme.accent, fontWeight: '600' }}>Limpiar</Text>
        </TouchableOpacity>
      </View>

      {/* Main ScrollView (Vertical) */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexDirection: 'row' }}>
        
        {/* Left Column (Fixed Labels) */}
        <View>
            {renderLabelCell("Vehículo", true)}
            {renderLabelCell("Precio")}
            {renderLabelCell("Año")}
            {renderLabelCell("Kilometraje")}
            {renderLabelCell("Combustible")}
            {renderLabelCell("Transmisión")}
            {renderLabelCell("Ubicación")}
            {renderLabelCell("Financiación")}
            {renderLabelCell("Permuta")}
            {renderLabelCell("Dueño Directo")}
            {renderLabelCell("Services")}
        </View>

        {/* Right Area (Horizontal Scrollable Data) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {selectedVehicles.map((vehicle) => (
                <View key={vehicle.id}>
                    {/* Header Cell (Image + Title) */}
                    {renderDataCell(
                        <View style={{ alignItems: 'center', width: '100%' }}>
                            <View style={{ position: 'relative' }}>
                                <Image 
                                    source={{ uri: vehicle.coverImage || "https://placehold.co/400x300" }} 
                                    style={{ width: 140, height: 100, borderRadius: 8, marginBottom: 8 }}
                                    contentFit="cover"
                                />
                                <TouchableOpacity 
                                    style={{ position: 'absolute', top: -8, right: -8, backgroundColor: theme.card, borderRadius: 12, padding: 2, borderWidth: 1, borderColor: theme.badgeBorder }}
                                    onPress={() => toggleVehicle(vehicle)}
                                >
                                    <Ionicons name="close-circle" size={20} color={theme.textMuted} />
                                </TouchableOpacity>
                            </View>
                            <Text style={{ fontWeight: '700', color: theme.text, textAlign: 'center', fontSize: 13 }} numberOfLines={2}>
                                {vehicle.brand} {vehicle.model}
                            </Text>
                            <Text style={{ fontSize: 11, color: theme.textMuted }}>{vehicle.version}</Text>
                            <TouchableOpacity 
                                style={{ marginTop: 6, backgroundColor: theme.accent, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}
                                onPress={() => router.push(`/car/${vehicle.id}`)}
                            >
                                <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>Ver</Text>
                            </TouchableOpacity>
                        </View>,
                        true
                    )}

                    {/* Data Cells */}
                    {renderDataCell(
                        <Text style={{ color: theme.price, fontWeight: '700' }}>
                            {vehicle.currency && vehicle.price ? `${vehicle.currency} ${vehicle.price.toLocaleString("es-AR")}` : "Consultar"}
                        </Text>,
                        false,
                        bestValues?.minPrice !== null && Number(vehicle.price) === bestValues.minPrice
                    )}
                    {renderDataCell(<Text style={{ color: theme.text }}>{vehicle.year}</Text>, false, bestValues?.maxYear !== null && Number(vehicle.year) === bestValues.maxYear)}
                    {renderDataCell(<Text style={{ color: theme.text }}>{vehicle.km ? `${vehicle.km.toLocaleString("es-AR")} km` : "-"}</Text>, false, bestValues?.minKm !== null && Number(vehicle.km) === bestValues.minKm)}
                    {renderDataCell(<Text style={{ color: theme.text }}>{vehicle.fuelType || "-"}</Text>)}
                    {renderDataCell(<Text style={{ color: theme.text }}>{vehicle.gearbox || "-"}</Text>)}
                    {renderDataCell(<Text style={{ color: theme.text, textAlign: 'center' }} numberOfLines={2}>{vehicle.location?.province || vehicle.province || "-"}</Text>)}
                    {renderDataCell(
                        vehicle.acceptsFinancing ? 
                        <Ionicons name="checkmark-circle" size={20} color="#4CD964" /> : 
                        <Ionicons name="close-circle" size={20} color="#FF3B30" />
                    )}
                    {renderDataCell(
                        vehicle.acceptsTradeIn ? 
                        <Ionicons name="checkmark-circle" size={20} color="#4CD964" /> : 
                        <Ionicons name="close-circle" size={20} color="#FF3B30" />
                    )}
                    {renderDataCell(
                        vehicle.singleOwner ? 
                        <Ionicons name="checkmark-circle" size={20} color="#4CD964" /> : 
                        <Ionicons name="close-circle" size={20} color="#FF3B30" />
                    )}
                    {renderDataCell(
                        vehicle.serviceRecords ? 
                        <Ionicons name="checkmark-circle" size={20} color="#4CD964" /> : 
                        <Ionicons name="close-circle" size={20} color="#FF3B30" />
                    )}
                </View>
            ))}
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}
