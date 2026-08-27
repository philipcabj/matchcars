// portal/src/lib/pdf/sale-document-service.ts
// Arma los datos de un documento de venta (boleto/recibo) a partir de una
// operación, y sube el PDF ya renderizado a Storage — compartido entre la
// generación manual (document/route.tsx) y el envío a firmar
// (sale-operations/[id]/route.ts, action "send_for_signature") para no
// duplicar cómo se arma un DocumentData ni el guardado en Storage.
import "server-only";

import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { DocumentData } from "@/lib/pdf/SaleDocuments";
import { randomUUID } from "node:crypto";

export async function buildSaleDocumentData(
  op: FirebaseFirestore.DocumentData,
  agencyId: string
): Promise<DocumentData> {
  const [ownerSnap, vehicleSnap] = await Promise.all([
    adminDb.doc(`users/${agencyId}`).get(),
    op.vehicleId ? adminDb.doc(`vehicles/${op.vehicleId}`).get() : Promise.resolve(null),
  ]);
  const ownerData = ownerSnap.data() ?? {};
  const vehicle = vehicleSnap?.exists ? vehicleSnap.data()! : null;
  const agencyName = ownerData.agencyName || ownerData.displayName || ownerData.email || "Agencia";

  return {
    agencyName,
    agencyAddress: ownerData.businessAddress || undefined,
    buyerLabel: op.buyerLabel || "Comprador",
    brand: vehicle?.brand ?? op.vehicleSnapshot?.brand ?? "",
    model: vehicle?.model ?? op.vehicleSnapshot?.model ?? "",
    version: vehicle?.version ?? "",
    year: vehicle?.year ?? op.vehicleSnapshot?.year ?? null,
    licensePlate: vehicle?.licensePlate ?? "",
    km: vehicle?.km ?? null,
    price: vehicle?.price ?? 0,
    currency: vehicle?.currency ?? "ARS",
    fecha: new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" }),
    publicationCode: vehicle?.publicationCode ?? null,
  };
}

export async function uploadSaleDocumentPdf(
  agencyId: string,
  opId: string,
  tipo: string,
  buffer: Buffer
): Promise<{ url: string; filePath: string }> {
  const filename = `${tipo}_${Date.now()}.pdf`;
  const filePath = `uploads/${agencyId}/operations/${opId}/${filename}`;
  const token = randomUUID();
  await adminStorage.file(filePath).save(buffer, {
    metadata: { contentType: "application/pdf", metadata: { firebaseStorageDownloadTokens: token } },
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${adminStorage.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;
  return { url, filePath };
}
