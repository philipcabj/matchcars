import { logger } from './logger';

/**
 * Matchcars Analytics Wrapper for Meta SDK
 * 
 * In Expo Go: Returns no-op functions
 * In production builds: Analytics events are tracked via Meta SDK
 */

export const Analytics = {
  logRegistration: (method: string = 'email') => {
    logger.info('[Analytics] Registration logged (no-op in Expo Go):', method);
  },

  logStartPublication: () => {
    logger.info('[Analytics] Start publication logged (no-op in Expo Go)');
  },

  logCarPublished: (brand: string, model: string, price: number, currency: string) => {
    logger.info('[Analytics] CarPublished logged (no-op in Expo Go):', brand, model);
  },

  logPurchasePro: (planId: string, price: number, currency: string) => {
    logger.info('[Analytics] PurchasePro logged (no-op in Expo Go):', planId, price, currency);
  },

  logCarView: (carId: string, brand: string, model: string, price: number, currency: string) => {
    logger.info('[Analytics] CarView logged (no-op in Expo Go):', carId);
  },

  logContact: (channel: string, profileId: string) => {
    logger.info('[Analytics] Contact logged (no-op in Expo Go):', channel);
  },

  logSearch: (searchString: string, contentType: string = 'vehicle') => {
    logger.info('[Analytics] Search logged (no-op in Expo Go):', searchString);
  },

  logPlanConversion: (fromPlan: string, toPlan: string, source: string = 'subscribe_screen', billingCycle: string = 'monthly') => {
    logger.info('[Analytics] Plan conversion logged (no-op in Expo Go):', { from: fromPlan, to: toPlan, source });
  },

  logEvent: (eventName: string, params: Record<string, string | number> = {}) => {
    logger.info('[Analytics] Custom event logged (no-op in Expo Go):', eventName);
  }
};

export const trackEvent = Analytics.logEvent;
