// marketplace/src/lib/leads-server.ts
// Crea un lead a partir del formulario "Consultar" de la web pública y avisa al
// vendedor. El lead usa el MISMO shape que los leads manuales del portal
// (portal/src/app/api/agency/leads/route.ts) para que fluya sin cambios:
//   - sellerId == uid del vendedor  -> aparece en /dashboard/leads y en la
//     campanita "Novedades" (status "new") sin tocar nada más del portal.
//   - manualContact -> nombre/telefono/email/mensaje.
//   - source "web" + webLead{} -> contexto extra (origen, ipHash para throttle).
// Para un vendedor particular (plan free) la pantalla de Leads de la app está
// gateada a planes pagos, así que a ese lo avisamos por email + push y responde
// directo; el lead igual queda registrado.
import "server-only";

import { adminDb } from "@/lib/firebase-admin";
import { sendWebLeadEmail } from "@/lib/mail-server";
import { FieldValue } from "firebase-admin/firestore";
import crypto from "node:crypto";

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || "https://portal.matchcars.app";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://matchcars.app";
const IP_SALT = process.env.LEAD_IP_SALT || "matchcars-web-lead";

export function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(`${ip}:${IP_SALT}`).digest("hex").slice(0, 16);
}

export interface WebLeadInput {
  name: string;
  phone?: string;
  email?: string;
  message: string;
  vehicleId?: string;
  agencyId?: string;
  ipHash: string;
  userAgent?: string;
}

type Result =
  | { ok: true; leadId: string }
  | { ok: false; status: number; error: string };

// Máx 3 consultas por IP por hora (chequeando leads recientes con el mismo
// ipHash — equality sobre campo anidado, sin índice compuesto nuevo).
async function isThrottled(ipHash: string): Promise<boolean> {
  const cutoff = Date.now() - 60 * 60 * 1000;
  const snap = await adminDb.collection("leads").where("webLead.ipHash", "==", ipHash).limit(10).get();
  const recent = snap.docs.filter((d) => {
    const ts = d.data().createdAt as { toMillis?: () => number } | undefined;
    return ts?.toMillis ? ts.toMillis() >= cutoff : false;
  });
  return recent.length >= 3;
}

export async function createWebLead(input: WebLeadInput): Promise<Result> {
  if (await isThrottled(input.ipHash)) {
    return { ok: false, status: 429, error: "Enviaste varias consultas seguidas. Probá de nuevo en un rato." };
  }

  // Resolver vendedor + snapshot del auto (o consulta general a una agencia).
  let sellerId: string | undefined;
  let vehicleSnapshot: Record<string, unknown> | null = null;
  let carLabel = "";

  if (input.vehicleId) {
    const vSnap = await adminDb.doc(`vehicles/${input.vehicleId}`).get();
    const v = vSnap.data();
    if (!vSnap.exists || !v || !v.published) {
      return { ok: false, status: 404, error: "Esta publicación ya no está disponible." };
    }
    sellerId = v.userId as string | undefined;
    vehicleSnapshot = {
      brand: v.brand ?? null,
      model: v.model ?? null,
      year: v.year ?? null,
      price: v.price ?? null,
      currency: v.currency ?? null,
      coverUrl: v.images?.cover ?? v.coverImage ?? v.cover ?? null,
    };
    carLabel = `${v.brand ?? ""} ${v.model ?? ""}`.trim();
  } else if (input.agencyId) {
    sellerId = input.agencyId;
  }

  if (!sellerId) {
    return { ok: false, status: 400, error: "No pudimos identificar al vendedor." };
  }

  const sellerSnap = await adminDb.doc(`users/${sellerId}`).get();
  if (!sellerSnap.exists) {
    return { ok: false, status: 404, error: "No encontramos a este vendedor." };
  }
  const seller = sellerSnap.data() ?? {};
  const sellerPlan: string = seller.plan || "free";
  const isPaid = sellerPlan !== "free" && sellerPlan !== "pro_internal";

  // Consulta "general" a una agencia: solo tiene sentido para una ficha de
  // agencia real (plan pago). Sin esto, cualquiera podría crear leads para
  // un uid arbitrario pasándolo como agencyId.
  if (input.agencyId && !input.vehicleId && !isPaid) {
    return { ok: false, status: 400, error: "Esta consulta no es válida." };
  }

  const leadRef = await adminDb.collection("leads").add({
    sellerId,
    buyerId: "",
    vehicleId: input.vehicleId || null,
    conversationId: "",
    status: "new",
    source: "web",
    assignedTo: null,
    manualContact: {
      name: input.name,
      phone: input.phone || null,
      email: input.email || null,
      instagramHandle: null,
      notes: input.message,
      contactSource: "other",
    },
    vehicleSnapshot,
    webLead: {
      message: input.message,
      origin: input.vehicleId ? "car_detail" : "agency_page",
      ipHash: input.ipHash,
      userAgent: input.userAgent || null,
    },
    unreadCount: 1,
    messageCount: 0,
    lastMessage: input.message.slice(0, 140),
    createdAt: FieldValue.serverTimestamp(),
    lastMessageAt: FieldValue.serverTimestamp(),
  });

  // Aviso al vendedor — no bloquea la respuesta al usuario.
  notifySeller({
    leadId: leadRef.id,
    sellerId,
    seller,
    isPaid,
    vehicleId: input.vehicleId,
    carLabel,
    name: input.name,
    phone: input.phone,
    email: input.email,
    message: input.message,
  }).catch((e) => console.error("[web-lead] notify error:", e));

  return { ok: true, leadId: leadRef.id };
}

async function notifySeller(args: {
  leadId: string;
  sellerId: string;
  seller: FirebaseFirestore.DocumentData;
  isPaid: boolean;
  vehicleId?: string;
  carLabel: string;
  name: string;
  phone?: string;
  email?: string;
  message: string;
}) {
  const sellerEmail: string = args.seller.email || "";
  const ctaLink = args.isPaid
    ? `${PORTAL_URL}/dashboard/leads/${args.leadId}`
    : args.vehicleId
      ? `${SITE_URL}/car/${args.vehicleId}`
      : SITE_URL;
  const ctaText = args.isPaid ? "Ver en el portal" : "Ver mi publicación";

  if (sellerEmail) {
    await sendWebLeadEmail({
      to: sellerEmail,
      toUid: args.sellerId,
      contactName: args.name,
      contactPhone: args.phone,
      contactEmail: args.email,
      message: args.message,
      carLabel: args.carLabel || undefined,
      ctaLink,
      ctaText,
      isPaidSeller: args.isPaid,
    });
  }

  const pushToken: string | undefined = args.seller.pushToken;
  if (pushToken && String(pushToken).startsWith("ExponentPushToken")) {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        to: pushToken,
        sound: "default",
        title: args.carLabel ? `Consulta por ${args.carLabel}` : "Nueva consulta",
        body: `${args.name}: ${args.message.slice(0, 100)}`,
        data: { url: args.vehicleId ? `matchcars://car/${args.vehicleId}` : "matchcars://leads" },
      }),
    }).catch(() => {});
  }
}
