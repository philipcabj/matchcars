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

export interface AgencyReports {
  activeCount: number;
  totalViews: number;
  totalLikes: number;
  avgDaysInStock: number | null;
  statusBreakdown: StatusCount[];
  topVehicles: TopVehicle[];
  needsAttention: AttentionItem[];
}
