// portal/src/app/api/public/operations/[token]/route.ts
// GET  -> estado público de una operación de venta (resumen, checklist,
//         firmas, documentos pedidos) para el portal del comprador — sin
//         auth, el comprador puede no tener cuenta en MatchCars. Nunca
//         devuelve nada interno (uids, hash de OTP, ip/user-agent).
// POST -> { action: "request_otp", key } | { action: "verify", key, code } —
//         el flujo de firma electrónica de Seña/Boleto. Ver
//         portal/src/lib/otp.ts y sale-operations/[id]/route.ts
//         (action "send_for_signature", que crea la SignatureRequest que
//         esto completa).
import { withApiErrors } from "@/lib/api-handler";
import { adminDb } from "@/lib/firebase-admin";
import { sendNotificationEmail } from "@/lib/notify-mail";
import { generateOtp, hashOtp, OTP_MAX_ATTEMPTS, OTP_TTL_MINUTES } from "@/lib/otp";
import { uploadSaleDocumentPdf } from "@/lib/pdf/sale-document-service";
import { renderSaleDocumentPdf, SaleDocumentTipo } from "@/lib/pdf/render-sale-document";
import { loadOperationByToken } from "@/lib/public-operation";
import { SignableChecklistKey, SignatureRequest } from "@/lib/sale-operations";
import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

const SIGNABLE_KEYS: SignableChecklistKey[] = ["sena", "boleto_compraventa"];
const OTP_WINDOW_MINUTES = 10;
const OTP_MAX_SENDS_PER_WINDOW = 3;

