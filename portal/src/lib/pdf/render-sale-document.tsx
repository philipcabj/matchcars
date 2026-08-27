// portal/src/lib/pdf/render-sale-document.tsx
// Renderiza boleto/recibo a PDF, con o sin bloque de firma electrónica —
// aparte de sale-document-service.ts (que es .ts, sin JSX) para que las
// rutas que lo importan (ej. sale-operations/[id]/route.ts) no necesiten
// ser .tsx solo por esto.
import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import { BoletoCompraventa, DocumentData, ReciboDeSena, SignatureVerification } from "@/lib/pdf/SaleDocuments";

export type SaleDocumentTipo = "boleto_compraventa" | "recibo_sena";

export async function renderSaleDocumentPdf(
  tipo: SaleDocumentTipo,
  data: DocumentData,
  opts: { monto?: number; montoCurrency?: string; signatures?: SignatureVerification } = {}
): Promise<Buffer> {
  return renderToBuffer(
    tipo === "recibo_sena" ? (
      <ReciboDeSena data={data} monto={opts.monto ?? 0} montoCurrency={opts.montoCurrency ?? "ARS"} signatures={opts.signatures} />
    ) : (
      <BoletoCompraventa data={data} signatures={opts.signatures} />
    )
  );
}
