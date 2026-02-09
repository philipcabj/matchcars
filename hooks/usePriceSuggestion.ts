import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface PriceSuggestion {
  min: number;
  max: number;
  avg: number;
  count: number;
  loading: boolean;
}

export function usePriceSuggestion(brand: string, model: string, year: string, currency: "ARS" | "USD") {
  const [suggestion, setSuggestion] = useState<PriceSuggestion>({ min: 0, max: 0, avg: 0, count: 0, loading: false });

  useEffect(() => {
    if (!brand || !model || !year || !currency) {
        setSuggestion({ min: 0, max: 0, avg: 0, count: 0, loading: false });
        return;
    }

    const fetchPrices = async () => {
      setSuggestion(prev => ({ ...prev, loading: true }));
      try {
        // Query vehicles of same make/model/year
        // Note: This requires a composite index on Firestore: brand + model + year
        // If it fails, we might need to query less fields and filter client side.
        // For safety/cost, let's query by Brand + Model and filter year client side? 
        // Or just Brand + Model.
        
        const q = query(
            collection(db, "vehicles"), 
            where("brand", "==", brand),
            where("model", "==", model),
            where("year", "==", Number(year)),
            where("currency", "==", currency)
        );
        
        const snap = await getDocs(q);
        const prices: number[] = [];

        snap.forEach(doc => {
            const data = doc.data();
            if (data.price && !isNaN(data.price)) {
                prices.push(Number(data.price));
            }
        });

        if (prices.length > 0) {
            const min = Math.min(...prices);
            const max = Math.max(...prices);
            const sum = prices.reduce((a, b) => a + b, 0);
            const avg = sum / prices.length;
            setSuggestion({ min, max, avg, count: prices.length, loading: false });
        } else {
            setSuggestion({ min: 0, max: 0, avg: 0, count: 0, loading: false });
        }

      } catch (e) {
        console.error("Error fetching price suggestion", e);
        setSuggestion(prev => ({ ...prev, loading: false }));
      }
    };

    const debounce = setTimeout(fetchPrices, 1000); 
    return () => clearTimeout(debounce);

  }, [brand, model, year, currency]);

  return suggestion;
}