function toIso(ts: unknown): string | null {
  if (ts && typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate().toISOString();
  return null;
}

function getClientIp(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export const GET = withApiErrors(async (request, ctx: RouteContext<"/api/public/operations/[token]">) => {
  const { token } = await ctx.params;
  const found = await loadOperationByToken(token);
  if (!found) return Response.json({ error: "Link inválido o vencido." }, { status: 404 });
  const op = found.snap.data();

  const [vehicleSnap, ownerSnap] = await Promise.all([
    op.vehicleId ? adminDb.doc(`vehicles/${op.vehicleId}`).get() : Promise.resolve(null),
    adminDb.doc(`users/${op.sellerId}`).get(),
  ]);
  const vehicle = vehicleSnap?.exists ? vehicleSnap.data()! : null;
  const ownerData = ownerSnap.data() ?? {};

  const signatures: Record<string, unknown> = {};
  for (const [key, sig] of Object.entries((op.signatures ?? {}) as Record<string, SignatureRequest>)) {
    signatures[key] = {
      status: sig.status,
      documentUrl: sig.documentUrl,
      finalDocumentUrl: sig.finalDocumentUrl,
      buyerSignedAt: sig.buyer?.signedAt ?? null,
      sellerSignedAt: sig.seller?.signedAt ?? null,
    };
  }

  return Response.json({
    status: op.status ?? "en_curso",
    agencyName: ownerData.agencyName || ownerData.displayName || "la agencia",
    buyerLabel: op.buyerLabel || "Comprador",
    vehicle: {
      brand: vehicle?.brand ?? op.vehicleSnapshot?.brand ?? "",
      model: vehicle?.model ?? op.vehicleSnapshot?.model ?? "",
      year: vehicle?.year ?? op.vehicleSnapshot?.year ?? null,
      coverUrl: vehicle?.images?.cover ?? op.vehicleSnapshot?.coverUrl ?? null,
    },
    checklist: ((op.checklist ?? []) as { key: string; label: string; status: string; dueAt: unknown }[]).map((c) => ({
      key: c.key,
      label: c.label,
      status: c.status,
      dueAt: toIso(c.dueAt),
    })),
    signatures,
    documentRequests: ((op.documentRequests ?? []) as { id: string; label: string; uploadedUrl: string | null; uploadedAt: string | null }[]).map(
      (d) => ({ id: d.id, label: d.label, uploadedUrl: d.uploadedUrl, uploadedAt: d.uploadedAt })
    ),
  });
});

export const POST = withApiErrors(async (request, ctx: RouteContext<"/api/public/operations/[token]">) => {
  const { token } = await ctx.params;
  const found = await loadOperationByToken(token);
  if (!found) return Response.json({ error: "Link inválido o vencido." }, { status: 404 });
  const { ref, snap } = found;
  const op = snap.data();

  const body = await request.json();
  const key = SIGNABLE_KEYS.includes(body.key) ? (body.key as SignableChecklistKey) : null;
  if (!key) return Response.json({ error: "Documento inválido." }, { status: 400 });
  const sigReq = (op.signatures ?? {})[key] as SignatureRequest | undefined;
  if (!sigReq || sigReq.status !== "pending_buyer") {
    return Response.json({ error: "No hay nada pendiente de firma para este documento." }, { status: 400 });
  }

  if (body.action === "request_otp") {
    const otpState = op.otp?.[key] as { windowStartedAt?: string; sentCount?: number } | undefined;
    const now = new Date();
    const windowStarted = otpState?.windowStartedAt ? new Date(otpState.windowStartedAt) : null;
    const withinWindow = windowStarted && now.getTime() - windowStarted.getTime() < OTP_WINDOW_MINUTES * 60 * 1000;
    if (withinWindow && (otpState?.sentCount ?? 0) >= OTP_MAX_SENDS_PER_WINDOW) {
      return Response.json({ error: "Ya pediste varios códigos — esperá unos minutos y volvé a intentar." }, { status: 429 });
    }

    const code = generateOtp();
    const salt = randomUUID();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);
    await ref.update({
      [`otp.${key}`]: {
        hash: hashOtp(code, salt),
        salt,
        expiresAt: expiresAt.toISOString(),
        attempts: 0,
        sentCount: withinWindow ? (otpState?.sentCount ?? 0) + 1 : 1,
        windowStartedAt: withinWindow ? (otpState?.windowStartedAt ?? now.toISOString()) : now.toISOString(),
      },
    });

    if (sigReq.buyer.contactEmail) {
      sendNotificationEmail("signature_otp", {
        recipientEmail: sigReq.buyer.contactEmail,
        senderName: "MatchCars",
        otpCode: code,
        ctaLink: `https://portal.matchcars.app/mi-operacion/${token}`,
      }).catch(() => {});
    }

    return Response.json({ ok: true });
  }

  if (body.action === "verify") {
    const otpState = op.otp?.[key] as { hash?: string; salt?: string; expiresAt?: string; attempts?: number } | undefined;
    if (!otpState?.hash) return Response.json({ error: "Pedí un código primero." }, { status: 400 });
    if (new Date(otpState.expiresAt || 0) < new Date()) {
      return Response.json({ error: "El código venció — pedí uno nuevo." }, { status: 400 });
    }
    if ((otpState.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
      return Response.json({ error: "Demasiados intentos — pedí un código nuevo." }, { status: 400 });
    }

    const code = String(body.code || "").trim();
    if (hashOtp(code, otpState.salt || "") !== otpState.hash) {
      await ref.update({ [`otp.${key}.attempts`]: FieldValue.increment(1) });
      return Response.json({ error: "Código incorrecto." }, { status: 400 });
    }

    const now = new Date();
    const data = sigReq.documentData;
    const tipo: SaleDocumentTipo = key === "sena" ? "recibo_sena" : "boleto_compraventa";
    const buffer = await renderSaleDocumentPdf(tipo, data, {
      monto: sigReq.monto,
      montoCurrency: sigReq.montoCurrency,
      signatures: {
        sellerName: sigReq.seller.name || data.agencyName,
        sellerSignedAt: sigReq.seller.signedAt
          ? new Date(sigReq.seller.signedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
          : "",
        buyerName: op.buyerLabel || "Comprador",
        buyerSignedAt: now.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }),
        buyerContactEmail: sigReq.buyer.contactEmail || "",
      },
    });
    const { url: finalDocumentUrl } = await uploadSaleDocumentPdf(op.sellerId, snap.id, `${tipo}_firmado`, buffer);

    const updatedSignature: SignatureRequest = {
      ...sigReq,
      status: "signed",
      finalDocumentUrl,
      buyer: {
        ...sigReq.buyer,
        name: op.buyerLabel || "Comprador",
        signedAt: now.toISOString(),
        ip: getClientIp(request),
        userAgent: request.headers.get("user-agent") || null,
      },
    };

    // Mismo efecto que update_checklist_item con status:"hecho" — el paso
    // firmado queda marcado hecho, con el PDF final como adjunto, sin que la
    // agencia tenga que hacerlo a mano.
    const checklist = [...(op.checklist ?? [])];
    const idx = checklist.findIndex((c: { key: string }) => c.key === key);
    if (idx !== -1) {
      checklist[idx] = {
        ...checklist[idx],
        status: "hecho",
        completedAt: checklist[idx].completedAt || now,
        adjuntos: [...(checklist[idx].adjuntos ?? []), { url: finalDocumentUrl, nombre: `${tipo}_firmado.pdf`, subidoEn: now }],
      };
    }

    await ref.update({
      [`signatures.${key}`]: updatedSignature,
      [`otp.${key}`]: FieldValue.delete(),
      ...(idx !== -1 ? { checklist } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const carLabel = `${op.vehicleSnapshot?.brand ?? ""} ${op.vehicleSnapshot?.model ?? ""}`.trim() || "el auto";
    if (sigReq.buyer.contactEmail) {
      sendNotificationEmail("signature_completed", {
        recipientEmail: sigReq.buyer.contactEmail,
        senderName: data.agencyName,
        carModel: carLabel,
        ctaLink: finalDocumentUrl,
      }).catch(() => {});
    }

    return Response.json({ ok: true, finalDocumentUrl });
  }

  return Response.json({ error: "Acción inválida." }, { status: 400 });
});
