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
  | "pro_dealer" // Fallback/Legacy
  // Acceso interno asignado a mano por un admin (portal completo, sin
  // aparecer como agencia pública) — nunca se vende, no aparece en
  // subscribe.tsx ni en ningún flujo de compra/RevenueCat.
  | "pro_internal";

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

  // Pro Dealer Profile Fields
  agencyName?: string;
  slug?: string; // Friendly URL: matchcars.app/agencia/<slug>
  bannerUrl?: string;
  businessAddress?: string;
  address?: string; // Standard address field
  city?: string;    // City for location filters
  province?: string; // Province for location filters
  businessCoordinates?: { latitude: number; longitude: number };
  businessHours?: string;
  website?: string;
  instagram?: string;
  whatsapp?: string;
  highlightedVehicleIds?: string[]; // IDs of vehicles to feature

  // Bio / Description
  description?: string;

  // Ratings
  sellerRating?: number;
  sellerReviewCount?: number;
  sellerTrustLevel?: TrustLevel;

  // UI Preferences
  hideHomeRecentlyViewed?: boolean;

  // KYC / Identity Verification
  kycStatus?: "verified" | "pending" | "failed";
  kycVerifiedAt?: any;
  kycIdentityId?: string;

  // Extended dealer profile
  phone?: string;
  foundedYear?: number;
  brandSpecialties?: string[];
  showroomGallery?: string[];

  // Marca de agua con logo en fotos de autos (planes pagos)
  logoUrl?: string;
  watermarkEnabled?: boolean;

  // Buyer preferences (for Match Score)
  buyerPreferences?: BuyerPreferences;
}

export interface BuyerPreferences {
  budgetMin?: number;
  budgetMax?: number;
  province?: string;
  fuelType?: string;
  maxKm?: number;
  minYear?: number;
  wantsSwap?: boolean;
  wantsFinancing?: boolean;
  useType?: "familia" | "ciudad" | "trabajo" | "finde";
}
