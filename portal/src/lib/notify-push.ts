// portal/src/lib/notify-push.ts
// Puerto directo de sendPushNotification en lib/notifications.ts (raíz) — el
// portal no puede importar ese archivo (paquete separado), pero es un simple
// fetch a la API pública de Expo, sin SDK de por medio.
import "server-only";

export async function sendPushNotification(
  expoPushToken: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
) {
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: expoPushToken, sound: "default", title, body, data }),
    });
  } catch (e) {
    console.error("[notify-push] Error sending push:", e);
  }
}
