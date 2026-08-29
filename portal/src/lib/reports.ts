// portal/src/lib/reports.ts
export interface StatusCount {
  status: string;
  label: string;
  count: number;
}

export interface TopVehicle {
  id: string;
  brand?: string;
  model?: string;
  year?: number;
  price?: number;
  currency?: string;
  coverImage?: string;
  views: number;
  likesCount: number;
}

export interface AttentionItem {
  id: string;
  brand?: string;
  model?: string;
  year?: number;
  price?: number;
  currency?: string;
  coverImage?: string;
  reason: "no_leads_high_views" | "stale_no_leads";
  views: number;
  daysInStock: number;
}

// Comparación contra el promedio de otras agencias en planes Dealer —
// exclusivo Dealer Pro Plus (hasPeerComparison en plans.ts). null si no hay
// suficientes agencias para promediar sin poder identificar a una en
// particular (ver MIN_PEERS_FOR_COMPARISON en el route).
export interface PeerComparison {
  peerCount: number;
  yourActiveCars: number;
  avgActiveCars: number;
  yourAvgViewsPerCar: number;
  avgAvgViewsPerCar: number;
  yourAvgDaysInStock: number | null;
  avgAvgDaysInStock: number | null;
}

// Demanda de TODA la plataforma (no de esta agencia en particular) — qué
// están buscando los compradores en la app y la web, últimos
// `windowDays` días. Va a estar vacío/chico hasta que se acumulen unas
// semanas de searchEvents (ver lib/search-analytics.ts) — se muestra
// igual desde ya y va a ir sumando datos solo.
export interface MostSearchedItem {
  label: string;
  count: number;
}

export interface MostSearched {
  windowDays: number;
  totalSearches: number;
  topQueries: MostSearchedItem[];
  topBrands: MostSearchedItem[];
}

export interface AgencyReports {
  activeCount: number;
  totalViews: number;
  totalLikes: number;
  avgDaysInStock: number | null;
  statusBreakdown: StatusCount[];
  topVehicles: TopVehicle[];
  // Ambas null para planes sin acceso — el cliente no debería ni intentar
  // renderizarlas (hasAdvancedReports/hasPeerComparison gatean la UI).
  needsAttention: AttentionItem[] | null;
  peerComparison: PeerComparison | null;
  mostSearched: MostSearched;
}
