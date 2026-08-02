import { Platform } from 'react-native';
import { logger } from './logger';
import { app } from './firebase';

/**
 * Matchcars Analytics Wrapper for Meta
 *
 * Web: fires the Meta Pixel (fbq) installed in app/+html.tsx, plus a
 * server-side Conversions API call (Cloud Function) for the same event,
 * deduplicated via a shared event_id — mitigates signal loss from
 * ad blockers / iOS ATT on the ad -> web funnel.
 *
 * Native (iOS/Android): fires react-native-fbsdk-next's AppEventsLogger.
 * Falls back to a no-op if the native module isn't available (Expo Go).
 */

type EventParams = Record<string, string | number | boolean | undefined>;

// Lazy, guarded require — avoids bundling/resolution issues on web or in Expo Go
let FBAppEvents: typeof import('react-native-fbsdk-next').AppEventsLogger | null = null;
if (Platform.OS !== 'web') {
  try {
    FBAppEvents = require('react-native-fbsdk-next').AppEventsLogger;
  } catch {
    FBAppEvents = null;
  }
}

interface EventMapping {
  webEvent: string; // Meta standard event name, or same as custom name
  nativeEvent: string;
  isStandard: boolean;
}

function resolveMapping(eventName: string): EventMapping {
  switch (eventName) {
    case 'car_view':
      return { webEvent: 'ViewContent', nativeEvent: FBAppEvents?.AppEvents?.ViewedContent ?? 'car_view', isStandard: true };
    case 'contact_click':
      return { webEvent: 'Lead', nativeEvent: FBAppEvents?.AppEvents?.Contact ?? 'contact_click', isStandard: true };
    case 'registration':
      return { webEvent: 'CompleteRegistration', nativeEvent: FBAppEvents?.AppEvents?.CompletedRegistration ?? 'registration', isStandard: true };
    case 'purchase_pro':
      return { webEvent: 'Purchase', nativeEvent: FBAppEvents?.AppEvents?.Purchased ?? 'purchase_pro', isStandard: true };
    case 'search':
      return { webEvent: 'Search', nativeEvent: FBAppEvents?.AppEvents?.Searched ?? 'search', isStandard: true };
    default:
      return { webEvent: eventName, nativeEvent: eventName, isStandard: false };
  }
}

function generateEventId(): string {
  return `mc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function cleanParams(params: EventParams): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === 'boolean' ? String(value) : value;
  }
  return out;
}

function getCookie(name: string): string | undefined {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function fireWeb(mapping: EventMapping, params: Record<string, string | number>, eventId: string) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const fbq = (window as any).fbq;
  if (typeof fbq !== 'function') return;
  try {
    fbq(mapping.isStandard ? 'track' : 'trackCustom', mapping.webEvent, params, { eventID: eventId });
  } catch (e) {
    logger.info('[Analytics] fbq failed', e);
  }
}

function fireNative(mapping: EventMapping, params: Record<string, string | number>) {
  if (Platform.OS === 'web' || !FBAppEvents) return;
  try {
    FBAppEvents.logEvent(mapping.nativeEvent, params);
  } catch (e) {
    logger.info('[Analytics] AppEventsLogger failed', e);
  }
}

function fireCAPI(mapping: EventMapping, eventId: string, params: Record<string, string | number>) {
  // Server-side Conversions API is wired for the web funnel only in this pass.
  if (Platform.OS !== 'web') return;
  try {
    Promise.all([import('firebase/functions')]).then(([{ getFunctions, httpsCallable }]) => {
      const fns = getFunctions(app);
      const call = httpsCallable(fns, 'sendMetaConversionEvent');
      call({
        eventName: mapping.webEvent,
        eventId,
        isStandard: mapping.isStandard,
        params,
        sourceUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        fbp: getCookie('_fbp'),
        fbc: getCookie('_fbc'),
      }).catch((e) => logger.info('[Analytics] CAPI call failed', e));
    });
  } catch (e) {
    logger.info('[Analytics] CAPI dispatch failed', e);
  }
}

function track(eventName: string, params: EventParams = {}) {
  const clean = cleanParams(params);
  const mapping = resolveMapping(eventName);
  const eventId = generateEventId();

  logger.info('[Analytics]', eventName, clean);

  fireWeb(mapping, clean, eventId);
  fireNative(mapping, clean);
  fireCAPI(mapping, eventId, clean);
}

export const Analytics = {
  logRegistration: (method: string = 'email') => {
    track('registration', { registration_method: method });
  },

  logStartPublication: () => {
    track('start_publication');
  },

  logCarPublished: (brand: string, model: string, price: number, currency: string) => {
    track('car_published', { brand, model, value: price, currency });
  },

  logPurchasePro: (planId: string, price: number, currency: string) => {
    track('purchase_pro', { content_name: planId, value: price, currency });
  },

  logCarView: (carId: string, brand: string, model: string, price: number, currency: string) => {
    track('car_view', { content_ids: carId, content_type: 'vehicle', content_name: `${brand} ${model}`, value: price, currency });
  },

  logContact: (channel: string, profileId: string) => {
    track('contact_click', { channel, profileId });
  },

  logShare: (method: string, profileId: string) => {
    track('share_click', { method, profileId });
  },

  logSearch: (searchString: string, contentType: string = 'vehicle') => {
    track('search', { search_string: searchString, content_type: contentType });
  },

  logPlanConversion: (fromPlan: string, toPlan: string, source: string = 'subscribe_screen', billingCycle: string = 'monthly') => {
    track('plan_conversion', { from_plan: fromPlan, to_plan: toPlan, source, billing_cycle: billingCycle });
  },

  logEvent: (eventName: string, params: Record<string, string | number> = {}) => {
    track(eventName, params);
  },
};

export const trackEvent = Analytics.logEvent;
