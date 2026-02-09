export type TrustLevel = "new" | "active" | "verified";

export interface SaleRecord {
    id: string;
    vehicleId: string;
    sellerId: string;
    buyerId?: string; // Optional if sold externally
    buyerName?: string; // For display
    sellerName?: string; // For display
    finalPrice: number;
    currency: "ARS" | "USD";
    soldAt: any; // Timestamp
    source: "matchcars" | "external";
    rating?: number; // 1-5
    review?: string;
    vehicleSnapshot?: {
        brand: string;
        model: string;
        year: number;
        coverImage?: string;
    };
}
