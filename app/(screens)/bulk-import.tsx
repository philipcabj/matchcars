import { WebContainer } from '@/components/WebContainer';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { app, db, storage } from '@/lib/firebase';
import { logger } from '@/lib/logger';
import { canBulkImport } from '@/lib/planChecks';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import Papa from 'papaparse';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';

interface PreviewRow {
  id?: string;
  brand: string;
  model: string;
  valid: boolean;
}

interface BulkImportJob {
  status: 'processing' | 'done' | 'error';
  totalCount: number;
  processedCount: number;
  successCount: number;
  failCount: number;
  errors: { row: number; vehicle: string; message: string }[];
  errorMessage?: string;
}

const TEMPLATE_HEADERS = ['id', 'brand', 'model', 'version', 'year', 'price', 'currency', 'km', 'description', 'fuel', 'transmission'];
const TEMPLATE_ROWS = [
  ['AUTO1', 'Toyota', 'Corolla', 'XEI CVT', '2022', '18500', 'USD', '32000', 'Único dueño, service oficial al día', 'Nafta', 'Automática'],
  ['AUTO2', 'Volkswagen', 'Gol Trend', 'Trendline', '2019', '9800000', 'ARS', '58000', 'Impecable, VTV vigente', 'Nafta', 'Manual'],
];

