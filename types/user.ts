import { TrustLevel } from "./commerce";

export type UserRole = "user" | "moderator" | "admin";
export type SubscriptionPlan = 
  | "free" 
  | "pro_monthly" 
  | "pro_annual" 
  | "pro_plus_monthly" 
  | "pro_plus_annual" 
  | "pro_dealer_monthly" 
  | "pro_dealer_annual"
  | "pro_dealer"; // Fallback/Legacy

export interface UserProfile {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  
  // Roles & Permissions
  role: UserRole;
  plan: SubscriptionPlan;
  
  // UI Helpers
  initials: string;
  avatarColor: string;
  photoURL?: string;

  // Status
  createdAt?: any;
  acceptedTerms?: boolean;
  isBlocked?: boolean; // New: Global block
  
  // Subscription Details
  subscriptionDate?: any;
  nextBillingDate?: any;
  cancelAtPeriodEnd?: boolean;
  
  // Trust & Stats
  trustLevel?: TrustLevel;
  salesCount?: number;
  loginCount?: number;
  lastLoginAt?: any;
  flags?: number; // Number of reports against this user
  
  // Blocking
  blockedUsers?: string[]; // IDs of users blocked by this user

  // Pro Dealer Profile Fields
  bannerUrl?: string;
  businessAddress?: string;
  businessCoordinates?: { latitude: number; longitude: number };
  businessHours?: string;
  website?: string;
  instagram?: string;
  whatsapp?: string;
  highlightedVehicleIds?: string[]; // IDs of vehicles to feature
}
