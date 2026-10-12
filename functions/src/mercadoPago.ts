// functions/src/mercadoPago.ts
// Cobro de seña por QR — Fase 1: conexión de la cuenta de Mercado Pago del
// vendedor (agencia o particular) vía OAuth. La plata del comprador va
// directo a la cuenta de MP del vendedor; MatchCars nunca la recibe ni la
// retiene, solo guarda los tokens para generar cobros en su nombre.
//
// Modelo:
//   sellerPaymentAccounts/{sellerUid}          → estado visible (sin secretos)
//   sellerPaymentAccounts/{sellerUid}/private/oauth → tokens cifrados (AES-GCM)
//   mpAccountIndex/{mpUserId}                  → una cuenta de MP = un vendedor
//   mpOAuthStates/{state}                      → nonce de un solo uso, 15 min
// sellerUid es el uid del particular, o el agencyId (= uid del dueño) para
// agencias — ver portal/src/lib/agency-server.ts.
//
// Configuración (una vez, en la app de MP Developers):
//   MP_CLIENT_ID      (param)  — client id de la app de MatchCars en MP
//   MP_REDIRECT_URI   (param)  — URL pública de mpOAuthCallback, registrada en MP
//   MP_CLIENT_SECRET  (secret)
//   MP_TOKEN_KEY      (secret) — 32 bytes en base64 para cifrar los tokens
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret, defineString } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

const mpClientId = defineString("MP_CLIENT_ID");
const mpRedirectUri = defineString("MP_REDIRECT_URI");
const mpClientSecret = defineSecret("MP_CLIENT_SECRET");
const mpTokenKey = defineSecret("MP_TOKEN_KEY");

const MP_AUTH_URL = "https://auth.mercadopago.com.ar/authorization";
const MP_API = "https://api.mercadopago.com";
const STATE_TTL_MS = 15 * 60 * 1000;
// Los tokens de MP duran 180 días; se renuevan cuando faltan menos de 30.
const REFRESH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Whitelist de a dónde volver después de autorizar — nunca una URL libre que
// venga del cliente (open redirect).
const RETURN_TARGETS = {
  portal: "https://portal.matchcars.app/dashboard/cobros",
  app: "matchcars://payments/connected",
} as const;
type ReturnTarget = keyof typeof RETURN_TARGETS;

// ─── Cifrado de tokens ──────────────────────────────────────────────────────
// Firestore ya los niega a todo cliente (sin match en firestore.rules), pero
// un export/backup de la base no debería dejar tokens usables.

