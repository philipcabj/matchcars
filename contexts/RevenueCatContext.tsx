import React, { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { logger } from "@/lib/logger";
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
        logger.warn("RevenueCat module not found", e);
    }
}

const API_KEYS = {
  apple: process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY ?? "",
  google: process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY ?? "",
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
    if (Platform.OS === 'web') {
      setIsReady(true);
      return;
    }
    const init = async () => {
      try {
        if (!Purchases) throw new Error("react-native-purchases no disponible");

        const apiKey = Platform.OS === 'android' ? API_KEYS.google : API_KEYS.apple;
        if (!apiKey) throw new Error("API key de RevenueCat no configurada");

        await Purchases.configure({ apiKey });

        if (LOG_LEVEL) {
          await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
        }

        setDebugInfo(prev => ({ ...prev, isConfigured: true, initError: null }));

        const info = await Purchases.getCustomerInfo();
        setCustomerInfo(info);

        const offerings = await Purchases.getOfferings();
        const offeringKeys = Object.keys(offerings.all || {});
        setDebugInfo(prev => ({ ...prev, allOfferings: offeringKeys }));

        if (offerings.current !== null && offerings.current.availablePackages.length !== 0) {
          setCurrentOffering(offerings.current);
        }
      } catch (e: any) {
        console.error("Error initializing RevenueCat:", e);
        setDebugInfo(prev => ({ ...prev, initError: e?.message || String(e), isConfigured: false }));
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
      if (!debugInfo.isConfigured || !Purchases) return;

      if (user?.uid) {
        try {
          const { customerInfo } = await Purchases.logIn(user.uid);
          setCustomerInfo(customerInfo);
        } catch (e) {
          logger.log("Error logging in to RevenueCat:", e);
        }
      } else {
        // Si no hay usuario (logout), reseteamos o manejamos anónimo
        // Purchases.logOut() devuelve customerInfo anónimo
        try {
            const info = await Purchases.logOut();
            setCustomerInfo(info);
        } catch (e) {
            logger.log("Error logging out from RevenueCat:", e);
        }
      }
    };
    identifyUser();
  }, [user, isReady, debugInfo.isConfigured]);

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
    if (!debugInfo.isConfigured || !Purchases) {
      throw new Error("RevenueCat no está configurado");
    }
    try {
      const { customerInfo } = await Purchases.purchasePackage(pack);
      setCustomerInfo(customerInfo);
      return { customerInfo };
    } catch (e: any) {
      if (!e.userCancelled) {
        logger.log("Error purchasing package:", e);
      }
      throw e;
    }
  };

  const restorePurchases = async () => {
    if (Platform.OS === 'web') return;
    try {
      if (!debugInfo.isConfigured || !Purchases) return;
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
    } catch (e) {
      logger.log("Error restoring purchases:", e);
    }
  };

  const checkTrialOrIntroductoryPriceEligibility = async (productIdentifiers: string[]) => {
    if (Platform.OS === 'web') return {};
    if (!debugInfo.isConfigured || !Purchases) return {};
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
