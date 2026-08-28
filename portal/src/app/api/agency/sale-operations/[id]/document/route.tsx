// portal/src/app/api/agency/sale-operations/[id]/document/route.tsx
// POST -> genera un PDF real (boleto de compraventa, recibo de seña, o el
// registro completo de la operación), lo sube a Storage y devuelve la URL.
// Boleto/recibo además se adjuntan automáticamente al paso correspondiente
// del checklist (mismo mecanismo que un adjunto subido a mano) — el
// registro no, porque no pertenece a ningún paso puntual, es un snapshot de
// toda la operación. .tsx porque arma los documentos con JSX de
// @react-pdf/renderer, no HTML.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { requireCRMAccess, resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { OperationRecord, OperationRecordData } from "@/lib/pdf/OperationRecord";
import { ReciboDeSena, BoletoCompraventa } from "@/lib/pdf/SaleDocuments";
import { buildSaleDocumentData, uploadSaleDocumentPdf } from "@/lib/pdf/sale-document-service";
import { AGENCY_ROLE_PERMISSIONS } from "@/lib/plans";
import { hasSection } from "@/lib/sections";
import { renderToBuffer } from "@react-pdf/renderer";
import { FieldValue } from "firebase-admin/firestore";

const CHECKLIST_KEY_BY_TIPO: Record<string, string> = {
  boleto_compraventa: "boleto_compraventa",
  recibo_sena: "sena",
};

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  if (ts instanceof Date) return ts.toISOString();
  return null;
}

