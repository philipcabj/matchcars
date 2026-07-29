/**
 * Professional logging system for Matchcars
 * In development: logs to console.
 * In production: errors are reported to Firestore `error_logs` collection.
 */

import { addDoc, collection } from "firebase/firestore";

const isDev = __DEV__;

async function reportToFirestore(level: string, args: any[]) {
  try {
    // Lazy import to avoid circular deps
    const { db } = await import("@/lib/firebase");
    const message = args
      .map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : String(a)))
      .join(" ");
    await addDoc(collection(db, "error_logs"), {
      level,
      message,
      timestamp: new Date().toISOString(),
      platform: typeof navigator !== "undefined" ? navigator.userAgent : "native",
    });
  } catch {
    // Silently fail — don't throw inside the logger
  }
}

export const logger = {
  log: (...args: any[]) => {
    if (isDev) console.log(...args);
  },

  warn: (...args: any[]) => {
    if (isDev) console.warn(...args);
    else reportToFirestore("warn", args);
  },

  error: (...args: any[]) => {
    console.error(...args);
    if (!isDev) reportToFirestore("error", args);
  },

  info: (...args: any[]) => {
    if (isDev) console.info(...args);
  },

  debug: (...args: any[]) => {
    if (isDev) console.debug(...args);
  },
};
