import React, { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import Purchases, {
    CustomerInfo,
    LOG_LEVEL,
    PurchasesOffering,
    PurchasesPackage
} from "react-native-purchases";
import { useAuth } from "./AuthContext";

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
}

const RevenueCatContext = createContext<RevenueCatContextValue | undefined>(undefined);

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isReady, setIsReady] = useState(false);
  const [currentOffering, setCurrentOffering] = useState<PurchasesOffering | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);

  // 1. Inicializar SDK
  useEffect(() => {
    const init = async () => {
      if (Platform.OS === 'android') {
        await Purchases.configure({ apiKey: API_KEYS.google });
      } else if (Platform.OS === 'ios') {
        await Purchases.configure({ apiKey: API_KEYS.apple });
      }

      // Nivel de logs para debug
      await Purchases.setLogLevel(LOG_LEVEL.DEBUG);

      // Cargar info inicial
      try {
        const info = await Purchases.getCustomerInfo();
        setCustomerInfo(info);
        
        const offerings = await Purchases.getOfferings();
        if (offerings.current !== null && offerings.current.availablePackages.length !== 0) {
            setCurrentOffering(offerings.current);
        }
      } catch (e) {
        console.error("Error initializing RevenueCat:", e);
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
    try {
      const { customerInfo } = await Purchases.purchasePackage(pack);
      setCustomerInfo(customerInfo);
      return { customerInfo };
    } catch (e: any) {
      if (!e.userCancelled) {
        console.error("Purchase error:", e);
        throw e;
      }
      throw e;
    }
  };

  const restorePurchases = async () => {
    try {
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
    } catch (e) {
      console.error("Restore error:", e);
      throw e;
    }
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
