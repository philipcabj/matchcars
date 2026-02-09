import { analyzeMarketPrice, MarketAnalysis } from '@/lib/pricing';
import { useEffect, useState } from 'react';

export interface PriceSuggestion extends MarketAnalysis {
  loading: boolean;
}

export function usePriceSuggestion(brand: string, model: string, year: string, currency: "ARS" | "USD", excludeId?: string) {
  const [suggestion, setSuggestion] = useState<PriceSuggestion>({ min: 0, max: 0, avg: 0, count: 0, loading: false });

  useEffect(() => {
    if (!brand || !model || !year || !currency) {
        setSuggestion({ min: 0, max: 0, avg: 0, count: 0, loading: false });
        return;
    }

    const fetchPrices = async () => {
      setSuggestion(prev => ({ ...prev, loading: true }));
      try {
        const analysis = await analyzeMarketPrice(brand, model, Number(year), currency, excludeId);
        setSuggestion({ ...analysis, loading: false });
      } catch (e) {
        console.error("Error fetching price suggestion", e);
        setSuggestion(prev => ({ ...prev, loading: false }));
      }
    };

    const debounce = setTimeout(fetchPrices, 1000); 
    return () => clearTimeout(debounce);

  }, [brand, model, year, currency, excludeId]);

  return suggestion;
}
