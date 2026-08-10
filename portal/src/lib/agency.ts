// portal/src/lib/agency.ts
import { AgencyRole, AgencyRolePermissions } from "@/lib/plans";

export interface AgencyMember {
  uid: string;
  role: string;
  email?: string | null;
  name?: string;
  isImplicitOwner?: boolean;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  createdAt: string | null;
}

export interface AgencyMe {
  agencyId: string;
  agencyExists: boolean;
  agencyName: string;
  avatarUrl: string | null;
  plan: string;
  planLabel: string;
  isDealerPlan: boolean;
  features: string[];
  usage: {
    vehicles: { used: number; limit: number | null };
    seats: { used: number; limit: number };
  };
  members: AgencyMember[];
  pendingInvites: PendingInvite[];
  unreadLeadsCount: number;
  myUid: string;
  myRole: AgencyRole;
  myPermissions: AgencyRolePermissions;
}
