// portal/src/app/api/public/operations/[token]/documents/[requestId]/route.ts
// POST -> el comprador sube un documento que la agencia le pidió (ej. "DNI
// frente y dorso"). Sin auth (puede no tener cuenta), por eso la subida va
// server-side acá en vez de directo a Storage desde el cliente — así no
// hace falta abrir storage.rules a escritura anónima, el Admin SDK hace la
// subida después de validar tipo/tamaño acá mismo.
import { withApiErrors } from "@/lib/api-handler";
import { adminStorage } from "@/lib/firebase-admin";
import { loadOperationByToken } from "@/lib/public-operation";
import { DocumentRequest } from "@/lib/sale-operations";
import { randomUUID } from "node:crypto";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export const POST = withApiErrors(async (request, ctx: RouteContext<"/api/public/operations/[token]/documents/[requestId]">) => {
  const { token, requestId } = await ctx.params;
  const found = await loadOperationByToken(token);
  if (!found) return Response.json({ error: "Link inválido o vencido." }, { status: 404 });
  const { ref, snap } = found;
  const op = snap.data();

  const documentRequests = (op.documentRequests ?? []) as DocumentRequest[];
  const idx = documentRequests.findIndex((d) => d.id === requestId);
  if (idx === -1) return Response.json({ error: "Pedido de documento no encontrado." }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Falta el archivo." }, { status: 400 });
  if (file.size > MAX_SIZE_BYTES) return Response.json({ error: "El archivo no puede pesar más de 10MB." }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return Response.json({ error: "Solo se aceptan imágenes (JPG/PNG/WEBP) o PDF." }, { status: 400 });
  }

  const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
  const filePath = `uploads/${op.sellerId}/operations/${snap.id}/documents/${requestId}_${Date.now()}.${ext}`;
  const uploadToken = randomUUID();
  const buffer = Buffer.from(await file.arrayBuffer());
  await adminStorage.file(filePath).save(buffer, {
    metadata: { contentType: file.type, metadata: { firebaseStorageDownloadTokens: uploadToken } },
  });
  const uploadedUrl = `https://firebasestorage.googleapis.com/v0/b/${adminStorage.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${uploadToken}`;

  const nextRequests = [...documentRequests];
  nextRequests[idx] = { ...nextRequests[idx], uploadedUrl, uploadedAt: new Date().toISOString() };
  await ref.update({ documentRequests: nextRequests, updatedAt: new Date() });

  return Response.json({ ok: true, uploadedUrl });
});