function encrypt(plain: string): string {
  const key = Buffer.from(mpTokenKey.value(), "base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptMpToken(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const key = Buffer.from(mpTokenKey.value(), "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Un miembro invitado de una agencia no puede conectar la cuenta (ni la de
// la agencia ni una propia): la cuenta de cobro de la agencia la conecta solo
// el dueño, que es quien recibe la plata.
async function resolveSellerUid(uid: string): Promise<string> {
  const membership = await admin.firestore().doc(`agencyMemberships/${uid}`).get();
  if (membership.exists) {
    const { agencyId, role } = membership.data()!;
    if (role !== "owner") {
      throw new HttpsError("permission-denied", "Solo el dueño de la agencia puede conectar la cuenta de cobro.");
    }
    return agencyId;
  }
  return uid;
}

interface MpTokenResponse {
  access_token: string;
  refresh_token: string;
  public_key: string;
  user_id: number;
  expires_in: number;
  live_mode: boolean;
  scope?: string;
}

class MpHttpError extends Error {
  constructor(public status: number, body: string) {
    super(`MP oauth/token ${status}: ${body}`);
  }
}

async function mpTokenRequest(body: Record<string, string>): Promise<MpTokenResponse> {
  const res = await fetch(`${MP_API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: mpClientId.value(), client_secret: mpClientSecret.value(), ...body }),
  });
  if (!res.ok) {
    throw new MpHttpError(res.status, await res.text());
  }
  return (await res.json()) as MpTokenResponse;
}

function maskId(n: string | undefined): string | null {
  if (!n) return null;
  return n.length <= 3 ? "***" : `${"*".repeat(n.length - 3)}${n.slice(-3)}`;
}

function redirectTo(res: { redirect: (url: string) => void }, target: ReturnTarget, params: Record<string, string>) {
  res.redirect(`${RETURN_TARGETS[target]}?${new URLSearchParams(params).toString()}`);
}

// ─── mpOAuthStart ───────────────────────────────────────────────────────────

export const mpOAuthStart = onCall({ region: "us-central1", cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Tenés que iniciar sesión.");

  const returnTo = request.data?.returnTo as ReturnTarget;
  if (!(returnTo in RETURN_TARGETS)) throw new HttpsError("invalid-argument", "returnTo inválido.");

  const sellerUid = await resolveSellerUid(uid);
  const state = crypto.randomBytes(24).toString("hex");
  await admin.firestore().doc(`mpOAuthStates/${state}`).set({
    sellerUid,
    connectedBy: uid,
    returnTo,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAtMs: Date.now() + STATE_TTL_MS,
  });

  const url = new URL(MP_AUTH_URL);
  url.searchParams.set("client_id", mpClientId.value());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", mpRedirectUri.value());
  return { url: url.toString() };
});

// ─── mpOAuthCallback ────────────────────────────────────────────────────────
// MP redirige acá con ?code&state después de que el vendedor autoriza.

export const mpOAuthCallback = onRequest(
  { region: "us-central1", cors: false, secrets: [mpClientSecret, mpTokenKey] },
  async (req, res) => {
    const db = admin.firestore();
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!state) {
      res.status(400).send("Falta state.");
      return;
    }

    // Consumir el state en una transacción: un mismo state no se puede usar dos veces.
    const stateRef = db.doc(`mpOAuthStates/${state}`);
    const stateData = await db.runTransaction(async (tx) => {
      const snap = await tx.get(stateRef);
      if (!snap.exists) return null;
      tx.delete(stateRef);
      return snap.data()!;
    });
    if (!stateData || stateData.expiresAtMs < Date.now()) {
      res.status(400).send("El enlace de conexión venció. Volvé a intentarlo desde MatchCars.");
      return;
    }
    const target = stateData.returnTo as ReturnTarget;
    const sellerUid: string = stateData.sellerUid;

    // El vendedor canceló en la pantalla de MP.
    if (!code) {
      redirectTo(res, target, { mp: "cancelled" });
      return;
    }

    try {
      const tokens = await mpTokenRequest({
        grant_type: "authorization_code",
        code,
        redirect_uri: mpRedirectUri.value(),
      });

      const meRes = await fetch(`${MP_API}/users/me`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!meRes.ok) throw new Error(`MP users/me ${meRes.status}: ${await meRes.text()}`);
      const me = (await meRes.json()) as {
        id: number;
        nickname?: string;
        first_name?: string;
        last_name?: string;
        email?: string;
        site_id?: string;
        identification?: { type?: string; number?: string };
      };

      if (me.site_id && me.site_id !== "MLA") {
        redirectTo(res, target, { mp: "error", reason: "not_argentina" });
        return;
      }

      const mpUserId = String(me.id);
      const indexRef = db.doc(`mpAccountIndex/${mpUserId}`);
      const accountRef = db.doc(`sellerPaymentAccounts/${sellerUid}`);
      const privateRef = accountRef.collection("private").doc("oauth");
      const now = admin.firestore.FieldValue.serverTimestamp();
      const tokenExpiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + tokens.expires_in * 1000);

      const conflict = await db.runTransaction(async (tx) => {
        const idx = await tx.get(indexRef);
        // Una cuenta de MP no puede quedar atada a dos vendedores distintos —
        // freno básico contra cuentas "prestadas" para estafas con particulares.
        if (idx.exists && idx.data()!.sellerUid !== sellerUid) return true;

        // "Usar otra cuenta": liberar la cuenta de MP anterior de este vendedor.
        const prev = await tx.get(accountRef);
        const prevMpUserId = prev.data()?.mpUserId;
        if (prevMpUserId && prevMpUserId !== mpUserId) tx.delete(db.doc(`mpAccountIndex/${prevMpUserId}`));

        tx.set(indexRef, { sellerUid, updatedAt: now });
        tx.set(accountRef, {
          provider: "mercadopago",
          status: "connected",
          mpUserId,
          nickname: me.nickname ?? null,
          holderName: [me.first_name, me.last_name].filter(Boolean).join(" ") || null,
          identificationType: me.identification?.type ?? null,
          identificationMasked: maskId(me.identification?.number),
          // "Identidad informada por MP", no una verificación propia de
          // MatchCars — ver plan de verificación de particulares.
          hasIdentification: Boolean(me.identification?.number),
          liveMode: tokens.live_mode,
          tokenExpiresAt,
          connectedBy: stateData.connectedBy,
          connectedAt: now,
          updatedAt: now,
        });
        tx.set(privateRef, {
          accessToken: encrypt(tokens.access_token),
          refreshToken: encrypt(tokens.refresh_token),
          publicKey: tokens.public_key,
          scope: tokens.scope ?? null,
          email: me.email ?? null,
          identificationNumber: me.identification?.number ?? null,
          updatedAt: now,
        });
        return false;
      });

      if (conflict) {
        redirectTo(res, target, { mp: "error", reason: "account_in_use" });
        return;
      }
      redirectTo(res, target, { mp: "connected" });
    } catch (err) {
      console.error("mpOAuthCallback", sellerUid, err);
      redirectTo(res, target, { mp: "error", reason: "exchange_failed" });
    }
  }
);

// ─── mpDisconnect ───────────────────────────────────────────────────────────
// Borra los tokens de MatchCars. El vendedor además puede revocar el acceso
// desde su cuenta de MP (Seguridad → Aplicaciones conectadas).

export const mpDisconnect = onCall({ region: "us-central1", cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Tenés que iniciar sesión.");
  const sellerUid = await resolveSellerUid(uid);

  const db = admin.firestore();
  const accountRef = db.doc(`sellerPaymentAccounts/${sellerUid}`);
  const account = await accountRef.get();
  if (!account.exists) return { ok: true };

  const batch = db.batch();
  const mpUserId = account.data()!.mpUserId;
  if (mpUserId) batch.delete(db.doc(`mpAccountIndex/${mpUserId}`));
  batch.delete(accountRef.collection("private").doc("oauth"));
  batch.delete(accountRef);
  await batch.commit();
  return { ok: true };
});

// ─── mpRefreshTokens ────────────────────────────────────────────────────────

export const mpRefreshTokens = onSchedule(
  {
    schedule: "0 5 * * *",
    timeZone: "America/Argentina/Buenos_Aires",
    region: "us-central1",
    secrets: [mpClientSecret, mpTokenKey],
  },
  async () => {
    const db = admin.firestore();
    const due = await db
      .collection("sellerPaymentAccounts")
      .where("status", "==", "connected")
      .where("tokenExpiresAt", "<", admin.firestore.Timestamp.fromMillis(Date.now() + REFRESH_WINDOW_MS))
      .get();

    for (const doc of due.docs) {
      const privateRef = doc.ref.collection("private").doc("oauth");
      try {
        const priv = (await privateRef.get()).data();
        if (!priv?.refreshToken) throw new Error("sin refresh token");
        const tokens = await mpTokenRequest({
          grant_type: "refresh_token",
          refresh_token: decryptMpToken(priv.refreshToken),
        });
        const now = admin.firestore.FieldValue.serverTimestamp();
        await privateRef.update({
          accessToken: encrypt(tokens.access_token),
          refreshToken: encrypt(tokens.refresh_token),
          updatedAt: now,
        });
        await doc.ref.update({
          tokenExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + tokens.expires_in * 1000),
          updatedAt: now,
        });
      } catch (err) {
        console.error("mpRefreshTokens", doc.id, err);
        // Solo un rechazo de MP (el vendedor revocó el acceso) obliga a
        // reconectar; un error de red se reintenta en la corrida de mañana.
        if (err instanceof MpHttpError && err.status >= 400 && err.status < 500) {
          await doc.ref.update({ status: "needs_reconnect", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
      }
    }
  }
);
