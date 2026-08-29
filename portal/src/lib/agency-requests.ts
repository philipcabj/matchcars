// portal/src/lib/agency-requests.ts
// "Entre Agencias" — bolsa de pedidos entre agencias: una agencia busca un
// auto puntual para un cliente (agencyRequests), lo ve el resto de las
// agencias en un board compartido, y si alguna responde se abre un hilo
// privado (agencyThreads) entre esas dos — no es grupal, cada agencia que
// responde tiene su propio hilo con quien publicó.
//
// Mismo criterio que vehicles/leads/offers ya usan en este proyecto:
// colección plana, legible por cualquier usuario autenticado a nivel de
// regla de Firestore, con el filtrado/autorización real hecho en las rutas
// del portal (Admin SDK) — no hace falta un modelo de permisos nuevo.

export interface AgencyRequest {
  id: string;
  agencyId: string;
  agencyName: string;
  brand: string;
  model: string;
  yearMin: number | null;
  yearMax: number | null;
  priceMax: number | null;
  currency: "ARS" | "USD";
  notes: string;
  status: "open" | "closed";
  responseCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

// Auto ya publicado por otra agencia que podría servir para un pedido —
// calculado al vuelo (ver GET agency-requests), nunca guardado.
export interface AgencyRequestMatch {
  vehicleId: string;
  brand: string;
  model: string;
  year: number | null;
  price: number;
  currency: string;
  coverImage: string | null;
  agencyId: string;
  agencyName: string;
}

export interface AgencyRequestWithMatches extends AgencyRequest {
  matches: AgencyRequestMatch[];
}

// Snapshot del pedido al momento de responder — si el pedido original se
// edita/cierra después, el hilo conserva con qué contexto se abrió.
export interface AgencyRequestSummary {
  brand: string;
  model: string;
  yearMin: number | null;
  yearMax: number | null;
  priceMax: number | null;
  currency: "ARS" | "USD";
}

export interface AgencyThread {
  id: string;
  requestId: string;
  requesterAgencyId: string;
  requesterAgencyName: string;
  responderAgencyId: string;
  responderAgencyName: string;
  vehicleId: string | null;
  requestSummary: AgencyRequestSummary;
  status: "open" | "closed";
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastSenderId: string | null;
  unreadByRequester: number;
  unreadByResponder: number;
  createdAt: string | null;
  // Solo para la UI del que consulta — no se guarda tal cual en Firestore.
  myRole: "requester" | "responder";
  otherAgencyName: string;
  unreadForMe: number;
}

export interface AgencyThreadMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: string | null;
  isMe: boolean;
}
