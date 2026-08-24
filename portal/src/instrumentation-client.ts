// portal/src/instrumentation-client.ts
// Sentry del lado del cliente (browser) — sin session replay ni feedback
// widget para mantenerlo liviano, el portal es una herramienta interna, no
// necesita eso. DSN y las demás variables van en apphosting.yaml, igual que
// el resto de la config del portal.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
