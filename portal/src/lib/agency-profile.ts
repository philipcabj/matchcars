// portal/src/lib/agency-profile.ts
export interface AgencyProfileFields {
  agencyName: string;
  description: string;
  phone: string;
  whatsapp: string;
  website: string;
  instagram: string;
  address: string;
  province: string;
  city: string;
  businessHours: string;
  logoUrl: string;
  watermarkEnabled: boolean;
}

export const EMPTY_AGENCY_PROFILE: AgencyProfileFields = {
  agencyName: "",
  description: "",
  phone: "",
  whatsapp: "",
  website: "",
  instagram: "",
  address: "",
  province: "",
  city: "",
  businessHours: "",
  logoUrl: "",
  watermarkEnabled: false,
};
