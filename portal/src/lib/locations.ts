// portal/src/lib/locations.ts
// Espejo de config/locations.ts (app, raíz del repo) — mismo contenido,
// duplicado a mano porque app y portal son proyectos separados sin paquete
// compartido (mismo criterio ya usado para los planes de suscripción). Si se
// actualiza acá, actualizar también el otro archivo.
export const PROVINCES: string[] = [
  "Buenos Aires",
  "CABA",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];

export const CITY_OPTIONS_BY_PROVINCE: Record<string, string[]> = {
  "Buenos Aires": ["La Plata", "Mar del Plata", "Bahía Blanca", "Quilmes", "Morón", "Tandil", "San Isidro", "Pilar", "Tigre", "Vicente López"],
  // Los 48 barrios oficiales de CABA (no "ciudades" — CABA no se subdivide en
  // ciudades, así que el campo "city" se reutiliza para el barrio, sin
  // agregar un campo nuevo al esquema).
  "CABA": [
    "Agronomía",
    "Almagro",
    "Balvanera",
    "Barracas",
    "Belgrano",
    "Boedo",
    "Caballito",
    "Chacarita",
    "Coghlan",
    "Colegiales",
    "Constitución",
    "Flores",
    "Floresta",
    "La Boca",
    "La Paternal",
    "Liniers",
    "Mataderos",
    "Monserrat",
    "Monte Castro",
    "Nueva Pompeya",
    "Núñez",
    "Palermo",
    "Parque Avellaneda",
    "Parque Chacabuco",
    "Parque Chas",
    "Parque Patricios",
    "Puerto Madero",
    "Recoleta",
    "Retiro",
    "Saavedra",
    "San Cristóbal",
    "San Nicolás",
    "San Telmo",
    "Vélez Sarsfield",
    "Versalles",
    "Villa Crespo",
    "Villa del Parque",
    "Villa Devoto",
    "Villa General Mitre",
    "Villa Lugano",
    "Villa Luro",
    "Villa Ortúzar",
    "Villa Pueyrredón",
    "Villa Real",
    "Villa Riachuelo",
    "Villa Santa Rita",
    "Villa Soldati",
    "Villa Urquiza",
  ],
  "Córdoba": ["Córdoba", "Villa Carlos Paz", "Río Cuarto", "Alta Gracia", "Villa María"],
  "Santa Fe": ["Rosario", "Santa Fe", "Rafaela", "Venado Tuerto"],
  "Mendoza": ["Mendoza", "Godoy Cruz", "Guaymallén", "San Rafael"],
  "Tucumán": ["San Miguel de Tucumán", "Yerba Buena", "Tafí Viejo"],
  "Salta": ["Salta", "San Lorenzo", "Tartagal"],
  "Neuquén": ["Neuquén", "Plottier", "Centenario"],
  "Río Negro": ["Bariloche", "General Roca", "Cipolletti"],
  "Chubut": ["Comodoro Rivadavia", "Trelew", "Puerto Madryn"],
};

// Nominatim no siempre nombra la provincia igual que nuestro dataset (ej.
// CABA aparece como "Ciudad Autónoma de Buenos Aires" en el campo `state`) —
// alias conocidos para reconciliar.
const PROVINCE_ALIASES: Record<string, string> = {
  "ciudad autonoma de buenos aires": "CABA",
  "capital federal": "CABA",
  caba: "CABA",
};

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // sin acentos (marcas diacríticas tras NFD)
}

export interface NominatimAddress {
  state?: string | null;
  city?: string | null;
  town?: string | null;
  village?: string | null;
  suburb?: string | null;
  neighbourhood?: string | null;
  city_district?: string | null;
}

// Reconcilia los strings crudos que devuelve Nominatim (ver
// portal/src/app/api/geocode/route.ts) contra PROVINCES/
// CITY_OPTIONS_BY_PROVINCE — nunca inventa un valor: si no encuentra un
// match confiable devuelve null en ese campo, y quien lo use (LocationPicker
// vía VehicleForm) deja los selects tal cual para que la agencia los
// complete a mano.
export function matchProvinceAndCity(address: NominatimAddress): { province: string | null; city: string | null } {
  const rawProvince = address.state?.trim();
  if (!rawProvince) return { province: null, city: null };
  const normalizedProvince = normalize(rawProvince);

  const province =
    PROVINCE_ALIASES[normalizedProvince] ??
    PROVINCES.find((p) => normalize(p) === normalizedProvince) ??
    null;

  if (!province) return { province: null, city: null };

  // Para CABA, Nominatim trae el barrio en suburb/neighbourhood/
  // city_district (city/town suelen venir vacíos o decir "Buenos Aires").
  // Para el resto de las provincias, la localidad viene en city/town/village.
  const rawCity =
    province === "CABA"
      ? address.suburb || address.neighbourhood || address.city_district
      : address.city || address.town || address.village;
  const normalizedCity = rawCity?.trim() ? normalize(rawCity.trim()) : null;

  const cityOptions = CITY_OPTIONS_BY_PROVINCE[province] || [];
  const city = (normalizedCity && cityOptions.find((c) => normalize(c) === normalizedCity)) || null;

  return { province, city };
}
