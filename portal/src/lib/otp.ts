// portal/src/lib/otp.ts
// Código de un solo uso para la firma electrónica in-house del portal del
// comprador (Módulo A) — checkbox de aceptación + este código, mandado por
// email a la dirección de contacto ya guardada en la operación (nunca a una
// que el comprador tipee en el momento, así el link no sirve para
// "verificarse" con otro email). Nunca se guarda en texto plano.
import "server-only";

import { randomInt, createHash } from "node:crypto";

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtp(code: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}
