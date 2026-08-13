"use client";

import { GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import { useEffect, useRef, useState } from "react";

// Mismo formato que guarda la app (Location.geocodeAsync de expo-location) —
// { latitude, longitude } — para que el dato sea intercambiable sin importar
// desde dónde lo cargó la agencia.
//
// La búsqueda de direcciones sigue yendo por Nominatim (OpenStreetMap, vía
// /api/geocode — gratis, sin key) sin cambios; lo que se reemplazó acá es
// solo el mapa visual/interactivo (antes Leaflet+OSM, ahora Google Maps JS
// API) para que se vea igual que el embed de la ficha pública del
// marketplace. Requiere NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (Maps JavaScript API
// habilitada + facturación activa en Google Cloud).
type Coords = { latitude: number; longitude: number };

const DEFAULT_CENTER = { lat: -34.603722, lng: -58.381592 }; // Buenos Aires
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const MAP_OPTIONS = { streetViewControl: false, mapTypeControl: false, fullscreenControl: false };

export function LocationPicker({
  value,
  onChange,
  onAddressChange,
}: {
  value: Coords | null;
  onChange: (c: Coords | null) => void;
  // Para que el campo "Dirección" del form nunca quede desincronizado del
  // pin: se llama tanto al elegir un resultado de búsqueda (ya trae el
  // texto) como al marcar/arrastrar el pin a mano (ahí se resuelve con
  // reverse geocoding). Opcional para no romper otros usos del picker.
  onAddressChange?: (address: string) => void;
}) {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: GOOGLE_MAPS_API_KEY });
  const mapRef = useRef<google.maps.Map | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ label: string; lat: number; lon: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    const seq = ++searchSeq.current;
    try {
      // Vía nuestro propio proxy (/api/geocode), no directo a Nominatim — su
      // respuesta no trae cabeceras CORS, así que un fetch directo desde acá
      // rechaza en silencio (ver comentario en route.ts).
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data: { label: string; lat: number; lon: number }[] = await res.json();
      if (seq !== searchSeq.current) return; // respuesta vieja, ya se disparó otra búsqueda
      setResults(res.ok ? data : []);
    } catch {
      setResults([]);
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  };

  const pickResult = (r: { label: string; lat: number; lon: number }) => {
    onChange({ latitude: r.lat, longitude: r.lon });
    onAddressChange?.(r.label);
    setResults([]);
    setQuery(r.label);
  };

  // Click en el mapa o arrastre del pin: no hay texto de dirección todavía,
  // hay que resolverlo (reverse geocoding) para mantener el campo en sync.
  const placeSeq = useRef(0);
  const handlePlace = async (c: Coords) => {
    onChange(c);
    if (!onAddressChange) return;
    const seq = ++placeSeq.current;
    try {
      const res = await fetch(`/api/geocode?lat=${c.latitude}&lon=${c.longitude}`);
      const data: { label: string | null } = await res.json();
      if (seq !== placeSeq.current) return; // se movió el pin de nuevo antes de que responda
      if (res.ok && data.label) {
        onAddressChange(data.label);
        setQuery(data.label);
      }
    } catch {
      // Sin conexión/Nominatim caído: el pin igual queda bien puesto, solo
      // no se autocompleta el texto — no es bloqueante.
    }
  };

  // A diferencia de Leaflet, el `center` de <GoogleMap> solo se usa en la
  // creación inicial del mapa — cambios posteriores no lo re-centran solos,
  // hay que llamar panTo/setZoom a mano sobre la instancia (capturada en
  // onLoad) cuando cambia `value` (ej. al elegir un resultado de búsqueda).
  useEffect(() => {
    if (value && mapRef.current) {
      mapRef.current.panTo({ lat: value.latitude, lng: value.longitude });
      mapRef.current.setZoom(15);
    }
  }, [value?.latitude, value?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  const center = value ? { lat: value.latitude, lng: value.longitude } : DEFAULT_CENTER;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex gap-2">
        <input
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSearch();
            }
          }}
          placeholder="Buscar dirección…"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching}
          className="shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {searching ? "Buscando…" : "Buscar"}
        </button>
        {results.length > 0 && (
          <div className="absolute top-full z-10 mt-1 flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg">
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => pickResult(r)}
                className="border-b border-border/60 px-3 py-2 text-left text-xs last:border-0 hover:bg-background"
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="h-56 w-full overflow-hidden rounded-lg border border-border">
        {!GOOGLE_MAPS_API_KEY ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
            Falta configurar NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
          </div>
        ) : !isLoaded ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Cargando mapa…</div>
        ) : (
          <GoogleMap
            center={center}
            zoom={value ? 15 : 11}
            mapContainerClassName="h-full w-full"
            options={MAP_OPTIONS}
            onLoad={(map) => {
              mapRef.current = map;
            }}
            onClick={(e) => {
              if (e.latLng) handlePlace({ latitude: e.latLng.lat(), longitude: e.latLng.lng() });
            }}
          >
            {value && (
              <MarkerF
                position={{ lat: value.latitude, lng: value.longitude }}
                draggable
                onDragEnd={(e) => {
                  if (e.latLng) handlePlace({ latitude: e.latLng.lat(), longitude: e.latLng.lng() });
                }}
              />
            )}
          </GoogleMap>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Buscá tu dirección o hacé clic en el mapa para marcarla — arrastrá el pin para ajustarla. El campo Dirección se
        actualiza solo con lo que quede marcado acá.
        {value && (
          <>
            {" "}
            <button type="button" onClick={() => onChange(null)} className="font-semibold text-accent">
              Quitar ubicación
            </button>
          </>
        )}
      </p>
    </div>
  );
}
