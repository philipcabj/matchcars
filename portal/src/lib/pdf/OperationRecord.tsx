// portal/src/lib/pdf/OperationRecord.tsx
// Registro completo de una Operación de venta — a diferencia de
// BoletoCompraventa/ReciboDeSena (SaleDocuments.tsx), que son documentos
// legales para firmar, esto es un snapshot interno con TODO el detalle
// (forma de pago, financiación, parte de pago, checklist, entrega) para
// que la agencia tenga un registro descargable de cada operación — no
// reemplaza ni se mezcla con esos documentos.
import "server-only";

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#171B16" },
  header: { marginBottom: 20, textAlign: "center" },
  brand: { fontSize: 9, color: "#8B9184", marginBottom: 3 },
  title: { fontSize: 15, fontWeight: 700 },
  subtitle: { fontSize: 10, color: "#5B655D", marginTop: 3 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: "#D8DAD3" },
  row: { flexDirection: "row", gap: 20 },
  col: { flex: 1 },
  label: { fontSize: 8, color: "#5B655D", marginBottom: 2, textTransform: "uppercase" },
  value: { fontSize: 10, marginBottom: 8 },
  badge: { fontSize: 9, fontWeight: 700 },
  note: { fontSize: 9, color: "#5B655D", lineHeight: 1.5 },
  table: { borderWidth: 1, borderColor: "#D8DAD3", borderRadius: 2 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#D8DAD3" },
  trLast: { flexDirection: "row" },
  th: { fontSize: 8, fontWeight: 700, color: "#5B655D", textTransform: "uppercase", padding: 6 },
  td: { fontSize: 9, padding: 6 },
  cKey: { width: "34%" },
  cResp: { width: "22%" },
  cDate: { width: "22%" },
  cAdj: { width: "22%" },
  footer: { position: "absolute", bottom: 28, left: 40, right: 40, fontSize: 8, color: "#8B9184", textAlign: "center" },
  pageNumber: { position: "absolute", bottom: 28, right: 40, fontSize: 8, color: "#8B9184" },
});

