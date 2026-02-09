import React, { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import type {
    CustomerInfo,
    PurchasesOffering,
    PurchasesPackage
} from "react-native-purchases";
import { useAuth } from "./AuthContext";

let Purchases: any;
let LOG_LEVEL: any;

if (Platform.OS !== 'web') {
    try {
        const mod = require("react-native-purchases");
        Purchases = mod.default;
        LOG_LEVEL = mod.LOG_LEVEL;
    } catch (e) {
        console.warn("RevenueCat module not found", e);
    }
}

// Configuración de RevenueCat
// Reemplaza con tus claves reales. Es buena práctica usar variables de entorno.
const API_KEYS = {
  apple: "appl_NzHflNAUCeKiobbwhCtXBBIRAyk", 
  google: "goog_KCNbClBzwAahNywCbmqvcHpiuiM",
};

// Mapeo de Entitlements (Identificadores de permisos en RevenueCat)
export const ENTITLEMENT_ID = "Matchcars Pro"; 

interface RevenueCatContextValue {
  isReady: boolean;
  currentOffering: PurchasesOffering | null;
  customerInfo: CustomerInfo | null;
  isPro: boolean; // Si tiene el entitlement activo
  purchasePackage: (pack: PurchasesPackage) => Promise<{ customerInfo: CustomerInfo }>;
  restorePurchases: () => Promise<void>;
  checkTrialOrIntroductoryPriceEligibility: (productIdentifiers: string[]) => Promise<{[key: string]: any}>;
  debugInfo: {
    initError: string | null;
    allOfferings: string[];
    isConfigured: boolean;
  };
}

const RevenueCatContext = createContext<RevenueCatContextValue | undefined>(undefined);

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isReady, setIsReady] = useState(false);
  const [currentOffering, setCurrentOffering] = useState<PurchasesOffering | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [debugInfo, setDebugInfo] = useState({
    initError: null as string | null,
    allOfferings: [] as string[],
    isConfigured: false
  });

  // 1. Inicializar SDK
  useEffect(() => {
    const init = async () => {
      if (Platform.OS === 'web') {
        setIsReady(true);
        return;
      }

      try {
        if (Platform.OS === 'android') {
          await Purchases.configure({ apiKey: API_KEYS.google });
        } else if (Platform.OS === 'ios') {
          await Purchases.configure({ apiKey: API_KEYS.apple });
        }
        setDebugInfo(prev => ({ ...prev, isConfigured: true }));

        // Nivel de logs para debug
        await Purchases.setLogLevel(LOG_LEVEL.DEBUG);

        // Cargar info inicial
        const info = await Purchases.getCustomerInfo();
        setCustomerInfo(info);
        
        const offerings = await Purchases.getOfferings();
        setDebugInfo(prev => ({ 
            ...prev, 
            allOfferings: Object.keys(offerings.all) 
        }));

        if (offerings.current !== null && offerings.current.availablePackages.length !== 0) {
            setCurrentOffering(offerings.current);
        } else {
             // Si no hay current, intentamos buscar 'default' o el primero disponible para fallback
             const fallback = offerings.all['default'] || Object.values(offerings.all)[0];
             if (fallback) {
                 setCurrentOffering(fallback);
             }
        }
      } catch (e: any) {
        console.error("Error initializing RevenueCat:", e);
        setDebugInfo(prev => ({ ...prev, initError: e.message || String(e) }));
      } finally {
        setIsReady(true);
      }
    };

    init();
  }, []);

  // 2. Identificar usuario cuando hace login
  useEffect(() => {
    const identifyUser = async () => {
      if (!isReady) return;
      if (Platform.OS === 'web') return; // Skip on web

      if (user?.uid) {
        try {
          const { customerInfo } = await Purchases.logIn(user.uid);
          setCustomerInfo(customerInfo);
        } catch (e) {
          console.error("Error logging in to RevenueCat:", e);
        }
      } else {
        // Si no hay usuario (logout), reseteamos o manejamos anónimo
        // Purchases.logOut() devuelve customerInfo anónimo
        try {
            const info = await Purchases.logOut();
            setCustomerInfo(info);
        } catch (e) {
            console.error("Error logging out from RevenueCat:", e);
        }
      }
    };
    identifyUser();
  }, [user, isReady]);

  // Helper para verificar entitlement
  const isPro = React.useMemo(() => {
    if (!customerInfo) return false;
    return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
  }, [customerInfo]);

  // Función de compra
  const purchasePackage = async (pack: PurchasesPackage) => {
    if (Platform.OS === 'web') {
      alert("Las compras no están disponibles en la web. Descarga la App.");
      throw new Error("Not supported on web");
    }
    try {
      const { customerInfo } = await Purchases.purchasePackage(pack);
      setCustomerInfo(customerInfo);
      return { customerInfo };
    } catch (e: any) {
      if (!e.userCancelled) {
        console.error("Error purchasing package:", e);
      }
      throw e;
    }
  };

  const restorePurchases = async () => {
    if (Platform.OS === 'web') return;
    try {
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
    } catch (e) {
      console.error("Error restoring purchases:", e);
    }
  };

  const checkTrialOrIntroductoryPriceEligibility = async (productIdentifiers: string[]) => {
    if (Platform.OS === 'web') return {};
    return await Purchases.checkTrialOrIntroductoryPriceEligibility(productIdentifiers);
  };

  return (
    <RevenueCatContext.Provider
      value={{
        isReady,
        currentOffering,
        customerInfo,
        isPro,
        purchasePackage,
        restorePurchases,
        checkTrialOrIntroductoryPriceEligibility,
        debugInfo
      }}
    >
      {children}
    </RevenueCatContext.Provider>
  );
}

export function useRevenueCat() {
  const context = useContext(RevenueCatContext);
  if (!context) {
    throw new Error("useRevenueCat must be used within a RevenueCatProvider");
  }
  return context;
}
