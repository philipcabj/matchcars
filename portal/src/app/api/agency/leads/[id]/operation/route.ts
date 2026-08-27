// portal/src/app/api/agency/leads/[id]/operation/route.ts
// POST -> crea la operación de venta de un lead (botón "Iniciar operación"
// en el detalle del lead) — checklist con la plantilla default, sin
// documentos ni parte de pago todavía. Un lead solo puede tener una
// operación a la vez (lead.saleOperationId denormalizado para no tener que
// buscarla por query cada vez que se abre el lead).
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { requireCRMAccess, resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { sendNotificationEmail } from "@/lib/notify-mail";
import { AGENCY_ROLE_PERMISSIONS } from "@/lib/plans";
import { buildDefaultChecklist } from "@/lib/sale-operations";
import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

export const POST = withApiErrors(async (request, ctx: RouteContext<"/api/agency/leads/[id]/operation">) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageLeads) {
    return Response.json({ error: "Tu rol no tiene permiso para gestionar leads." }, { status: 403 });
  }
  await requireCRMAccess(agencyId);

  const { id } = await ctx.params;
  const leadRef = adminDb.doc(`leads/${id}`);
  const leadSnap = await leadRef.get();
  if (!leadSnap.exists) return Response.json({ error: "No encontrado" }, { status: 404 });
  const lead = leadSnap.data()!;
  if (lead.sellerId !== agencyId) return Response.json({ error: "No autorizado" }, { status: 403 });
  if (lead.status !== "negotiation" && lead.status !== "won") {
    return Response.json({ error: "El lead tiene que estar en negociación o vendido para iniciar una operación." }, { status: 400 });
  }
  if (lead.saleOperationId) return Response.json({ id: lead.saleOperationId });

  const buyer = lead.manualContact?.name || [lead.buyerSnapshot?.firstName, lead.buyerSnapshot?.lastName].filter(Boolean).join(" ") || "Comprador";

  // Email de contacto del comprador — de la cuenta si tiene, o del contacto
  // manual si no. Sin esto no se le puede mandar el link del portal ni pedir
  // el código de firma; queda null y la agencia lo agrega/reenvía después.
  let buyerContactEmail: string | null = lead.manualContact?.email || null;
  if (!buyerContactEmail && lead.buyerId) {
    const buyerSnap = await adminDb.doc(`users/${lead.buyerId}`).get();
    buyerContactEmail = buyerSnap.data()?.email || null;
  }

  const buyerAccessToken = randomUUID();
  const opRef = adminDb.collection("saleOperations").doc();
  await adminDb.runTransaction(async (t) => {
    t.set(opRef, {
      leadId: id,
      vehicleId: lead.vehicleId || null,
      sellerId: agencyId,
      buyerId: lead.buyerId || null,
      assignedTo: lead.assignedTo || null,
      status: "en_curso",
      vehicleSnapshot: lead.vehicleSnapshot ?? null,
      buyerLabel: buyer,
      checklist: buildDefaultChecklist(),
      financiacion: null,
      parteDePago: {
        incluye: false,
        marca: "",
        modelo: "",
        version: "",
        anio: null,
        km: null,
        estado: "",
        fotos: [],
        tasacion: null,
        precioTomaFinal: null,
        precioTomaConfirmado: false,
        tasadoPor: null,
        agregadoAlStock: false,
        vehiculoStockId: null,
      },
      metodoPago: null,
      financieraNombre: null,
      buyerAccessToken,
      buyerContactEmail,
      signatures: {},
      documentRequests: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.update(leadRef, { saleOperationId: opRef.id });
  });

  if (buyerContactEmail) {
    const ownerSnap = await adminDb.doc(`users/${agencyId}`).get();
    const agencyName = ownerSnap.data()?.agencyName || ownerSnap.data()?.displayName || "la agencia";
    const carModel = [lead.vehicleSnapshot?.brand, lead.vehicleSnapshot?.model].filter(Boolean).join(" ");
    sendNotificationEmail("buyer_portal_welcome", {
      recipientEmail: buyerContactEmail,
      senderName: agencyName,
      agencyName,
      carModel,
      ctaLink: `https://portal.matchcars.app/mi-operacion/${buyerAccessToken}`,
    }).catch(() => {});
  }

  return Response.json({ id: opRef.id }, { status: 201 });
});
