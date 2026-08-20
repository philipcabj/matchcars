// portal/src/lib/vehicle.ts
// Forma de un vehículo tal como la app mobile/web ya la espera (types/vehicle.ts
// en la raíz). No es una copia completa del tipo original — solo los campos que
// este formulario del portal realmente lee/escribe — pero el shape del documento
// que se guarda en Firestore es 100% compatible con lo que la app ya renderiza.
export const EXCLUDED_STATUSES = ["deleted", "rejected", "rejected_limit", "blocked", "sold", "a_preparar"];

export const FUEL_OPTIONS = ["Nafta", "Diésel", "Híbrido", "Eléctrico", "GNC"];
export const GEARBOX_OPTIONS = ["Manual", "Automática"];

export const TOGGLE_FIELDS = [
  { key: "singleOwner", label: "Único dueño" },
  { key: "serviceRecords", label: "Service oficial al día" },
  { key: "vtvValid", label: "VTV vigente" },
  { key: "papersUpToDate", label: "Papeles al día" },
  { key: "warranty", label: "Con garantía" },
  { key: "acceptsTradeIn", label: "Acepta permuta" },
  { key: "acceptsFinancing", label: "Acepta financiación" },
  { key: "negotiablePrice", label: "Precio conversable" },
  { key: "immediateDelivery", label: "Entrega inmediata" },
] as const;

export type ToggleKey = (typeof TOGGLE_FIELDS)[number]["key"];

export interface VehicleFormValues {
  brand: string;
  model: string;
  version: string;
  year: string;
  price: string;
  currency: "ARS" | "USD";
  km: string;
  fuelType: string;
  gearbox: string;
  // Patente/dominio — identificador único del auto físico, no existía en
  // ningún lado del modelo hasta ahora. Sin formato forzado a propósito: hay
  // patentes viejas (ABC123) y Mercosur (AB123CD) en circulación.
  licensePlate: string;
  description: string;
  province: string;
  city: string;
  coverImage: string;
  gallery: string[];
  video: string;
  toggles: Partial<Record<ToggleKey, boolean>>;
}

export const EMPTY_VEHICLE_FORM: VehicleFormValues = {
  brand: "",
  model: "",
  version: "",
  year: "",
  price: "",
  currency: "ARS",
  km: "",
  fuelType: "",
  gearbox: "",
  licensePlate: "",
  description: "",
  province: "",
  city: "",
  coverImage: "",
  gallery: [],
  video: "",
  toggles: {},
};

export interface VehicleListItem {
  id: string;
  brand?: string;
  licensePlate?: string;
  model?: string;
  version?: string;
  year?: number;
  price?: number;
  currency?: string;
  km?: number;
  status?: string;
  // Si el auto ya pasó moderación (status:"available"), published distingue
  // "visible en el marketplace" de "pausado por la agencia" — antes no había
  // forma de pausar sin eliminar, así que este campo no se usaba en Stock.
  published?: boolean;
  coverImage?: string;
  createdAt?: string | null;
  publicationCode?: number | null;
  // margin es null si nunca se cargó el costo de compra — no se muestra
  // "$0 de margen", se oculta el dato (ver CostsCard/Módulo C).
  margin?: number | null;
  // Costo de adquisición (Módulo C) — null si nunca se cargó, para el
  // dashboard de inventario a costo (se degrada mostrando solo lo que hay).
  purchasePrice?: number | null;
}

// Superset de VehicleFormValues (mismos campos, mismo shape string-based que
// espera el form) + los campos de solo-lectura que necesita la pantalla de
// detalle. Un solo GET /api/agency/vehicles/[id] sirve a las dos pantallas.
export interface VehicleDetail extends VehicleFormValues {
  id: string;
  status: string;
  rejectionReason: string | null;
  views: number;
  likesCount: number;
  createdAt: string | null;
  priceHistory: { price: number; currency: string; changedAt: string | null }[];
  publicationCode: number | null;
  purchasePrice: number | null;
  expensesTotal: number;
}

// Color sólido por estado, para barras/gráficos (a diferencia de STATUS_LABELS.className,
// pensado para chips con fondo tenue). Mismo mapeo semántico en todos lados:
// success = sano, accent = pendiente de acción, muted = neutral/cerrado, error = crítico.
export const STATUS_BAR_COLOR: Record<string, string> = {
  available: "bg-success",
  pending_review: "bg-accent",
  sold: "bg-muted-foreground",
  reserved: "bg-cyan-500",
  a_preparar: "bg-amber-500",
  rejected: "bg-error",
  rejected_limit: "bg-error",
  blocked: "bg-error",
  deleted: "bg-muted-foreground",
};

export const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  available: { label: "Publicado", className: "bg-success/15 text-success" },
  pending_review: { label: "En revisión", className: "bg-accent/15 text-accent" },
  sold: { label: "Vendido", className: "bg-muted/20 text-muted-foreground" },
  reserved: { label: "Reservado", className: "bg-cyan-500/15 text-cyan-600" },
  // Auto que entró como parte de pago en una operación de venta — no está
  // publicado hasta que la agencia lo revise/complete (ver Módulo A,
  // saleOperations.parteDePago.agregadoAlStock).
  a_preparar: { label: "A preparar", className: "bg-amber-500/15 text-amber-600" },
  rejected: { label: "Rechazado", className: "bg-error/15 text-error" },
  rejected_limit: { label: "Rechazado (límite de plan)", className: "bg-error/15 text-error" },
  blocked: { label: "Bloqueado", className: "bg-error/15 text-error" },
  deleted: { label: "Eliminado", className: "bg-muted/20 text-muted-foreground" },
};
