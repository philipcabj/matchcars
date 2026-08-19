// portal/src/app/api/agency/sale-operations/[id]/route.ts
// GET   -> detalle de una operación de venta.
// PATCH -> todas las acciones sobre ella (checklist, adjuntos, financiación,
//          parte de pago, agregar al stock, cerrar/cancelar) — un solo route
//          con "action", mismo criterio que leads/[id]/route.ts.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { requireCRMAccess, resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { calculateFrenchInstallment } from "@/lib/sale-operations";
import { AGENCY_ROLE_PERMISSIONS } from "@/lib/plans";
import { FieldValue } from "firebase-admin/firestore";

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

function serialize(
  id: string,
  data: FirebaseFirestore.DocumentData,
  liveVehicle?: { price?: number; currency?: string } | null
) {
  const vehicleSnapshot = data.vehicleSnapshot
    ? { ...data.vehicleSnapshot, ...(liveVehicle ? { price: liveVehicle.price, currency: liveVehicle.currency } : {}) }
    : liveVehicle
      ? { price: liveVehicle.price, currency: liveVehicle.currency }
      : null;

  return {
    id,
    leadId: data.leadId,
    vehicleId: data.vehicleId ?? null,
    sellerId: data.sellerId,
    buyerId: data.buyerId ?? null,
    assignedTo: data.assignedTo ?? null,
    status: data.status ?? "en_curso",
    vehicleSnapshot,
    buyerLabel: data.buyerLabel ?? "Comprador",
    checklist: (data.checklist ?? []).map((c: Record<string, unknown>) => ({
      ...c,
      dueAt: toIso(c.dueAt),
      completedAt: toIso(c.completedAt),
      adjuntos: (c.adjuntos as { url: string; nombre: string; subidoEn?: unknown }[] | undefined ?? []).map((a) => ({
        ...a,
        subidoEn: toIso(a.subidoEn),
      })),
    })),
    financiacion: data.financiacion ?? null,
    parteDePago:
      data.parteDePago ?? { incluye: false, marca: "", modelo: "", version: "", anio: null, km: null, estado: "", fotos: [], tasacion: null, agregadoAlStock: false, vehiculoStockId: null },
    metodoPago: data.metodoPago ?? null,
    financieraNombre: data.financieraNombre ?? null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

async function loadOwned(agencyId: string, id: string) {
  const ref = adminDb.doc(`saleOperations/${id}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.sellerId !== agencyId) return null;
  return { ref, snap };
}

export const GET = withApiErrors(async (request, ctx: RouteContext<"/api/agency/sale-operations/[id]">) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageLeads) {
    return Response.json({ error: "Tu rol no tiene permiso para ver operaciones." }, { status: 403 });
  }
  await requireCRMAccess(agencyId);
  const { id } = await ctx.params;
  const found = await loadOwned(agencyId, id);
  if (!found) return Response.json({ error: "No encontrado" }, { status: 404 });

  // Precio en VIVO del auto (no la foto vieja del momento en que se creó la
  // operación) — para que la agencia siempre tenga presente cuánto está
  // publicado hoy, aunque haya cambiado desde entonces.
  const op = found.snap.data()!;
  let liveVehicle: { price?: number; currency?: string } | null = null;
  if (op.vehicleId) {
    const vehicleSnap = await adminDb.doc(`vehicles/${op.vehicleId}`).get();
    if (vehicleSnap.exists) {
      liveVehicle = { price: vehicleSnap.data()?.price, currency: vehicleSnap.data()?.currency };
    }
  }

  return Response.json(serialize(found.snap.id, op, liveVehicle));
});

export const PATCH = withApiErrors(async (request, ctx: RouteContext<"/api/agency/sale-operations/[id]">) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageLeads) {
    return Response.json({ error: "Tu rol no tiene permiso para gestionar operaciones." }, { status: 403 });
  }
  await requireCRMAccess(agencyId);
  const { id } = await ctx.params;
  const found = await loadOwned(agencyId, id);
  if (!found) return Response.json({ error: "No encontrado" }, { status: 404 });
  const { ref, snap } = found;
  const op = snap.data()!;
  const body = await request.json();
  const action = body.action as string;

  if (action === "update_checklist_item") {
    const key = String(body.key || "");
    const checklist = [...(op.checklist ?? [])];
    const idx = checklist.findIndex((c: { key: string }) => c.key === key);
    if (idx === -1) return Response.json({ error: "Paso no encontrado." }, { status: 400 });
    const current = checklist[idx];
    const nextStatus = body.status === "hecho" ? "hecho" : body.status === "pendiente" ? "pendiente" : current.status;
    checklist[idx] = {
      ...current,
      status: nextStatus,
      responsable: body.responsable !== undefined ? body.responsable || null : current.responsable,
      dueAt: body.dueAt !== undefined ? (body.dueAt ? new Date(body.dueAt) : null) : current.dueAt,
      completedAt: nextStatus === "hecho" ? current.completedAt || new Date() : nextStatus === "pendiente" ? null : current.completedAt,
    };
    await ref.update({ checklist, updatedAt: FieldValue.serverTimestamp() });
    return Response.json({ ok: true });
  }

  if (action === "add_attachment") {
    const key = String(body.key || "");
    const url = String(body.url || "");
    const nombre = String(body.nombre || "Documento");
    if (!url) return Response.json({ error: "Falta el archivo." }, { status: 400 });
    const checklist = [...(op.checklist ?? [])];
    const idx = checklist.findIndex((c: { key: string }) => c.key === key);
    if (idx === -1) return Response.json({ error: "Paso no encontrado." }, { status: 400 });
    checklist[idx] = { ...checklist[idx], adjuntos: [...(checklist[idx].adjuntos ?? []), { url, nombre, subidoEn: new Date() }] };
    await ref.update({ checklist, updatedAt: FieldValue.serverTimestamp() });
    return Response.json({ ok: true });
  }

  if (action === "remove_attachment") {
    const key = String(body.key || "");
    const url = String(body.url || "");
    const checklist = [...(op.checklist ?? [])];
    const idx = checklist.findIndex((c: { key: string }) => c.key === key);
    if (idx === -1) return Response.json({ error: "Paso no encontrado." }, { status: 400 });
    checklist[idx] = { ...checklist[idx], adjuntos: (checklist[idx].adjuntos ?? []).filter((a: { url: string }) => a.url !== url) };
    await ref.update({ checklist, updatedAt: FieldValue.serverTimestamp() });
    return Response.json({ ok: true });
  }

  if (action === "update_financing") {
    const anticipo = Number(body.anticipo) || 0;
    const cuotas = Number(body.cuotas) || 0;
    const tasaAnual = Number(body.tasaAnual) || 0;
    const precio = Number(body.precioTotal) || 0;
    const montoFinanciado = Math.max(0, precio - anticipo);
    const cuotaMensual = calculateFrenchInstallment(montoFinanciado, cuotas, tasaAnual);
    const financiacion = { anticipo, cuotas, tasaAnual, montoFinanciado, cuotaMensual };
    await ref.update({ financiacion, updatedAt: FieldValue.serverTimestamp() });
    return Response.json({ ok: true, financiacion });
  }

  if (action === "clear_financing") {
    await ref.update({ financiacion: null, updatedAt: FieldValue.serverTimestamp() });
    return Response.json({ ok: true });
  }

  if (action === "update_metodo_pago") {
    const metodoPago = ["efectivo", "financiado_propio", "financiado_externo"].includes(body.metodoPago) ? body.metodoPago : null;
    const financieraNombre = typeof body.financieraNombre === "string" ? body.financieraNombre.trim() || null : op.financieraNombre ?? null;
    await ref.update({ metodoPago, financieraNombre, updatedAt: FieldValue.serverTimestamp() });
    return Response.json({ ok: true });
  }

  if (action === "update_trade_in") {
    const parteDePago = {
      ...op.parteDePago,
      incluye: !!body.incluye,
      marca: body.marca ?? op.parteDePago?.marca ?? "",
      modelo: body.modelo ?? op.parteDePago?.modelo ?? "",
      version: body.version ?? op.parteDePago?.version ?? "",
      anio: body.anio !== undefined ? Number(body.anio) || null : op.parteDePago?.anio ?? null,
      km: body.km !== undefined ? Number(body.km) || null : op.parteDePago?.km ?? null,
      estado: body.estado ?? op.parteDePago?.estado ?? "",
    };
    await ref.update({ parteDePago, updatedAt: FieldValue.serverTimestamp() });
    return Response.json({ ok: true });
  }

  if (action === "set_trade_in_appraisal") {
    const tasacion = body.tasacion
      ? { min: Number(body.tasacion.min) || 0, avg: Number(body.tasacion.avg) || 0, max: Number(body.tasacion.max) || 0, fuente: body.tasacion.fuente === "manual" ? "manual" : "matchcars" }
      : null;
    await ref.update({ "parteDePago.tasacion": tasacion, updatedAt: FieldValue.serverTimestamp() });
    return Response.json({ ok: true });
  }

  if (action === "add_trade_in_photo" || action === "remove_trade_in_photo") {
    const url = String(body.url || "");
    if (!url) return Response.json({ error: "Falta la foto." }, { status: 400 });
    const fotos: string[] = op.parteDePago?.fotos ?? [];
    const nextFotos = action === "add_trade_in_photo" ? [...fotos, url] : fotos.filter((f) => f !== url);
    await ref.update({ "parteDePago.fotos": nextFotos, updatedAt: FieldValue.serverTimestamp() });
    return Response.json({ ok: true });
  }

  if (action === "add_trade_in_to_stock") {
    if (op.parteDePago?.agregadoAlStock) return Response.json({ error: "Ya se agregó al stock." }, { status: 400 });
    const tradeIn = op.parteDePago;
    if (!tradeIn?.marca || !tradeIn?.modelo) return Response.json({ error: "Completá marca y modelo del auto recibido." }, { status: 400 });

    const ownerSnap = await adminDb.doc(`users/${agencyId}`).get();
    const ownerData = ownerSnap.data() ?? {};
    const vehicleRef = adminDb.collection("vehicles").doc();
    const suggestedPrice = tradeIn.tasacion?.avg ? Math.round(tradeIn.tasacion.avg) : 0;
    await adminDb.runTransaction(async (t) => {
      t.set(vehicleRef, {
        userId: agencyId,
        userName: ownerData.agencyName || ownerData.displayName || ownerData.email || "Agencia",
        userPlan: ownerData.plan || "free",
        brand: tradeIn.marca,
        model: tradeIn.modelo,
        version: tradeIn.version || null,
        year: tradeIn.anio || null,
        km: tradeIn.km || 0,
        price: suggestedPrice,
        currency: "ARS",
        images: { cover: tradeIn.fotos?.[0] || "", gallery: tradeIn.fotos?.slice(1) ?? [] },
        status: "a_preparar",
        published: false,
        description: `Ingresado como parte de pago — estado: ${tradeIn.estado || "sin especificar"}.`,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        priceHistory: suggestedPrice ? [{ price: suggestedPrice, currency: "ARS", changedAt: new Date() }] : [],
      });
      t.update(ref, {
        "parteDePago.agregadoAlStock": true,
        "parteDePago.vehiculoStockId": vehicleRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return Response.json({ ok: true, vehicleId: vehicleRef.id });
  }

  if (action === "set_status") {
    const status = body.status === "completada" ? "completada" : body.status === "cancelada" ? "cancelada" : "en_curso";
    await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Acción inválida." }, { status: 400 });
});
