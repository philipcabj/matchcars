// functions/src/notify.ts
// Notificaciones push proactivas:
//  - notifyOnVehiclePublished: cuando un auto pasa a publicado, avisa a quienes
//    tienen una alerta de búsqueda guardada (users/{uid}/alerts) que matchea.
//  - sellerStalePush: 1 vez por día, empuja a los vendedores de autos parados
//    ("lleva X días sin consultas, ¿bajás el precio?").
//
// Respeta un opt-out suave: users/{uid}.notifPrefs.searchAlerts / .sellerTips
// (ausente o true = activado).
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_MIN_DAYS = 12;
const STALE_MAX_DAYS = 60;
const STALE_MAX_VIEWS = 40;
const STALE_REPUSH_DAYS = 12;
const SOLD_LIKE_STATUSES = ["sold", "reserved", "deleted", "rejected", "rejected_limit", "blocked", "a_preparar"];

function millis(ts: unknown): number {
  return ts && typeof ts === "object" && "toMillis" in ts ? (ts as admin.firestore.Timestamp).toMillis() : 0;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v.replace(/[^\d.-]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function pushTo(uid: string, title: string, body: string, url: string) {
  const db = admin.firestore();
  const snap = await db.doc(`users/${uid}`).get();
  const token = snap.data()?.pushToken;
  if (!token || !String(token).startsWith("ExponentPushToken")) return;
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ to: token, sound: "default", title, body, data: { url } }),
  }).catch(() => {});
}

// ─── Alertas de búsqueda ────────────────────────────────────────────────────

interface Alert {
  brand?: string | null;
  model?: string | null;
  minYear?: string | number | null;
  maxYear?: string | number | null;
  minPrice?: string | number | null;
  maxPrice?: string | number | null;
}

function alertMatchesVehicle(a: Alert, v: admin.firestore.DocumentData): boolean {
  const brand = String(v.brand ?? "").toLowerCase();
  const model = String(v.model ?? "").toLowerCase();
  if (a.brand && !brand.includes(String(a.brand).toLowerCase())) return false;
  if (a.model && !model.includes(String(a.model).toLowerCase())) return false;

  const year = num(v.year);
  const minY = num(a.minYear);
  const maxY = num(a.maxYear);
  if (minY != null && (year == null || year < minY)) return false;
  if (maxY != null && (year == null || year > maxY)) return false;

  const price = num(v.price);
  const minP = num(a.minPrice);
  const maxP = num(a.maxPrice);
  // El precio de la alerta se asume en la misma moneda que el auto (las
  // alertas hoy no guardan moneda). Si no hay precio, no filtra por precio.
  if (price != null) {
    if (minP != null && price < minP) return false;
    if (maxP != null && price > maxP) return false;
  }
  return true;
}

export const notifyOnVehiclePublished = onDocumentUpdated("vehicles/{vehicleId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  // Solo cuando recién pasa a publicado.
  if (before.published === true || after.published !== true) return;
  if (SOLD_LIKE_STATUSES.includes(after.status || "")) return;

  const db = admin.firestore();
  const vehicleId = event.params.vehicleId;
  const ownerId: string | undefined = after.userId;
  const carLabel = `${after.brand ?? ""} ${after.model ?? ""} ${after.year ?? ""}`.replace(/\s+/g, " ").trim();
  const priceLabel = `${after.currency ?? "ARS"} ${Number(after.price ?? 0).toLocaleString("es-AR")}`;

  const alertsSnap = await db.collectionGroup("alerts").get();
  const notified = new Set<string>();

  for (const alertDoc of alertsSnap.docs) {
    const uid = alertDoc.ref.parent.parent?.id;
    if (!uid || uid === ownerId || notified.has(uid)) continue;
    if (!alertMatchesVehicle(alertDoc.data() as Alert, after)) continue;

    const userSnap = await db.doc(`users/${uid}`).get();
    const user = userSnap.data();
    if (!user || user.notifPrefs?.searchAlerts === false) continue;

    notified.add(uid);
    await pushTo(
      uid,
      `Nuevo ${carLabel || "auto"} que buscás`,
      `${priceLabel}${after.location?.province || after.province ? ` · ${after.location?.province ?? after.province}` : ""}`,
      `matchcars://car/${vehicleId}`
    );
  }

  if (notified.size > 0) {
    console.log(`[notifyOnVehiclePublished] ${vehicleId}: ${notified.size} alertas notificadas`);
  }
});

// ─── Empuje a vendedores con stock parado ───────────────────────────────────

export const sellerStalePush = onSchedule(
  { schedule: "0 13 * * *", timeZone: "America/Argentina/Buenos_Aires", region: "us-central1" },
  async () => {
    const db = admin.firestore();
    const now = Date.now();
    const snap = await db.collection("vehicles").where("published", "==", true).get();
    let sent = 0;

    for (const doc of snap.docs) {
      const v = doc.data();
      if (SOLD_LIKE_STATUSES.includes(v.status || "")) continue;

      const ageDays = millis(v.createdAt) ? (now - millis(v.createdAt)) / DAY_MS : 0;
      if (ageDays < STALE_MIN_DAYS || ageDays > STALE_MAX_DAYS) continue;
      if ((v.views || 0) > STALE_MAX_VIEWS) continue;

      const lastPush = millis(v.stalePushAt);
      if (lastPush && now - lastPush < STALE_REPUSH_DAYS * DAY_MS) continue;

      const ownerId: string | undefined = v.userId;
      if (!ownerId) continue;
      const ownerSnap = await db.doc(`users/${ownerId}`).get();
      if (ownerSnap.data()?.notifPrefs?.sellerTips === false) continue;

      const carLabel = `${v.brand ?? ""} ${v.model ?? ""}`.trim() || "tu auto";
      await pushTo(
        ownerId,
        `${carLabel}: ${Math.round(ageDays)} días publicado`,
        `Tuvo ${v.views || 0} visitas. Probá bajando el precio o sumando fotos para que aparezca más arriba.`,
        `matchcars://car/${doc.id}`
      );
      await doc.ref.update({ stalePushAt: admin.firestore.FieldValue.serverTimestamp() });
      sent++;
    }

    console.log(`[sellerStalePush] enviados: ${sent}`);
  }
);
