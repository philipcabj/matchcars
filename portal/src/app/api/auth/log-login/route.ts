// portal/src/app/api/auth/log-login/route.ts
// POST { method: "email" | "google" | "apple" } -> registra un login en
// loginEvents. Se llama desde AuthContext justo después de un login exitoso
// (fire-and-forget desde el cliente) — cualquier usuario autenticado puede
// registrar su propio login, no hace falta rol de plataforma.
import { requireUid } from "@/lib/api-auth";
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const VALID_METHODS = ["email", "google", "apple"];

export const POST = withApiErrors(async (request) => {
  const uid = await requireUid(request);
  const body = await request.json().catch(() => ({}));
  const method = VALID_METHODS.includes(body.method) ? body.method : "unknown";

  // Best-effort: si esto falla no debe afectar el login real del usuario, ya
  // pasó igual del lado de Firebase Auth antes de llegar acá.
  try {
    const userSnap = await adminDb.doc(`users/${uid}`).get();
    const data = userSnap.data();
    const name = `${data?.firstName ?? ""} ${data?.lastName ?? ""}`.trim() || data?.displayName || data?.agencyName || null;
    const email = data?.email ?? null;

    const forwardedFor = request.headers.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : null;

    await adminDb.collection("loginEvents").add({
      uid,
      email,
      name,
      method,
      ip,
      userAgent: request.headers.get("user-agent") ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error("[log-login] no se pudo registrar", e);
  }

  return Response.json({ ok: true });
});