export default function BulkImportScreen() {
  const { user, profile } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();

  // Disponible en cualquier plan pago (y admins) desde la reestructuración
  // de planes — antes era exclusivo Dealer.
  const hasAccess = canBulkImport(profile?.plan || "") || profile?.role === 'admin';

  if (!hasAccess) {
    return (
      <WebContainer>
        <View style={{ padding: 40, alignItems: 'center' }}>
          <Ionicons name="lock-closed" size={64} color={theme.textMuted} />
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: 'bold', marginTop: 20 }}>Función exclusiva de planes pagos</Text>
          <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 10 }}>La carga masiva por CSV está disponible desde el plan Pro.</Text>
          <TouchableOpacity
            onPress={() => router.push('/(screens)/subscribe')}
            style={{ backgroundColor: theme.primary, padding: 15, borderRadius: 10, marginTop: 20 }}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Ver planes</Text>
          </TouchableOpacity>
        </View>
      </WebContainer>
    );
  }

  const [csvFile, setCsvFile] = useState<any>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [processingCsv, setProcessingCsv] = useState(false);

  const [zipFile, setZipFile] = useState<any>(null);

  const [phase, setPhase] = useState<'form' | 'uploading' | 'processing'>('form');
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<BulkImportJob | null>(null);
  const [startError, setStartError] = useState('');

  useEffect(() => {
    if (!jobId) return;
    const unsub = onSnapshot(doc(db, 'bulkImportJobs', jobId), (snap) => {
      if (snap.exists()) setJob(snap.data() as BulkImportJob);
    });
    return () => unsub();
  }, [jobId]);

  const downloadTemplate = () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Aviso', 'Descargá la planilla desde la versión web.');
      return;
    }
    const csv = Papa.unparse({ fields: TEMPLATE_HEADERS, data: TEMPLATE_ROWS });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-vehiculos-matchcars.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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
        parseCsvPreview(file);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'No se pudo cargar el archivo CSV');
    }
  };

  const processPreview = (results: any) => {
    if (results.errors && results.errors.length > 0) {
      logger.warn('CSV Errors:', results.errors);
    }

    const rows: PreviewRow[] = results.data.map((row: any) => {
      const brand = row.brand || row.marca || '';
      const model = row.model || row.modelo || '';
      return {
        id: row.id || row.sku || row.vin,
        brand,
        model,
        valid: !!(brand && model),
      };
    });

    setPreviewRows(rows);

    const validCount = rows.filter((r) => r.valid).length;
    if (validCount === 0) {
      Alert.alert(
        'Error de lectura',
        `No se encontraron vehículos válidos en el CSV.\n\nFilas encontradas: ${rows.length}\n\nAsegurate de tener las columnas: brand (o marca), model (o modelo). Descargá la planilla de ejemplo si no estás seguro del formato.`
      );
    }
  };

  // 2. Parse CSV (solo para vista previa; el import real lo procesa la Cloud Function)
  const parseCsvPreview = async (fileAsset: any) => {
    setProcessingCsv(true);
    try {
      if (Platform.OS === 'web' && fileAsset.file) {
        Papa.parse(fileAsset.file, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.trim().toLowerCase(),
          complete: (results) => {
            processPreview(results);
            setProcessingCsv(false);
          },
          error: (err) => {
            console.error(err);
            Alert.alert('Error CSV', err.message);
            setProcessingCsv(false);
          },
        });
        return;
      }

      if (Platform.OS !== 'web') {
        Alert.alert('Aviso', 'El importador masivo está optimizado para Web.');
        setProcessingCsv(false);
        return;
      }

      const response = await fetch(fileAsset.uri);
      const content = await response.text();

      Papa.parse(content, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().toLowerCase(),
        complete: (results) => {
          processPreview(results);
          setProcessingCsv(false);
        },
        error: (error: any) => {
          Alert.alert('Error CSV', error.message);
          setProcessingCsv(false);
        },
      });
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Falló la lectura del archivo');
      setProcessingCsv(false);
    }
  };

  // 3. Pick ZIP de fotos
  const pickZip = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });
      if (result.assets && result.assets.length > 0) {
        setZipFile(result.assets[0]);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'No se pudo cargar el archivo .zip');
    }
  };

  // 4. Subir CSV + ZIP y disparar la Cloud Function startBulkImport
  const handleStartImport = async () => {
    if (!user || !csvFile || !zipFile) return;
    setPhase('uploading');
    setStartError('');
    try {
      const newJobId = doc(collection(db, 'bulkImportJobs')).id;

      const csvBlob = csvFile.file || (await (await fetch(csvFile.uri)).blob());
      await uploadBytes(ref(storage, `bulkImports/${user.uid}/${newJobId}/data.csv`), csvBlob);

      const zipBlob = zipFile.file || (await (await fetch(zipFile.uri)).blob());
      await uploadBytes(ref(storage, `bulkImports/${user.uid}/${newJobId}/photos.zip`), zipBlob);

      setJobId(newJobId);
      setPhase('processing');

      const startBulkImportFn = httpsCallable(getFunctions(app), 'startBulkImport');
      startBulkImportFn({ jobId: newJobId }).catch((e: any) => {
        console.error('startBulkImport failed:', e);
        setStartError(e.message || 'La importación falló.');
      });
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', e.message || 'No se pudieron subir los archivos.');
      setPhase('form');
    }
  };

  const resetForm = () => {
    setPhase('form');
    setJobId(null);
    setJob(null);
    setStartError('');
    setCsvFile(null);
    setPreviewRows([]);
    setZipFile(null);
  };

  const validRowCount = previewRows.filter((r) => r.valid).length;

  return (
    <WebContainer>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: theme.text }}>
          Importador Masivo
        </Text>

        {phase === 'form' && (
          <>
            <Text style={{ color: theme.textMuted, marginBottom: 20 }}>
              Descargá la planilla de ejemplo, completala con tu stock y subí las fotos en un único archivo .zip
              (cada foto nombrada con el ID del vehículo, ej: ID=&quot;AUTO1&quot;, foto=&quot;AUTO1_01.jpg&quot;, o agrupadas en una
              carpeta con el nombre del ID dentro del .zip).
            </Text>

            <TouchableOpacity
              onPress={downloadTemplate}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.card, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.border, marginBottom: 24, alignSelf: 'flex-start' }}
            >
              <Ionicons name="download-outline" size={20} color={theme.accent} />
              <Text style={{ color: theme.accent, fontWeight: '600' }}>Descargar planilla de ejemplo</Text>
            </TouchableOpacity>

            {/* Step 1: CSV */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: theme.text, marginBottom: 10 }}>1. Cargar planilla completa (CSV)</Text>
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

            {/* Step 2: ZIP de fotos */}
            {previewRows.length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: '600', color: theme.text, marginBottom: 10 }}>2. Cargar fotos (.zip)</Text>
                <TouchableOpacity
                  onPress={pickZip}
                  style={{ backgroundColor: theme.card, padding: 20, borderRadius: 12, alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: theme.border }}
                >
                  <Ionicons name="folder-open-outline" size={32} color={theme.accent} />
                  <Text style={{ color: theme.text, marginTop: 8 }}>
                    {zipFile ? zipFile.name : 'Seleccionar archivo .zip con las fotos'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Preview */}
            {previewRows.length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: '600', color: theme.text, marginBottom: 10 }}>
                  Vista previa ({validRowCount}/{previewRows.length} vehículos válidos)
                </Text>
                <View style={{ gap: 8 }}>
                  {previewRows.slice(0, 20).map((v, i) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: theme.card, borderRadius: 8 }}>
                      <Text style={{ color: theme.text, fontWeight: 'bold' }}>
                        {v.valid ? `${v.brand} ${v.model}` : `Fila ${i + 1} inválida (falta marca o modelo)`}
                      </Text>
                      <Text style={{ color: theme.textMuted }}>ID: {v.id || 'N/A'}</Text>
                    </View>
                  ))}
                  {previewRows.length > 20 && (
                    <Text style={{ color: theme.textMuted, textAlign: 'center' }}>
                      y {previewRows.length - 20} más...
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Action */}
            {previewRows.length > 0 && zipFile && (
              <TouchableOpacity
                onPress={handleStartImport}
                disabled={validRowCount === 0}
                style={{
                  backgroundColor: validRowCount === 0 ? theme.textMuted : theme.primary,
                  padding: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                  marginTop: 10,
                  opacity: validRowCount === 0 ? 0.7 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
                  Importar {validRowCount} vehículo{validRowCount === 1 ? '' : 's'}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {phase === 'uploading' && (
          <View style={{ alignItems: 'center', padding: 40 }}>
            <ActivityIndicator color={theme.primary} size="large" />
            <Text style={{ color: theme.text, marginTop: 16 }}>Subiendo planilla y fotos...</Text>
          </View>
        )}

        {phase === 'processing' && (
          <View style={{ padding: 10 }}>
            {startError ? (
              <View style={{ alignItems: 'center', padding: 20 }}>
                <Ionicons name="alert-circle" size={48} color="#EF4444" />
                <Text style={{ color: theme.text, fontWeight: 'bold', fontSize: 16, marginTop: 12, textAlign: 'center' }}>
                  No se pudo completar la importación
                </Text>
                <Text style={{ color: theme.textMuted, marginTop: 6, textAlign: 'center' }}>{startError}</Text>
                <TouchableOpacity onPress={resetForm} style={{ backgroundColor: theme.primary, padding: 14, borderRadius: 10, marginTop: 20 }}>
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>Volver a intentar</Text>
                </TouchableOpacity>
              </View>
            ) : !job ? (
              <View style={{ alignItems: 'center', padding: 40 }}>
                <ActivityIndicator color={theme.primary} size="large" />
                <Text style={{ color: theme.text, marginTop: 16 }}>Preparando importación...</Text>
              </View>
            ) : (
              <View>
                <Text style={{ fontSize: 18, fontWeight: '600', color: theme.text, marginBottom: 12 }}>
                  {job.status === 'done' ? 'Importación finalizada' : 'Importando tu stock...'}
                </Text>

                <View style={{ height: 10, borderRadius: 999, backgroundColor: theme.card, overflow: 'hidden', marginBottom: 10 }}>
                  <View
                    style={{
                      height: '100%',
                      width: `${job.totalCount ? Math.round((job.processedCount / job.totalCount) * 100) : 0}%`,
                      backgroundColor: theme.primary,
                    }}
                  />
                </View>
                <Text style={{ color: theme.textMuted, marginBottom: 16 }}>
                  {job.processedCount}/{job.totalCount} procesados · {job.successCount} exitosos · {job.failCount} con errores
                </Text>

                {job.errors && job.errors.length > 0 && (
                  <View style={{ marginBottom: 16, gap: 6 }}>
                    <Text style={{ color: theme.text, fontWeight: '600' }}>Errores:</Text>
                    {job.errors.map((err, i) => (
                      <Text key={i} style={{ color: '#EF4444', fontSize: 13 }}>
                        Fila {err.row} ({err.vehicle}): {err.message}
                      </Text>
                    ))}
                  </View>
                )}

                {job.status === 'done' && (
                  <TouchableOpacity
                    onPress={() => router.push('/(tabs)/mycars')}
                    style={{ backgroundColor: theme.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 }}
                  >
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Ir a Mis Autos</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </WebContainer>
  );
}
