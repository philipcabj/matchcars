// portal/src/app/api/admin/users/[uid]/route.ts
// PATCH — edita rol/plan/vencimiento de CUALQUIER usuario, o lo desbloquea.
// Espeja handleSaveUserEdit/handleUnblockUser. Solo admin (requireSuperAdmin).
import { logPlatformActivity } from "@/lib/activity-log";
import { requireSuperAdmin } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";

export const PATCH = withApiErrors(async (request, { params }: { params: Promise<{ uid: string }> }) => {
  const { uid: actorUid } = await requireSuperAdmin(request);
  const { uid } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = {};

  if (body.role !== undefined) {
    if (!["user", "moderator", "admin"].includes(body.role)) {
      return Response.json({ error: "Rol inválido" }, { status: 400 });
    }
    update.role = body.role;
  }

  if (body.plan !== undefined) update.plan = body.plan;

  // Vencimiento opcional del plan — igual que la app, solo se toca si vino
  // explícito en el body (permite cambiar solo rol o solo plan sin pisar el
  // nextBillingDate real de una suscripción paga).
  if (body.planExpiresAt !== undefined) {
    const trimmed = typeof body.planExpiresAt === "string" ? body.planExpiresAt.trim() : "";
    if (trimmed) {
      const date = new Date(`${trimmed}T00:00:00`);
      if (isNaN(date.getTime())) return Response.json({ error: "Fecha de vencimiento inválida (AAAA-MM-DD)" }, { status: 400 });
      update.cancelAtPeriodEnd = true;
      update.nextBillingDate = date;
    } else {
      update.cancelAtPeriodEnd = false;
      update.nextBillingDate = null;
    }
  }

  if (body.isBlocked !== undefined) {
    update.isBlocked = !!body.isBlocked;
    update.blockedAt = body.isBlocked ? new Date() : null;
  }

  if (Object.keys(update).length === 0) return Response.json({ error: "Nada para actualizar" }, { status: 400 });

  await adminDb.doc(`users/${uid}`).update(update);
  await logPlatformActivity({
    actorUid,
    action: "user.updated",
    summary: `Usuario editado (${uid}): ${Object.keys(update).join(", ")}`,
  });
  return Response.json({ ok: true });
});
