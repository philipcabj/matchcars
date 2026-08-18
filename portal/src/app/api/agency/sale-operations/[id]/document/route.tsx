// portal/src/app/api/agency/sale-operations/[id]/document/route.tsx
// POST -> genera el PDF real (boleto de compraventa o recibo de seña),
// autocompletado con datos de la agencia/comprador/vehículo, lo sube a
// Storage y lo adjunta automáticamente al paso correspondiente del
// checklist (mismo mecanismo que un adjunto subido a mano). .tsx porque
// arma el documento con JSX de @react-pdf/renderer, no HTML.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { requireCRMAccess, resolveMembership } from "@/lib/agency-server";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { BoletoCompraventa, DocumentData, ReciboDeSena } from "@/lib/pdf/SaleDocuments";
import { AGENCY_ROLE_PERMISSIONS } from "@/lib/plans";
import { renderToBuffer } from "@react-pdf/renderer";
import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

const CHECKLIST_KEY_BY_TIPO: Record<string, string> = {
  boleto_compraventa: "boleto_compraventa",
  recibo_sena: "sena",
};

export const POST = withApiErrors(async (request, ctx: RouteContext<"/api/agency/sale-operations/[id]/document">) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageLeads) {
    return Response.json({ error: "Tu rol no tiene permiso para gestionar operaciones." }, { status: 403 });
  }
  await requireCRMAccess(agencyId);

  const { id } = await ctx.params;
  const opRef = adminDb.doc(`saleOperations/${id}`);
  const opSnap = await opRef.get();
  if (!opSnap.exists || opSnap.data()?.sellerId !== agencyId) return Response.json({ error: "No encontrado" }, { status: 404 });
  const op = opSnap.data()!;

  const body = await request.json();
  const tipo = body.tipo === "recibo_sena" ? "recibo_sena" : "boleto_compraventa";
  const monto = Number(body.monto) || 0;
  if (tipo === "recibo_sena" && monto <= 0) {
    return Response.json({ error: "Ingresá el monto de la seña." }, { status: 400 });
  }

  const [ownerSnap, vehicleSnap] = await Promise.all([
    adminDb.doc(`users/${agencyId}`).get(),
    op.vehicleId ? adminDb.doc(`vehicles/${op.vehicleId}`).get() : Promise.resolve(null),
  ]);
  const ownerData = ownerSnap.data() ?? {};
  const vehicle = vehicleSnap?.exists ? vehicleSnap.data()! : null;

  const data: DocumentData = {
    agencyName: ownerData.agencyName || ownerData.displayName || ownerData.email || "Agencia",
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

  const buffer = await renderToBuffer(tipo === "recibo_sena" ? <ReciboDeSena data={data} monto={monto} /> : <BoletoCompraventa data={data} />);

  const filename = `${tipo}_${Date.now()}.pdf`;
  const filePath = `uploads/${agencyId}/operations/${id}/${filename}`;
  const token = randomUUID();
  await adminStorage.file(filePath).save(buffer, {
    metadata: { contentType: "application/pdf", metadata: { firebaseStorageDownloadTokens: token } },
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${adminStorage.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;
  const nombre = tipo === "recibo_sena" ? `Recibo de seña (${data.currency} ${monto.toLocaleString("es-AR")}).pdf` : "Boleto de compraventa.pdf";

  const checklistKey = CHECKLIST_KEY_BY_TIPO[tipo];
  const checklist = [...(op.checklist ?? [])];
  const idx = checklist.findIndex((c: { key: string }) => c.key === checklistKey);
  if (idx !== -1) {
    checklist[idx] = { ...checklist[idx], adjuntos: [...(checklist[idx].adjuntos ?? []), { url, nombre, subidoEn: new Date() }] };
  }

  await opRef.update({
    checklist,
    documentosGenerados: FieldValue.arrayUnion({ tipo, url, generadoEn: new Date() }),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return Response.json({ url, nombre });
});
