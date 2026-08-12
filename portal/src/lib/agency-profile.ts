// portal/src/lib/agency-profile.ts
export interface AgencyProfileFields {
  agencyName: string;
  description: string;
  phone: string;
  whatsapp: string;
  website: string;
  instagram: string;
  businessAddress: string;
  province: string;
  city: string;
  businessHours: string;
  logoUrl: string;
  bannerUrl: string;
  slug: string;
  foundedYear: string;
  brandSpecialties: string[];
  watermarkEnabled: boolean;
}

export const EMPTY_AGENCY_PROFILE: AgencyProfileFields = {
  agencyName: "",
  description: "",
  phone: "",
  whatsapp: "",
  website: "",
  instagram: "",
  businessAddress: "",
  province: "",
  city: "",
  businessHours: "",
  logoUrl: "",
  bannerUrl: "",
  slug: "",
  foundedYear: "",
  brandSpecialties: [],
  watermarkEnabled: false,
};
