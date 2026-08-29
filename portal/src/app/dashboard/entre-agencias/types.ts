// portal/src/app/dashboard/entre-agencias/types.ts
// Shape de GET /api/agency/agency-requests, compartido entre BoardTab y
// MyRequestsTab (el fetch se levanta una sola vez en page.tsx).
export interface RequestMatch {
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

export interface AgencyRequestItem {
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
  matches: RequestMatch[];
}

export interface AgencyThreadItem {
  id: string;
  requestId: string;
  otherAgencyName: string;
  myRole: "requester" | "responder";
  requestSummary: { brand: string; model: string; yearMin: number | null; yearMax: number | null; priceMax: number | null; currency: string };
  status: "open" | "closed";
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadForMe: number;
}
