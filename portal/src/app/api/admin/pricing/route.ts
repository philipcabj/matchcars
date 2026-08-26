// portal/src/app/api/admin/pricing/route.ts
// GET/PUT config/pricing.usdToArsRate — mismo doc que usa el tasador del
// marketplace (marketplace/src/lib/pricing-admin.ts lee este mismo campo).
import { logPlatformActivity } from "@/lib/activity-log";
import { requireAdminRole } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";

export const GET = withApiErrors(async (request) => {
  await requireAdminRole(request);
  const snap = await adminDb.doc("config/pricing").get();
  const raw = snap.data()?.usdToArsRate;
  const value = typeof raw === "number" ? raw : Number(raw);
  return Response.json({ usdToArsRate: Number.isFinite(value) && value > 0 ? value : null });
});

export const PUT = withApiErrors(async (request) => {
  const { uid: actorUid } = await requireAdminRole(request);
  const body = await request.json();
  const value = Number(body.usdToArsRate);
  if (!Number.isFinite(value) || value <= 0) {
    return Response.json({ error: "La cotización debe ser un número mayor a cero." }, { status: 400 });
  }
  await adminDb.doc("config/pricing").set({ usdToArsRate: value, updatedAt: new Date() }, { merge: true });
  await logPlatformActivity({ actorUid, action: "pricing.updated", summary: `Cotización USD→ARS actualizada a ${value}` });
  return Response.json({ usdToArsRate: value });
});
