import { WebContainer } from '@/components/WebContainer';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { db, storage } from '@/lib/firebase';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import Papa from 'papaparse';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';

interface ImportedVehicle {
  id?: string; // ID for matching (SKU, VIN)
  brand: string;
  model: string;
  version: string;
  year: string;
  price: string;
  currency: string;
  km: string;
  description?: string;
  fuel?: string;
  transmission?: string;
  bodyType?: string;
  color?: string;
  engine?: string;
  doors?: string;
  matchedImages: any[]; // DocumentPickerAsset[]
}

export default function BulkImportScreen() {
  const { user, profile } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  
  const [csvFile, setCsvFile] = useState<any>(null);
  const [parsedData, setParsedData] = useState<ImportedVehicle[]>([]);
  const [imageFiles, setImageFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');

  const [processingCsv, setProcessingCsv] = useState(false);

  // 1. Pick CSV
  const pickCsv = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'application/vnd.ms-excel', 'text/comma-separated-values'],
        copyToCacheDirectory: true,
      });

      if (result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setCsvFile(file);
        parseCsv(file);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'No se pudo cargar el archivo CSV');
    }
  };

  const processResults = (results: any) => {
      
      if (results.errors && results.errors.length > 0) {
        console.warn("CSV Errors:", results.errors);
      }

      const vehicles: ImportedVehicle[] = results.data.map((row: any) => {
         return {
            id: row.id || row.sku || row.vin,
            brand: row.brand || row.marca || '',
            model: row.model || row.modelo || '',
            version: row.version || row.versión || row.variant || '',
            year: row.year || row.año || row.anio || '',
            price: row.price || row.precio || '',
            currency: (row.currency || row.moneda || 'USD').toString().toUpperCase().includes('PESO') || (row.currency || row.moneda || 'USD').toString().toUpperCase().includes('ARS') ? 'ARS' : 'USD',
            km: row.km || row.kilometraje || '',
            description: row.description || row.descripcion || '',
            fuel: row.fuel || row.combustible,
            transmission: row.transmission || row.transmision,
            matchedImages: [],
         };
      }).filter((v: any) => {
        const isValid = v.brand && v.model;
        if (!isValid) console.log("Invalid vehicle row:", v);
        return isValid;
      }); 

      if (vehicles.length === 0) {
         Alert.alert(
           'Error de Lectura', 
           `No se encontraron vehículos válidos en el CSV. \n\nFilas encontradas: ${results.data.length}\n\nAsegúrate de tener las columnas: brand (o marca), model (o modelo).`
         );
      } else {
         Alert.alert('CSV Cargado', `Se detectaron ${vehicles.length} vehículos correctamente.`);
      }

      // If images are already loaded, match them now
      if (imageFiles && imageFiles.length > 0) {
          const updated = vehicles.map((v: any) => {
            if (!v.id) return v;
            const matches = imageFiles.filter(img => {
                const name = img.name || img.file?.name || '';
                return name.toLowerCase().startsWith(v.id!.toLowerCase());
            });
            return { ...v, matchedImages: matches };
          });
          setParsedData(updated);
      } else {
          setParsedData(vehicles);
      }
  };

  // 2. Parse CSV
  const parseCsv = async (fileAsset: any) => {
    setProcessingCsv(true);
    try {
      // Case A: Web with Native File Object (Best for large files)
      if (Platform.OS === 'web' && fileAsset.file) {
          Papa.parse(fileAsset.file, {
              header: true,
              skipEmptyLines: true,
              transformHeader: (h) => h.trim().toLowerCase(),
              complete: (results) => {
                  processResults(results);
                  setProcessingCsv(false);
              },
              error: (err) => {
                  console.error(err);
                  Alert.alert('Error CSV', err.message);
                  setProcessingCsv(false);
              }
          });
          return;
      }

      // Case B: URI Fetch (Fallback)
      let content = '';
      if (Platform.OS === 'web') {
        const response = await fetch(fileAsset.uri);
        content = await response.text();
      } else {
        Alert.alert('Aviso', 'El importador masivo está optimizado para Web.');
        setProcessingCsv(false);
        return;
      }
      
      Papa.parse(content, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().toLowerCase(),
        complete: (results) => {
            processResults(results);
            setProcessingCsv(false);
        },
        error: (error: any) => {
          Alert.alert('Error CSV', error.message);
          setProcessingCsv(false);
        }
      });
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Falló la lectura del archivo');
      setProcessingCsv(false);
    }
  };

  // 3. Pick Images
  const pickImages = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        multiple: true, // Only works well on Web
        copyToCacheDirectory: false,
      });

      if (result.assets) {
        setImageFiles(result.assets);
        matchImagesToVehicles(parsedData, result.assets);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 4. Match Logic
  const matchImagesToVehicles = (vehicles: ImportedVehicle[], images: any[]) => {
    const updated = vehicles.map(v => {
      if (!v.id) return v;
      // Match if filename starts with ID (e.g. "FORD001_01.jpg")
      const matches = images.filter(img => {
          const name = img.name || img.file?.name || '';
          return name.toLowerCase().startsWith(v.id!.toLowerCase());
      });
      return { ...v, matchedImages: matches };
    });
    setParsedData(updated);
  };

  // 5. Upload Process
  const handleImport = async () => {
    if (!user) return;
    setUploading(true);
    setProgress('Iniciando importación...');

    let successCount = 0;
    let failCount = 0;
    let lastError = "";

    for (const [index, vehicle] of parsedData.entries()) {
      try {
        setProgress(`Importando ${index + 1}/${parsedData.length}: ${vehicle.brand} ${vehicle.model}`);
        
        // Upload images first
        const imageUrls: string[] = [];
        const vehicleDocId = `${Date.now()}_${index}`; // Temp ID for storage path, or auto-gen

        for (const imgAsset of vehicle.matchedImages) {
            const blob = await fetch(imgAsset.uri).then(r => r.blob());
            const filename = imgAsset.name || 'image.jpg';
            const storageRef = ref(storage, `vehicles/${user.uid}/${vehicleDocId}/${filename}`);
            await uploadBytes(storageRef, blob);
            const url = await getDownloadURL(storageRef);
            imageUrls.push(url);
        }

        // Prepare data for Firestore avoiding undefined fields
        const { matchedImages, id, ...vehicleData } = vehicle;

        // Determine correct location from Profile (Agency Address)
        let locationStr = 'Ubicación a consultar';
        if (profile?.businessAddress) {
            locationStr = profile.businessAddress;
        }

        // Determine correct User Name (Agency Name Priority)
        const userName = profile?.agencyName || profile?.firstName || user.displayName || 'Agencia';

        // Add to Firestore
        await addDoc(collection(db, 'vehicles'), {
            ...vehicleData,
            userId: user.uid,
            userName: userName,
            userImage: profile?.photoURL || user.photoURL || '',
            userEmail: user.email,
            location: locationStr, 
            city: locationStr, // Ensure location is set in city
            province: locationStr, // Ensure location is set in province
            userPlan: profile?.plan || 'free', 
            // Standardize image fields based on Vehicle type
            coverImage: imageUrls[0] || '',
            additionalImages: imageUrls.slice(1),
            images: imageUrls, // Keep for backward compatibility
            category: 'auto', // Default
            createdAt: serverTimestamp(),
            status: 'pending', // Send to moderation
            published: false, // Not public yet
            sold: false,
            likes: [],
            internal_id: id, // Keep it for reference
            // Ensure numeric types where possible
            year: Number(vehicle.year) || vehicle.year,
            price: Number(vehicle.price) || vehicle.price,
            km: Number(vehicle.km) || vehicle.km,
        });

        successCount++;
      } catch (e: any) {
        console.error("Error importing vehicle:", e);
        lastError = e.message || String(e);
        failCount++;
      }
    }

    setUploading(false);
    setProgress('');
    
    if (failCount > 0) {
        Alert.alert('Importación Finalizada con Errores', `Exitosos: ${successCount}\nFallidos: ${failCount}\n\nÚltimo error detectado: ${lastError}`);
    } else {
        Alert.alert('Importación Finalizada', `Todos los vehículos se importaron correctamente.\nTotal: ${successCount}`);
    }
    
    router.replace('/profile');
  };

  return (
    <WebContainer>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: theme.text }}>
          Importador Masivo
        </Text>

        <Text style={{ color: theme.textMuted, marginBottom: 20 }}>
            Sube tu inventario desde un archivo CSV. Asegúrate de que las fotos tengan el mismo nombre que el ID del vehículo en el archivo (ej: ID="AUTO1", Foto="AUTO1_01.jpg").
        </Text>

        {/* Step 1: CSV */}
        <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: theme.text, marginBottom: 10 }}>1. Cargar Archivo CSV</Text>
            <TouchableOpacity 
                onPress={pickCsv}
                disabled={processingCsv}
                style={{ backgroundColor: theme.card, padding: 20, borderRadius: 12, alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: theme.border }}
            >
                {processingCsv ? (
                    <>
                        <ActivityIndicator color={theme.primary} size="large" />
                        <Text style={{ color: theme.text, marginTop: 8 }}>Procesando CSV...</Text>
                    </>
                ) : (
                    <>
                        <Ionicons name="document-text-outline" size={32} color={theme.primary} />
                        <Text style={{ color: theme.text, marginTop: 8 }}>
                            {csvFile ? csvFile.name : 'Seleccionar archivo .csv'}
                        </Text>
                    </>
                )}
            </TouchableOpacity>
        </View>

        {/* Step 2: Photos */}
        {parsedData.length > 0 && (
            <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: '600', color: theme.text, marginBottom: 10 }}>2. Cargar Carpeta de Fotos</Text>
                <TouchableOpacity 
                    onPress={pickImages}
                    style={{ backgroundColor: theme.card, padding: 20, borderRadius: 12, alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: theme.border }}
                >
                    <Ionicons name="images-outline" size={32} color={theme.accent} />
                    <Text style={{ color: theme.text, marginTop: 8 }}>
                        {imageFiles.length > 0 ? `${imageFiles.length} fotos seleccionadas` : 'Seleccionar fotos (Ctrl+A en carpeta)'}
                    </Text>
                </TouchableOpacity>
            </View>
        )}

        {/* Preview */}
        {parsedData.length > 0 && (
            <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: '600', color: theme.text, marginBottom: 10 }}>
                    Vista Previa ({parsedData.length} vehículos)
                </Text>
                <View style={{ gap: 10 }}>
                    {parsedData.map((v, i) => (
                        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: theme.card, borderRadius: 8 }}>
                            <View>
                                <Text style={{ color: theme.text, fontWeight: 'bold' }}>{v.brand} {v.model}</Text>
                                <Text style={{ color: theme.textMuted }}>ID: {v.id || 'N/A'} • {v.year} • {v.price}</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ color: v.matchedImages?.length ? 'green' : 'red', fontWeight: 'bold' }}>
                                    {v.matchedImages?.length || 0} fotos
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>
            </View>
        )}

        {/* Action */}
        {parsedData.length > 0 && (
            <TouchableOpacity 
                onPress={handleImport}
                disabled={uploading}
                style={{ 
                    backgroundColor: uploading ? theme.textMuted : theme.primary, 
                    padding: 16, 
                    borderRadius: 12, 
                    alignItems: 'center', 
                    marginTop: 20,
                    opacity: uploading ? 0.7 : 1
                }}
            >
                {uploading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
                        Importar {parsedData.length} Vehículos
                    </Text>
                )}
            </TouchableOpacity>
        )}

        {uploading && (
            <Text style={{ textAlign: 'center', marginTop: 10, color: theme.text }}>{progress}</Text>
        )}

      </ScrollView>
    </WebContainer>
  );
}
