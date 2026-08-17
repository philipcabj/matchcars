// portal/src/app/api/agency/commission-rules/route.ts
// GET -> regla de comisión vigente (default 3% sobre precio de venta si la
//        agencia nunca configuró una — DEFAULT_COMMISSION_RULE).
// PUT -> la agencia la configura. Vive en agencies/{agencyId}/settings/commissionRule
//        (doc único) — solo el dueño la toca, mismo criterio que manageBilling.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { resolveMembership } from "@/lib/agency-server";
import { adminDb } from "@/lib/firebase-admin";
import { CommissionRule, DEFAULT_COMMISSION_RULE } from "@/lib/commissions";
import { AGENCY_ROLE_PERMISSIONS, canManageCommissions } from "@/lib/plans";

function ruleDoc(agencyId: string) {
  return adminDb.doc(`agencies/${agencyId}/settings/commissionRule`);
}

export const GET = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const { agencyId } = await resolveMembership(uid);
  const snap = await ruleDoc(agencyId).get();
  const rule: CommissionRule = snap.exists ? (snap.data() as CommissionRule) : DEFAULT_COMMISSION_RULE;
  return Response.json({ rule });
});

export const PUT = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const { agencyId, role } = await resolveMembership(uid);
  if (!AGENCY_ROLE_PERMISSIONS[role].manageBilling) {
    return Response.json({ error: "Tu rol no tiene permiso para configurar comisiones." }, { status: 403 });
  }
  const ownerSnap = await adminDb.doc(`users/${agencyId}`).get();
  if (!canManageCommissions(ownerSnap.data()?.plan || "free")) {
    return Response.json({ error: "Las comisiones están disponibles en los planes Dealer." }, { status: 403 });
  }

  const body = await request.json();
  const tipo = ["porcentaje_venta", "porcentaje_margen", "fijo", "escalonado"].includes(body.tipo) ? body.tipo : "porcentaje_venta";
  const valor = Number(body.valor);
  if (tipo !== "escalonado" && (!Number.isFinite(valor) || valor < 0)) {
    return Response.json({ error: "Ingresá un valor válido." }, { status: 400 });
  }
  const escalones = Array.isArray(body.escalones)
    ? body.escalones
        .map((t: { desde: unknown; hasta: unknown; porcentaje: unknown }) => ({
          desde: Number(t.desde) || 0,
          hasta: t.hasta === null || t.hasta === undefined || t.hasta === "" ? null : Number(t.hasta),
          porcentaje: Number(t.porcentaje) || 0,
        }))
        .sort((a: { desde: number }, b: { desde: number }) => a.desde - b.desde)
    : [];
  if (tipo === "escalonado" && escalones.length === 0) {
    return Response.json({ error: "Agregá al menos un escalón." }, { status: 400 });
  }

  const rule: CommissionRule = { tipo, valor: Number.isFinite(valor) ? valor : 0, escalones };
  await ruleDoc(agencyId).set(rule);
  return Response.json({ ok: true, rule });
});
