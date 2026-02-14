import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type HistoryContextType = {
  viewedIds: string[];
  addToHistory: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
};

const HistoryContext = createContext<HistoryContextType | undefined>(undefined);

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const [viewedIds, setViewedIds] = useState<string[]>([]);
  const KEY = '@recently_viewed';

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(res => {
        if (res) setViewedIds(JSON.parse(res));
    });
  }, []);

  const addToHistory = async (id: string) => {
    setViewedIds(prev => {
        const filtered = prev.filter(item => item !== id);
        const newArr = [id, ...filtered].slice(0, 20); // Add to front, limit to 20
        AsyncStorage.setItem(KEY, JSON.stringify(newArr));
        return newArr;
    });
  };

  const clearHistory = async () => {
      await AsyncStorage.removeItem(KEY);
      setViewedIds([]);
  };

  return (
    <HistoryContext.Provider value={{ viewedIds, addToHistory, clearHistory }}>
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory() {
    const context = useContext(HistoryContext);
    if (!context) throw new Error('useHistory must be used within HistoryProvider');
    return context;
}
