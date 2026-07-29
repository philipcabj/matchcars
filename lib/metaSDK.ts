import { Platform } from 'react-native';
import { logger } from './logger';

/**
 * Initialize Meta SDK
 * This should be called once when the app starts
 * Uses dynamic require to avoid resolution errors in Expo Go
 */
export const initializeMetaSDK = () => {
  try {
    if (Platform.OS !== 'web') {
      // Dynamically require to avoid errors in Expo Go
      const { Settings } = require('react-native-fbsdk-next');
      
      // Enable auto-logging of app events
      Settings.setAdvertiserTrackingEnabled(true);
      
      // Initialize SDK
      Settings.initializeSDK();
      
      logger.info('[Meta SDK] Initialized successfully');
    }
  } catch (error) {
    logger.info('[Meta SDK] Not available in this environment (expected in Expo Go)');
  }
};