function fmtMoney(n: number | null | undefined, currency: string) {
  if (!n) return "—";
  return `${currency} ${n.toLocaleString("es-AR")}`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABELS: Record<string, string> = { en_curso: "En curso", completada: "Completada", cancelada: "Cancelada" };
const METODO_PAGO_LABELS: Record<string, string> = {
  efectivo: "Efectivo / contado",
  financiado_propio: "Financiación propia (cuotas)",
  financiado_externo: "Financiera / crédito privado",
};
const CONDITION_LABELS: Record<string, string> = { excelente: "Excelente", bueno: "Bueno", regular: "Regular" };

export interface OperationRecordData {
  id: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  agencyName: string;
  assignedToName: string | null;
  buyerLabel: string;
  vehicle: {
    brand: string;
    model: string;
    version?: string;
    year: number | null;
    licensePlate?: string;
    km: number | null;
    price: number;
    currency: string;
    publicationCode?: number | null;
  };
  metodoPago: string | null;
  metodoPagoConfirmado: boolean;
  financieraNombre: string | null;
  financiacion: {
    precioTotal: number;
    anticipo: number;
    cuotas: number;
    tasaAnual: number;
    cuotaMensual: number;
    montoFinanciado: number;
  } | null;
  parteDePago: {
    incluye: boolean;
    marca: string;
    modelo: string;
    version: string;
    anio: number | null;
    km: number | null;
    estado: string;
    tasacion: { min: number; avg: number; max: number; fuente: string } | null;
    precioTomaFinal: number | null;
    precioTomaConfirmado: boolean;
    tasadoPorName: string | null;
    agregadoAlStock: boolean;
  };
  checklist: {
    label: string;
    status: string;
    responsableName: string | null;
    completedAt: string | null;
    adjuntosCount: number;
  }[];
  documentosGenerados: { tipo: string; generadoEn: string | null }[];
  entrega: {
    vehicleStatus: string | null;
    buyerId: string | null;
    confirmedByBuyer: boolean | null;
    confirmedAt: string | null;
    confirmedAutomatically: boolean;
  } | null;
  generadoEn: string;
}

const DOC_TIPO_LABELS: Record<string, string> = { boleto_compraventa: "Boleto de compraventa", recibo_sena: "Recibo de seña" };

export function OperationRecord({ data }: { data: OperationRecordData }) {
  const v = data.vehicle;
  const tradeIn = data.parteDePago;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>MatchCars — Operaciones de venta</Text>
          <Text style={styles.title}>Registro de operación</Text>
          <Text style={styles.subtitle}>
            {v.brand} {v.model} {v.year ?? ""} · {data.buyerLabel}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos generales</Text>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Estado</Text>
              <Text style={styles.value}>{STATUS_LABELS[data.status] ?? data.status}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Vendedor asignado</Text>
              <Text style={styles.value}>{data.assignedToName ?? "Sin asignar"}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Creada</Text>
              <Text style={styles.value}>{fmtDate(data.createdAt)}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Última actualización</Text>
              <Text style={styles.value}>{fmtDate(data.updatedAt)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehículo</Text>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Vehículo</Text>
              <Text style={styles.value}>
                {v.brand} {v.model} {v.version} {v.year ?? ""}
              </Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Patente / Dominio</Text>
              <Text style={styles.value}>{v.licensePlate || "—"}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Kilómetros</Text>
              <Text style={styles.value}>{v.km ? v.km.toLocaleString("es-AR") : "—"}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Precio de venta</Text>
              <Text style={styles.value}>{fmtMoney(v.price, v.currency)}</Text>
            </View>
          </View>
          {v.publicationCode && (
            <>
              <Text style={styles.label}>Publicación MatchCars</Text>
              <Text style={styles.value}>#{v.publicationCode}</Text>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Forma de pago</Text>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Cómo se cubre</Text>
              <Text style={styles.value}>
                {data.metodoPago ? METODO_PAGO_LABELS[data.metodoPago] ?? data.metodoPago : "Sin definir"}
                {data.metodoPago === "financiado_externo" && data.financieraNombre ? ` — ${data.financieraNombre}` : ""}
              </Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Confirmada</Text>
              <Text style={styles.value}>{data.metodoPagoConfirmado ? "Sí" : "No"}</Text>
            </View>
          </View>

          {data.financiacion && (
            <>
              <Text style={[styles.label, { marginTop: 4 }]}>Financiación propia</Text>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.value}>Precio total: {fmtMoney(data.financiacion.precioTotal, v.currency)}</Text>
                  <Text style={styles.value}>Anticipo: {fmtMoney(data.financiacion.anticipo, v.currency)}</Text>
                </View>
                <View style={styles.col}>
                  <Text style={styles.value}>
                    {data.financiacion.cuotas} cuotas de {fmtMoney(data.financiacion.cuotaMensual, v.currency)}
                  </Text>
                  <Text style={styles.value}>Tasa nominal anual: {data.financiacion.tasaAnual}%</Text>
                </View>
              </View>
            </>
          )}

          {tradeIn.incluye && (
            <>
              <Text style={[styles.label, { marginTop: 4 }]}>Parte de pago (usado recibido)</Text>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.value}>
                    {tradeIn.marca} {tradeIn.modelo} {tradeIn.version} {tradeIn.anio ?? ""}
                  </Text>
                  <Text style={styles.value}>Km: {tradeIn.km ? tradeIn.km.toLocaleString("es-AR") : "—"}</Text>
                  <Text style={styles.value}>Estado: {CONDITION_LABELS[tradeIn.estado] ?? tradeIn.estado ?? "—"}</Text>
                </View>
                <View style={styles.col}>
                  {tradeIn.tasacion && (
                    <Text style={styles.value}>
                      Tasación: {fmtMoney(tradeIn.tasacion.min, v.currency)} – {fmtMoney(tradeIn.tasacion.max, v.currency)} (
                      {tradeIn.tasacion.fuente === "matchcars" ? "MatchCars" : "manual"})
                    </Text>
                  )}
                  <Text style={styles.value}>
                    Precio de toma: {fmtMoney(tradeIn.precioTomaFinal, v.currency)} {tradeIn.precioTomaConfirmado ? "(confirmado)" : "(sin confirmar)"}
                  </Text>
                  <Text style={styles.value}>Tasado por: {tradeIn.tasadoPorName ?? "—"}</Text>
                  <Text style={styles.value}>Ingresado al stock: {tradeIn.agregadoAlStock ? "Sí" : "No"}</Text>
                </View>
              </View>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Checklist de trámites</Text>
          <View style={styles.table}>
            <View style={styles.tr}>
              <Text style={[styles.th, styles.cKey]}>Paso</Text>
              <Text style={[styles.th, styles.cResp]}>Responsable</Text>
              <Text style={[styles.th, styles.cDate]}>Completado</Text>
              <Text style={[styles.th, styles.cAdj]}>Adjuntos</Text>
            </View>
            {data.checklist.map((c, i) => (
              <View key={c.label} style={i === data.checklist.length - 1 ? styles.trLast : styles.tr}>
                <Text style={[styles.td, styles.cKey]}>{c.label}</Text>
                <Text style={[styles.td, styles.cResp]}>{c.responsableName ?? "—"}</Text>
                <Text style={[styles.td, styles.cDate]}>{c.status === "hecho" ? fmtDate(c.completedAt) : "Pendiente"}</Text>
                <Text style={[styles.td, styles.cAdj]}>{c.adjuntosCount || "—"}</Text>
              </View>
            ))}
          </View>
        </View>

        {data.documentosGenerados.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Documentos generados</Text>
            {data.documentosGenerados.map((d, i) => (
              <Text key={i} style={styles.note}>
                • {DOC_TIPO_LABELS[d.tipo] ?? d.tipo} — {fmtDate(d.generadoEn)}
              </Text>
            ))}
          </View>
        )}

        {data.entrega && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Entrega y confirmación</Text>
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Estado del vehículo</Text>
                <Text style={styles.value}>{data.entrega.vehicleStatus === "sold" ? "Vendido / entregado" : "Reservado, en espera"}</Text>
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Confirmación del comprador</Text>
                <Text style={styles.value}>
                  {data.entrega.confirmedByBuyer
                    ? `Sí — ${fmtDateTime(data.entrega.confirmedAt)}${data.entrega.confirmedAutomatically ? " (automática, no respondió a tiempo)" : ""}`
                    : "Pendiente"}
                </Text>
              </View>
            </View>
          </View>
        )}

        <Text style={styles.footer}>Generado desde el Portal de Agencias de MatchCars — {fmtDateTime(data.generadoEn)}</Text>
      </Page>
    </Document>
  );
}
