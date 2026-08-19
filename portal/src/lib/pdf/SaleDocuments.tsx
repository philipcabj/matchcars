// portal/src/lib/pdf/SaleDocuments.tsx
// Plantillas de PDF real (boleto de compraventa, recibo de seña) — Módulo A,
// Fase 3. Antes de esto, "ficha PDF" (portal/src/app/ficha/[id]/page.tsx) era
// en realidad una página HTML con window.print(), no un archivo generado;
// acá sí es un PDF real vía @react-pdf/renderer, server-side, sin navegador
// headless. No llevan QR a propósito — son documentos legales, no piezas de
// marketing.
import "server-only";

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: "Helvetica", color: "#171B16" },
  header: { marginBottom: 24, textAlign: "center" },
  brand: { fontSize: 10, color: "#8B9184", marginBottom: 4 },
  title: { fontSize: 16, fontWeight: 700, textTransform: "uppercase" },
  section: { marginBottom: 16 },
  label: { fontSize: 9, color: "#5B655D", marginBottom: 2, textTransform: "uppercase" },
  value: { fontSize: 11, marginBottom: 10 },
  row: { flexDirection: "row", gap: 24 },
  col: { flex: 1 },
  paragraph: { fontSize: 11, lineHeight: 1.6, marginBottom: 16 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#D8DAD3", marginVertical: 16 },
  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 64 },
  signBox: { width: "40%", textAlign: "center" },
  signLine: { borderTopWidth: 1, borderTopColor: "#171B16", marginBottom: 6 },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, fontSize: 8, color: "#8B9184", textAlign: "center" },
});

export interface DocumentData {
  agencyName: string;
  agencyAddress?: string;
  buyerLabel: string;
  brand: string;
  model: string;
  version?: string;
  year?: number | null;
  licensePlate?: string;
  km?: number | null;
  price: number;
  currency: string;
  fecha: string; // ya formateada, es-AR
  publicationCode?: number | null;
}

function fmtMoney(n: number, currency: string) {
  return `${currency} ${n.toLocaleString("es-AR")}`;
}

export function BoletoCompraventa({ data }: { data: DocumentData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>MatchCars — Operaciones de venta</Text>
          <Text style={styles.title}>Boleto de compraventa</Text>
        </View>

        <Text style={styles.paragraph}>
          En {data.fecha}, entre {data.agencyName} (en adelante &quot;EL VENDEDOR&quot;) y {data.buyerLabel} (en adelante
          &quot;EL COMPRADOR&quot;), se acuerda la compraventa del vehículo detallado a continuación, sujeta a las condiciones que
          ambas partes declaran conocer y aceptar.
        </Text>

        <View style={styles.section}>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Vehículo</Text>
              <Text style={styles.value}>
                {data.brand} {data.model} {data.version} {data.year ?? ""}
              </Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Patente / Dominio</Text>
              <Text style={styles.value}>{data.licensePlate || "A completar"}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Kilómetros</Text>
              <Text style={styles.value}>{data.km ? data.km.toLocaleString("es-AR") : "—"}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Precio de venta</Text>
              <Text style={styles.value}>{fmtMoney(data.price, data.currency)}</Text>
            </View>
          </View>
          {data.publicationCode && (
            <>
              <Text style={styles.label}>Publicación MatchCars</Text>
              <Text style={styles.value}>#{data.publicationCode}</Text>
            </>
          )}
        </View>

        <View style={styles.divider} />

        <Text style={styles.paragraph}>
          El vendedor entrega el vehículo con la documentación correspondiente al día de la fecha, comprometiéndose ambas
          partes a completar la transferencia de titularidad en el plazo acordado. Este documento no reemplaza la
          transferencia registral ante el organismo correspondiente.
        </Text>

        <View style={styles.signRow}>
          <View style={styles.signBox}>
            <View style={styles.signLine} />
            <Text>Firma del vendedor</Text>
          </View>
          <View style={styles.signBox}>
            <View style={styles.signLine} />
            <Text>Firma del comprador</Text>
          </View>
        </View>

        <Text style={styles.footer}>Generado desde el Portal de Agencias de MatchCars — {data.fecha}</Text>
      </Page>
    </Document>
  );
}

export function ReciboDeSena({ data, monto, montoCurrency }: { data: DocumentData; monto: number; montoCurrency: string }) {
  // La seña puede pagarse en una moneda distinta a la del precio de venta
  // (ej. venta en USD, seña en efectivo en ARS) — el saldo pendiente solo se
  // puede calcular por resta directa si las monedas coinciden; si no, se
  // informan los dos montos por separado sin inventar un tipo de cambio.
  const sameCurrency = montoCurrency === data.currency;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>MatchCars — Operaciones de venta</Text>
          <Text style={styles.title}>Recibo de seña</Text>
        </View>

        <Text style={styles.paragraph}>
          Recibí de {data.buyerLabel} la suma de {fmtMoney(monto, montoCurrency)} en concepto de SEÑA / RESERVA por el
          vehículo {data.brand} {data.model} {data.year ?? ""}
          {data.licensePlate ? `, patente ${data.licensePlate}` : ""}, a cuenta del precio total de venta de{" "}
          {fmtMoney(data.price, data.currency)}
          {sameCurrency
            ? `, quedando el saldo de ${fmtMoney(Math.max(0, data.price - monto), data.currency)} pendiente de pago según lo acordado entre las partes.`
            : ", quedando el saldo pendiente de pago a determinar entre las partes según el tipo de cambio acordado."}
        </Text>

        <View style={styles.section}>
          <Text style={styles.label}>Fecha</Text>
          <Text style={styles.value}>{data.fecha}</Text>
          <Text style={styles.label}>Vendedor</Text>
          <Text style={styles.value}>{data.agencyName}</Text>
        </View>

        <View style={styles.signRow}>
          <View style={styles.signBox}>
            <View style={styles.signLine} />
            <Text>Firma del vendedor</Text>
          </View>
          <View style={styles.signBox}>
            <View style={styles.signLine} />
            <Text>Firma del comprador</Text>
          </View>
        </View>

        <Text style={styles.footer}>Generado desde el Portal de Agencias de MatchCars — {data.fecha}</Text>
      </Page>
    </Document>
  );
}
