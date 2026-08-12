"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

// Mismo formato que guarda la app (Location.geocodeAsync de expo-location) —
// { latitude, longitude } — para que el dato sea intercambiable sin importar
// desde dónde lo cargó la agencia. Acá, en vez del geocoder nativo del OS, se
// usa Nominatim (OpenStreetMap) para buscar direcciones y un mapa Leaflet
// (con tiles de OSM) para ajustar el pin a mano — sin API key ni facturación.
type Coords = { latitude: number; longitude: number };

const DEFAULT_CENTER: [number, number] = [-34.603722, -58.381592]; // Buenos Aires

// Los íconos default de Leaflet rompen con bundlers modernos si no se
// reapuntan a mano — se usan los mismos assets servidos desde unpkg (imágenes
// estáticas del propio paquete, no un servicio de terceros con datos).
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function ClickToPlace({ onPlace }: { onPlace: (c: Coords) => void }) {
  useMapEvents({
    click(e) {
      onPlace({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    },
  });
  return null;
}

function RecenterOnChange({ coords }: { coords: Coords }) {
  const map = useMap();
  useEffect(() => {
    map.setView([coords.latitude, coords.longitude], 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords.latitude, coords.longitude]);
  return null;
}

export function LocationPicker({ value, onChange }: { value: Coords | null; onChange: (c: Coords | null) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ label: string; lat: number; lon: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    const seq = ++searchSeq.current;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=ar&q=${encodeURIComponent(query)}`
      );
      const data: { display_name: string; lat: string; lon: string }[] = await res.json();
      if (seq !== searchSeq.current) return; // respuesta vieja, ya se disparó otra búsqueda
      setResults(data.map((r) => ({ label: r.display_name, lat: Number(r.lat), lon: Number(r.lon) })));
    } catch {
      setResults([]);
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  };

  const pickResult = (r: { label: string; lat: number; lon: number }) => {
    onChange({ latitude: r.lat, longitude: r.lon });
    setResults([]);
    setQuery(r.label);
  };

  const center: [number, number] = value ? [value.latitude, value.longitude] : DEFAULT_CENTER;

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
        <MapContainer center={center} zoom={value ? 15 : 11} className="h-full w-full">
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <ClickToPlace onPlace={onChange} />
          {value && <RecenterOnChange coords={value} />}
          {value && (
            <Marker
              position={[value.latitude, value.longitude]}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const pos = e.target.getLatLng();
                  onChange({ latitude: pos.lat, longitude: pos.lng });
                },
              }}
            />
          )}
        </MapContainer>
      </div>
      <p className="text-xs text-muted-foreground">
        Buscá tu dirección o hacé clic en el mapa para marcarla — arrastrá el pin para ajustarla.
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
