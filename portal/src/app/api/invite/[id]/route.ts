// portal/src/app/api/invite/[id]/route.ts
// GET -> pública (sin auth), para la pantalla /invite/[id]. Devuelve lo
// mínimo necesario para mostrar "Te invitaron a sumarte a X como Y" sin
// exponer más datos de la agencia que eso.
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";
import { AGENCY_ROLE_LABELS, AgencyRole } from "@/lib/plans";

export const GET = withApiErrors(async (_request, ctx: RouteContext<"/api/invite/[id]">) => {
  const { id } = await ctx.params;
  const snap = await adminDb.doc(`agencyInvites/${id}`).get();
  if (!snap.exists) return Response.json({ error: "Invitación no encontrada." }, { status: 404 });
  const invite = snap.data()!;

  if (invite.status === "accepted") return Response.json({ error: "Esta invitación ya fue aceptada." }, { status: 400 });
  if (invite.status === "revoked") return Response.json({ error: "Esta invitación fue cancelada." }, { status: 400 });

  const expiresAt: Date | null = invite.expiresAt?.toDate ? invite.expiresAt.toDate() : invite.expiresAt ? new Date(invite.expiresAt) : null;
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    return Response.json({ error: "Esta invitación venció. Pedile a quien te invitó que te mande una nueva." }, { status: 400 });
  }

  return Response.json({
    agencyName: invite.agencyName,
    email: invite.email,
    role: invite.role,
    roleLabel: AGENCY_ROLE_LABELS[invite.role as AgencyRole] ?? invite.role,
  });
});
