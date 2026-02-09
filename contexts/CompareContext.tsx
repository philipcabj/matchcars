import React, { createContext, useContext, useState } from 'react';
import { Vehicle } from "@/types/vehicle";
import { Alert } from 'react-native';

interface CompareContextType {
  selectedVehicles: Vehicle[];
  toggleVehicle: (vehicle: Vehicle) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
}

const CompareContext = createContext<CompareContextType>({
  selectedVehicles: [],
  toggleVehicle: () => {},
  clearSelection: () => {},
  isSelected: () => false,
});

export const useCompare = () => useContext(CompareContext);

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [selectedVehicles, setSelectedVehicles] = useState<Vehicle[]>([]);

  const toggleVehicle = (vehicle: Vehicle) => {
    if (selectedVehicles.find(v => v.id === vehicle.id)) {
      setSelectedVehicles(prev => prev.filter(v => v.id !== vehicle.id));
    } else {
      if (selectedVehicles.length >= 3) {
        Alert.alert("Límite Alcanzado", "Solo puedes comparar hasta 3 vehículos a la vez.");
        return;
      }
      setSelectedVehicles(prev => [...prev, vehicle]);
    }
  };

  const clearSelection = () => setSelectedVehicles([]);
  
  const isSelected = (id: string) => !!selectedVehicles.find(v => v.id === id);

  return (
    <CompareContext.Provider value={{ selectedVehicles, toggleVehicle, clearSelection, isSelected }}>
      {children}
    </CompareContext.Provider>
  );
}
