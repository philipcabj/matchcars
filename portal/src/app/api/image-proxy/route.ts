// portal/src/app/api/image-proxy/route.ts
// GET -> baja una imagen de Firebase Storage y la devuelve same-origin.
//
// Necesario para el generador de flyers (FlyerButton.tsx): dibujar una
// imagen externa en un <canvas> y después leerla (toDataURL/toBlob) requiere
// que la imagen se haya servido con CORS habilitado, o el canvas queda
// "tainted" y el browser tira una excepción de seguridad al exportar. El
// bucket de Storage no tiene CORS configurado para orígenes arbitrarios, así
// que en vez de tocar esa config de infra, se proxea acá (same-origin desde
// el punto de vista del canvas).
//
// Allowlist de host a propósito estricta — esto no es un proxy genérico,
// solo debe poder traer fotos de autos que ya son públicas.
const ALLOWED_HOSTS = ["firebasestorage.googleapis.com", "storage.googleapis.com"];

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return Response.json({ error: "Falta el parámetro url." }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return Response.json({ error: "URL inválida." }, { status: 400 });
  }
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return Response.json({ error: "Host no permitido." }, { status: 400 });
  }

  const upstream = await fetch(parsed.toString());
  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: "No se pudo descargar la imagen." }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
