import Constants from 'expo-constants';

/**
 * Environment Configuration
 * Centralized configuration for all environment variables
 */

const expoConfig = Constants.expoConfig;

export const ENV = {
  // Environment
  isDev: __DEV__,
  isProduction: !__DEV__,

  // Facebook/Meta
  facebook: {
    appId: process.env.EXPO_PUBLIC_FACEBOOK_APP_ID || '1163293382582083',
    clientToken: process.env.EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN || 'a38fb000cb6360b89fbe5568ffb3c3e6',
  },

  // Firebase
  firebase: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
  },

  // Google
  google: {
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
  },

  // App Info
  app: {
    name: expoConfig?.name || 'Matchcars',
    version: expoConfig?.version || '1.0.0',
    slug: expoConfig?.slug || 'matchcars',
    scheme: expoConfig?.scheme || 'matchcars',
  },

  // EAS
  eas: {
    projectId: expoConfig?.extra?.eas?.projectId || '',
  },
} as const;

// Validation (only in development)
if (__DEV__) {
  const requiredVars = [
    { key: 'EXPO_PUBLIC_FIREBASE_API_KEY', value: ENV.firebase.apiKey },
    { key: 'EXPO_PUBLIC_FIREBASE_PROJECT_ID', value: ENV.firebase.projectId },
    { key: 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', value: ENV.google.webClientId },
  ];

  const missing = requiredVars.filter(v => !v.value);
  
  if (missing.length > 0) {
    console.warn(
      '⚠️ Missing environment variables:',
      missing.map(v => v.key).join(', ')
    );
  }
}
