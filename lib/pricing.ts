import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

export interface MarketAnalysis {
  min: number;
  max: number;
  avg: number;
  count: number;
}

export async function analyzeMarketPrice(brand: string, model: string, year: number, currency: "ARS" | "USD", excludeId?: string): Promise<MarketAnalysis> {
    try {
        if (!brand || !model || !year || !currency) return { min: 0, max: 0, avg: 0, count: 0 };

        const q = query(
            collection(db, "vehicles"), 
            where("brand", "==", brand),
            where("model", "==", model),
            where("year", "==", year),
            where("currency", "==", currency)
        );
        
        const snap = await getDocs(q);
        const prices: number[] = [];

        snap.forEach(doc => {
            // Exclude specific ID if provided (e.g. the car we are analyzing)
            if (excludeId && doc.id === excludeId) return;

            const data = doc.data();
            // Filter out sold/deleted/unpublished if needed? 
            // Usually market analysis includes available cars.
            // Depending on requirement, we might include sold cars too for better accuracy.
            // For now, let's include everything that has a valid price.
            if (data.price && !isNaN(data.price) && data.status !== 'deleted') {
                prices.push(Number(data.price));
            }
        });

        if (prices.length > 0) {
            const min = Math.min(...prices);
            const max = Math.max(...prices);
            const sum = prices.reduce((a, b) => a + b, 0);
            const avg = sum / prices.length;
            return { min, max, avg, count: prices.length };
        }
    } catch (e) {
        console.error("Error analyzing market price", e);
    }
    return { min: 0, max: 0, avg: 0, count: 0 };
}
