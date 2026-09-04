// marketplace/src/app/api/lead/route.ts
// POST -> formulario "Consultar" de la web pública (ficha de auto o de agencia).
// Crea un lead (ver lib/leads-server.ts) y avisa al vendedor. Endpoint público,
// sin auth — la protección anti-spam es honeypot + tiempo mínimo en pantalla +
// throttle por IP.
import { createWebLead, hashIp } from "@/lib/leads-server";
import { NextRequest } from "next/server";

interface Body {
  name?: string;
  phone?: string;
  email?: string;
  message?: string;
  vehicleId?: string;
  agencyId?: string;
  empresa?: string; // honeypot — siempre vacío para un humano
  renderedAt?: number; // Date.now() al montar el form
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  // Honeypot: si vino relleno, es un bot. Respondemos ok para no darle pistas.
  if (body.empresa && body.empresa.trim()) {
    return Response.json({ ok: true });
  }

  // Tiempo en pantalla: un bot postea al instante; un humano tarda.
  const elapsed = typeof body.renderedAt === "number" ? Date.now() - body.renderedAt : 0;
  if (elapsed > 0 && (elapsed < 2500 || elapsed > 60 * 60 * 1000)) {
    return Response.json({ ok: true });
  }

  const name = (body.name || "").trim().slice(0, 80);
  const phone = (body.phone || "").trim().slice(0, 40);
  const email = (body.email || "").trim().slice(0, 120);
  const message = (body.message || "").trim().slice(0, 1000);
  const vehicleId = (body.vehicleId || "").trim() || undefined;
  const agencyId = (body.agencyId || "").trim() || undefined;

  if (!name) return Response.json({ error: "Poné tu nombre." }, { status: 400 });
  if (!phone && !email) return Response.json({ error: "Dejá un teléfono o un email." }, { status: 400 });
  if (email && !EMAIL_RE.test(email)) return Response.json({ error: "El email no parece válido." }, { status: 400 });
  if (message.length < 3) return Response.json({ error: "Escribí un mensaje." }, { status: 400 });
  if (!vehicleId && !agencyId) return Response.json({ error: "Falta el contexto de la consulta." }, { status: 400 });

  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "0.0.0.0";
  const ipHash = hashIp(ip);

  const result = await createWebLead({
    name,
    phone: phone || undefined,
    email: email || undefined,
    message,
    vehicleId,
    agencyId,
    ipHash,
    userAgent: request.headers.get("user-agent") || undefined,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json({ ok: true }, { status: 201 });
}
