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
    const kms = selectedVehicles.map(v => Number(v.km)).filter(k => !isNaN(k) && k >= 0);
    const ratings = selectedVehicles.map(v => Number(v.sellerRating)).filter(r => !isNaN(r) && r > 0);
    const pricePerKmValues = sameCurrency
      ? selectedVehicles
          .map(v => (v.price && v.km && Number(v.km) > 0) ? Number(v.price) / Number(v.km) : null)
          .filter((x): x is number => x !== null)
      : [];

    return {
        minPrice: sameCurrency && prices.length > 0 ? Math.min(...prices) : null,
        maxYear: years.length > 0 ? Math.max(...years) : null,
        minKm: kms.length > 0 ? Math.min(...kms) : null,
        maxRating: ratings.length > 0 ? Math.max(...ratings) : null,
        minPricePerKm: pricePerKmValues.length > 0 ? Math.min(...pricePerKmValues) : null,
    };
  }, [selectedVehicles]);

  // Score board: count "wins" per vehicle across all categories
  const vehicleScores = React.useMemo(() => {
    if (!bestValues || selectedVehicles.length < 2) return null;
    const scores: Record<string, number> = {};
    selectedVehicles.forEach(v => { scores[v.id] = 0; });
    selectedVehicles.forEach(v => {
      if (bestValues.minPrice !== null && Number(v.price) === bestValues.minPrice) scores[v.id]++;
      if (bestValues.maxYear !== null && Number(v.year) === bestValues.maxYear) scores[v.id]++;
      if (bestValues.minKm !== null && Number(v.km) === bestValues.minKm) scores[v.id]++;
      if (bestValues.maxRating !== null && Number(v.sellerRating) === bestValues.maxRating) scores[v.id]++;
      if (bestValues.minPricePerKm !== null && v.price && v.km && Number(v.km) > 0) {
        const ppk = Number(v.price) / Number(v.km);
        if (Math.round(ppk) === Math.round(bestValues.minPricePerKm)) scores[v.id]++;
      }
      if (v.vtvValid) scores[v.id]++;
      if (v.papersUpToDate) scores[v.id]++;
      if (v.warranty) scores[v.id]++;
      if (v.singleOwner) scores[v.id]++;
      if (v.serviceRecords) scores[v.id]++;
      if (v.acceptsFinancing) scores[v.id]++;
      if (v.negotiablePrice) scores[v.id]++;
    });
    return scores;
  }, [selectedVehicles, bestValues]);

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
        {isBest && !isHeader && (
            <Text style={{ fontSize: 9, color: themeName === 'dark' ? '#6ee7b7' : '#166534', fontWeight: '700', marginTop: 2 }}>↑ MEJOR</Text>
        )}
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
      <ScrollView style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row' }}>

          {/* Left Column (Fixed Labels) */}
          <View>
              {renderLabelCell("Vehículo", true)}
              {renderLabelCell("Precio")}
              {renderLabelCell("Año")}
              {renderLabelCell("Kilometraje")}
              {renderLabelCell("$ por km")}
              {renderLabelCell("Combustible")}
              {renderLabelCell("Transmisión")}
              {renderLabelCell("Ubicación")}
              {renderLabelCell("Financiación")}
              {renderLabelCell("Permuta")}
              {renderLabelCell("Dueño Directo")}
              {renderLabelCell("Services")}
              {renderLabelCell("VTV válida")}
              {renderLabelCell("Papeles al día")}
              {renderLabelCell("Garantía")}
              {renderLabelCell("Precio negociable")}
              {renderLabelCell("Rating vendedor")}
          </View>

          {/* Right Area (Horizontal Scrollable Data) */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
              {selectedVehicles.map((vehicle) => {
                  const pricePerKm = (vehicle.price && vehicle.km && Number(vehicle.km) > 0)
                      ? Number(vehicle.price) / Number(vehicle.km)
                      : null;
                  return (
                      <View key={vehicle.id}>
                          {/* Header */}
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
                          {/* Precio */}
                          {renderDataCell(
                              <Text style={{ color: theme.price, fontWeight: '700' }}>
                                  {vehicle.currency && vehicle.price ? `${vehicle.currency} ${vehicle.price.toLocaleString("es-AR")}` : "Consultar"}
                              </Text>,
                              false,
                              bestValues?.minPrice !== null && bestValues?.minPrice !== undefined && Number(vehicle.price) === bestValues.minPrice
                          )}
                          {/* Año */}
                          {renderDataCell(
                              <Text style={{ color: theme.text }}>{vehicle.year || "-"}</Text>,
                              false,
                              bestValues?.maxYear !== null && bestValues?.maxYear !== undefined && Number(vehicle.year) === bestValues.maxYear
                          )}
                          {/* Km */}
                          {renderDataCell(
                              <Text style={{ color: theme.text }}>{vehicle.km !== undefined ? `${Number(vehicle.km).toLocaleString("es-AR")} km` : "-"}</Text>,
                              false,
                              bestValues?.minKm !== null && bestValues?.minKm !== undefined && Number(vehicle.km) === bestValues.minKm
                          )}
                          {/* $ por km */}
                          {renderDataCell(
                              <Text style={{ color: theme.text, fontSize: 12 }}>
                                  {pricePerKm ? `${vehicle.currency} ${Math.round(pricePerKm).toLocaleString("es-AR")}` : "-"}
                              </Text>,
                              false,
                              bestValues?.minPricePerKm !== null && bestValues?.minPricePerKm !== undefined && pricePerKm !== null && Math.round(pricePerKm) === Math.round(bestValues.minPricePerKm)
                          )}
                          {/* Combustible */}
                          {renderDataCell(<Text style={{ color: theme.text }}>{vehicle.fuelType || "-"}</Text>)}
                          {/* Transmisión */}
                          {renderDataCell(<Text style={{ color: theme.text }}>{vehicle.gearbox || "-"}</Text>)}
                          {/* Ubicación */}
                          {renderDataCell(<Text style={{ color: theme.text, textAlign: 'center' }} numberOfLines={2}>{vehicle.location?.province || vehicle.province || "-"}</Text>)}
                          {/* Booleanos */}
                          {renderDataCell(vehicle.acceptsFinancing ? <Ionicons name="checkmark-circle" size={20} color="#4CD964" /> : <Ionicons name="close-circle" size={20} color="#FF3B30" />)}
                          {renderDataCell(vehicle.acceptsTradeIn ? <Ionicons name="checkmark-circle" size={20} color="#4CD964" /> : <Ionicons name="close-circle" size={20} color="#FF3B30" />)}
                          {renderDataCell(vehicle.singleOwner ? <Ionicons name="checkmark-circle" size={20} color="#4CD964" /> : <Ionicons name="close-circle" size={20} color="#FF3B30" />)}
                          {renderDataCell(vehicle.serviceRecords ? <Ionicons name="checkmark-circle" size={20} color="#4CD964" /> : <Ionicons name="close-circle" size={20} color="#FF3B30" />)}
                          {renderDataCell(vehicle.vtvValid ? <Ionicons name="checkmark-circle" size={20} color="#4CD964" /> : <Ionicons name="close-circle" size={20} color="#FF3B30" />)}
                          {renderDataCell(vehicle.papersUpToDate ? <Ionicons name="checkmark-circle" size={20} color="#4CD964" /> : <Ionicons name="close-circle" size={20} color="#FF3B30" />)}
                          {renderDataCell(vehicle.warranty ? <Ionicons name="checkmark-circle" size={20} color="#4CD964" /> : <Ionicons name="close-circle" size={20} color="#FF3B30" />)}
                          {renderDataCell(vehicle.negotiablePrice ? <Ionicons name="checkmark-circle" size={20} color="#4CD964" /> : <Ionicons name="close-circle" size={20} color="#FF3B30" />)}
                          {/* Rating vendedor */}
                          {renderDataCell(
                              vehicle.sellerRating ? (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                      <Ionicons name="star" size={14} color="#F59E0B" />
                                      <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{Number(vehicle.sellerRating).toFixed(1)}</Text>
                                  </View>
                              ) : <Text style={{ color: theme.textMuted, fontSize: 12 }}>-</Text>,
                              false,
                              bestValues?.maxRating !== null && bestValues?.maxRating !== undefined && Number(vehicle.sellerRating) === bestValues.maxRating
                          )}
                      </View>
                  );
              })}
          </ScrollView>
        </View>

        {/* Winner Summary */}
        {vehicleScores && selectedVehicles.length >= 2 && (
            <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: theme.badgeBorder, marginTop: 8 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 12 }}>
                    Resumen — Categorías ganadas
                </Text>
                {(() => {
                    const maxScore = Math.max(...Object.values(vehicleScores));
                    return selectedVehicles
                        .slice()
                        .sort((a, b) => (vehicleScores[b.id] || 0) - (vehicleScores[a.id] || 0))
                        .map((v) => {
                            const score = vehicleScores[v.id] || 0;
                            const isWinner = score === maxScore && maxScore > 0;
                            return (
                                <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, padding: 10, backgroundColor: isWinner ? (themeName === 'dark' ? '#064e3b' : '#dcfce7') : theme.card, borderRadius: 10, borderWidth: 1, borderColor: isWinner ? '#166534' : theme.border }}>
                                    <Image source={{ uri: v.coverImage || "https://placehold.co/100" }} style={{ width: 44, height: 32, borderRadius: 4 }} contentFit="cover" />
                                    <View style={{ flex: 1, marginLeft: 10 }}>
                                        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{v.brand} {v.model} {v.year}</Text>
                                        {v.version ? <Text style={{ color: theme.textMuted, fontSize: 11 }} numberOfLines={1}>{v.version}</Text> : null}
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        {isWinner && <Ionicons name="trophy" size={16} color="#F59E0B" style={{ marginBottom: 2 }} />}
                                        <Text style={{ color: isWinner ? '#166534' : theme.textMuted, fontWeight: '800', fontSize: 18 }}>{score}</Text>
                                        <Text style={{ color: theme.textMuted, fontSize: 10 }}>puntos</Text>
                                    </View>
                                </View>
                            );
                        });
                })()}
                <Text style={{ color: theme.textMuted, fontSize: 11, textAlign: 'center', marginTop: 4 }}>
                    Puntos por mejor precio, año, km, documentación y rating del vendedor.
                </Text>
            </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
