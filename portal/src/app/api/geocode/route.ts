// portal/src/app/api/geocode/route.ts
// GET /api/geocode?q=...            -> búsqueda de dirección (search)
// GET /api/geocode?lat=..&lon=..    -> dirección a partir de coordenadas (reverse),
//                                      para cuando se marca el pin a mano/arrastrando
//                                      en vez de buscar texto — así el campo Dirección
//                                      del form siempre queda en sync con el pin.
// Proxy server-side a Nominatim (OpenStreetMap) para el buscador de
// direcciones de LocationPicker.tsx. Nominatim no manda cabeceras CORS en su
// respuesta (confirmado empíricamente: un fetch con Origin explícito no trae
// Access-Control-Allow-Origin), así que llamarlo directo desde el browser
// falla silenciosamente — la promesa rechaza, cae en el catch de
// LocationPicker y el usuario solo ve "sin resultados". Server-to-server no
// tiene restricción CORS (es una regla del browser, no del protocolo HTTP),
// así que resolvemos acá. De paso cumplimos la Usage Policy de Nominatim,
// que exige un User-Agent identificando la app.
import { withApiErrors } from "@/lib/api-handler";

const NOMINATIM_HEADERS = {
  "User-Agent": "MatchCarsPortal/1.0 (https://portal.matchcars.app; contacto@matchcars.app)",
  "Accept-Language": "es-AR",
};

export const GET = withApiErrors(async (request) => {
  const lat = request.nextUrl.searchParams.get("lat");
  const lon = request.nextUrl.searchParams.get("lon");

  if (lat && lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return Response.json({ error: "Nominatim no respondió" }, { status: 502 });
    const data: { display_name?: string } = await res.json();
    return Response.json({ label: data.display_name ?? null });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) return Response.json({ error: "Falta el parámetro q (o lat/lon)" }, { status: 400 });

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=ar&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!res.ok) return Response.json({ error: "Nominatim no respondió" }, { status: 502 });

  const data: { display_name: string; lat: string; lon: string }[] = await res.json();
  return Response.json(data.map((r) => ({ label: r.display_name, lat: Number(r.lat), lon: Number(r.lon) })));
});