export const POST = withApiErrors(async (request, ctx: RouteContext<"/api/agency/sale-operations/[id]/document">) => {
  const uid = await requireUid(request);
  const membership = await resolveMembership(uid);
  const { agencyId, role } = membership;
  if (!AGENCY_ROLE_PERMISSIONS[role].manageLeads || !hasSection(membership, "operaciones")) {
    return Response.json({ error: "Tu rol no tiene permiso para gestionar operaciones." }, { status: 403 });
  }
  await requireCRMAccess(agencyId);

  const { id } = await ctx.params;
  const opRef = adminDb.doc(`saleOperations/${id}`);
  const opSnap = await opRef.get();
  if (!opSnap.exists || opSnap.data()?.sellerId !== agencyId) return Response.json({ error: "No encontrado" }, { status: 404 });
  const op = opSnap.data()!;

  const body = await request.json();
  const tipo = body.tipo === "recibo_sena" ? "recibo_sena" : body.tipo === "registro" ? "registro" : "boleto_compraventa";
  const monto = Number(body.monto) || 0;
  const montoCurrency = body.montoCurrency === "USD" ? "USD" : "ARS";
  if (tipo === "recibo_sena" && monto <= 0) {
    return Response.json({ error: "Ingresá el monto de la seña." }, { status: 400 });
  }

  const [ownerSnap, vehicleSnap] = await Promise.all([
    adminDb.doc(`users/${agencyId}`).get(),
    op.vehicleId ? adminDb.doc(`vehicles/${op.vehicleId}`).get() : Promise.resolve(null),
  ]);
  const ownerData = ownerSnap.data() ?? {};
  const vehicle = vehicleSnap?.exists ? vehicleSnap.data()! : null;
  const agencyName = ownerData.agencyName || ownerData.displayName || ownerData.email || "Agencia";

  let buffer: Buffer;
  let nombre: string;

  if (tipo === "registro") {
    const [membersSnap, saleSnap] = await Promise.all([
      adminDb.collection(`agencies/${agencyId}/members`).get(),
      op.vehicleId ? adminDb.doc(`sales/${op.vehicleId}`).get() : Promise.resolve(null),
    ]);
    const nameByUid = new Map<string, string>([[agencyId, agencyName]]);
    membersSnap.docs.forEach((d) => nameByUid.set(d.id, d.data().name || d.data().email || d.id));
    const resolveName = (uidVal: string | null | undefined) => (uidVal ? nameByUid.get(uidVal) ?? uidVal : null);

    const sale = saleSnap?.exists ? saleSnap.data()! : null;
    const parteDePago = op.parteDePago ?? {};

    const data: OperationRecordData = {
      id,
      status: op.status ?? "en_curso",
      createdAt: toIso(op.createdAt),
      updatedAt: toIso(op.updatedAt),
      agencyName,
      assignedToName: resolveName(op.assignedTo),
      buyerLabel: op.buyerLabel || "Comprador",
      vehicle: {
        brand: vehicle?.brand ?? op.vehicleSnapshot?.brand ?? "",
        model: vehicle?.model ?? op.vehicleSnapshot?.model ?? "",
        version: vehicle?.version ?? "",
        year: vehicle?.year ?? op.vehicleSnapshot?.year ?? null,
        licensePlate: vehicle?.licensePlate ?? "",
        km: vehicle?.km ?? null,
        price: vehicle?.price ?? op.vehicleSnapshot?.price ?? 0,
        currency: vehicle?.currency ?? op.vehicleSnapshot?.currency ?? "ARS",
        publicationCode: vehicle?.publicationCode ?? null,
      },
      metodoPago: op.metodoPago ?? null,
      metodoPagoConfirmado: !!op.metodoPagoConfirmado,
      financieraNombre: op.financieraNombre ?? null,
      financiacion: op.financiacion ?? null,
      parteDePago: {
        incluye: !!parteDePago.incluye,
        marca: parteDePago.marca ?? "",
        modelo: parteDePago.modelo ?? "",
        version: parteDePago.version ?? "",
        anio: parteDePago.anio ?? null,
        km: parteDePago.km ?? null,
        estado: parteDePago.estado ?? "",
        tasacion: parteDePago.tasacion ?? null,
        precioTomaFinal: parteDePago.precioTomaFinal ?? null,
        precioTomaConfirmado: !!parteDePago.precioTomaConfirmado,
        tasadoPorName: resolveName(parteDePago.tasadoPor),
        agregadoAlStock: !!parteDePago.agregadoAlStock,
      },
      checklist: (op.checklist ?? []).map((c: Record<string, unknown>) => ({
        label: c.label as string,
        status: c.status as string,
        responsableName: resolveName(c.responsable as string | null),
        completedAt: toIso(c.completedAt),
        adjuntosCount: ((c.adjuntos as unknown[] | undefined) ?? []).length,
      })),
      documentosGenerados: ((op.documentosGenerados as { tipo: string; generadoEn: unknown }[] | undefined) ?? [])
        .filter((d) => d.tipo !== "registro")
        .map((d) => ({ tipo: d.tipo, generadoEn: toIso(d.generadoEn) })),
      entrega: op.buyerId
        ? {
            vehicleStatus: vehicle?.status ?? null,
            buyerId: op.buyerId,
            confirmedByBuyer: sale?.confirmedByBuyer ?? null,
            confirmedAt: toIso(sale?.confirmedAt),
            confirmedAutomatically: !!sale?.confirmedAutomatically,
          }
        : null,
      generadoEn: new Date().toISOString(),
    };

    buffer = await renderToBuffer(<OperationRecord data={data} />);
    nombre = `Registro de operación — ${data.vehicle.brand} ${data.vehicle.model}.pdf`;
  } else {
    const data = await buildSaleDocumentData(op, agencyId);
    buffer = await renderToBuffer(
      tipo === "recibo_sena" ? <ReciboDeSena data={data} monto={monto} montoCurrency={montoCurrency} /> : <BoletoCompraventa data={data} />
    );
    nombre = tipo === "recibo_sena" ? `Recibo de seña (${montoCurrency} ${monto.toLocaleString("es-AR")}).pdf` : "Boleto de compraventa.pdf";
  }

  const { url } = await uploadSaleDocumentPdf(agencyId, id, tipo, buffer);

  const checklistKey = CHECKLIST_KEY_BY_TIPO[tipo];
  const checklist = [...(op.checklist ?? [])];
  const idx = checklistKey ? checklist.findIndex((c: { key: string }) => c.key === checklistKey) : -1;
  if (idx !== -1) {
    checklist[idx] = { ...checklist[idx], adjuntos: [...(checklist[idx].adjuntos ?? []), { url, nombre, subidoEn: new Date() }] };
  }

  await opRef.update({
    ...(idx !== -1 ? { checklist } : {}),
    documentosGenerados: FieldValue.arrayUnion({ tipo, url, generadoEn: new Date() }),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return Response.json({ url, nombre });
});
