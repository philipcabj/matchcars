import { Audio } from 'expo-av';
import { Platform } from 'react-native';

// Short "pop" or "click" sound
const CLICK_SOUND_URL = 'https://codeskulptor-demos.commondatastorage.googleapis.com/pang/pop.mp3';

let soundObject: Audio.Sound | null = null;

// Initialize audio mode once
const initAudio = async () => {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch (error) {
    console.log('Error setting audio mode:', error);
  }
};

// Call init immediately
initAudio();

export const playLikeSound = async () => {
  try {
    // Re-ensure audio mode is set (sometimes gets reset)
    if (Platform.OS === 'ios') {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
      });
    }

    const { sound } = await Audio.Sound.createAsync(
      { uri: CLICK_SOUND_URL },
      { shouldPlay: true, volume: 1.0 }
    );
    soundObject = sound;
    
    // Unload from memory after playing
    sound.setOnPlaybackStatusUpdate(async (status) => {
      if (status.isLoaded && status.didJustFinish) {
        try {
          await sound.unloadAsync();
        } catch (e) {
          // Ignore unload errors
        }
        soundObject = null;
      }
    });
  } catch (error) {
    console.log('Error playing sound:', error);
  }
};

