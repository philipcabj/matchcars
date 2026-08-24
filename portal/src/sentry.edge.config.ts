// portal/src/sentry.edge.config.ts
// Sentry para lo que corre en runtime Edge (middleware, si el portal
// suma alguno más adelante — hoy no tiene, pero Next lo requiere igual).
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});
