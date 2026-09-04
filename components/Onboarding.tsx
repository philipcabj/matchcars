import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Analytics } from '@/lib/analytics';
import { logger } from '@/lib/logger';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

// v5: una sola clave, scopeada por uid y persistente. Se marca al terminar
// (o al omitir) y no se vuelve a mostrar para esa cuenta. `logout` ya no
// borra nada — cada usuario ve el tutorial una vez.
const STORAGE_PREFIX = 'matchcars_onboarding_v5_';
const LEGACY_KEYS = ['matchcars_onboarding_seen_v4', 'matchcars_onboarding_permanent_dismiss_v2'];

const keyFor = (uid: string) => `${STORAGE_PREFIX}${uid}`;

// Permite re-abrir el tutorial desde Perfil ("Ver tutorial de nuevo").
let forceOpen: (() => void) | null = null;
export function openOnboarding() {
  forceOpen?.();
}
// Para QA: olvida que el usuario ya lo vio.
export async function resetOnboarding(uid?: string) {
  try {
    if (uid) await AsyncStorage.removeItem(keyFor(uid));
    await AsyncStorage.multiRemove(LEGACY_KEYS);
  } catch (e) {
    logger.log('resetOnboarding error', e);
  }
}

interface Step {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

interface OnboardingProps {
  onFinish?: () => void;
}

export const Onboarding = ({ onFinish }: OnboardingProps) => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const steps: Step[] = [
    {
      title: 'Bienvenido a MatchCars',
      description: 'La comunidad más segura para comprar y vender tu auto. Te mostramos lo básico en 20 segundos.',
      icon: 'car-sport',
      color: theme.accent,
    },
    {
      title: 'Favoritos y Matches',
      description: 'Dale ❤️ a los autos que te gustan para guardarlos. Te vamos a avisar de bajadas de precio y de autos similares.',
      icon: 'heart',
      color: '#EF4444',
    },
    {
      title: 'Chat y ofertas',
      description: 'Hablá con el vendedor y hacé ofertas formales desde la app, sin compartir tu teléfono.',
      icon: 'chatbubbles',
      color: '#3B82F6',
    },
    {
      title: 'Gestioná tu venta',
      description: 'En "Mis autos" controlás tus publicaciones, ves las visitas y quién está interesado.',
      icon: 'speedometer',
      color: '#8B5CF6',
    },
    {
      title: 'Publicá gratis',
      description: 'Subí tu auto en pocos pasos y suscribite a alertas de precio para cazar oportunidades.',
      icon: 'pricetags',
      color: '#F59E0B',
    },
  ];

  const lastStep = steps.length - 1;

  // ---- Animación de transición entre pasos ----
  const anim = useRef(new Animated.Value(0)).current;
  const dirRef = useRef(1); // 1 = avanza, -1 = retrocede

  // useLayoutEffect: dejamos anim en 0 antes del paint para que no haya un
  // flash del contenido a opacidad plena antes de la transición.
  useLayoutEffect(() => {
    if (!visible) return;
    anim.setValue(0);
    const a = Animated.timing(anim, { toValue: 1, duration: 240, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [step, visible, anim]);

  const haptic = (type: 'select' | 'success' = 'select') => {
    if (Platform.OS === 'web') return;
    if (type === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    else Haptics.selectionAsync().catch(() => {});
  };

  // ---- Persistencia / apertura ----
  const checkOnboarding = useCallback(async () => {
    try {
      AsyncStorage.multiRemove(LEGACY_KEYS).catch(() => {});
      if (!user?.uid) {
        setVisible(false);
        return;
      }
      const seen = await AsyncStorage.getItem(keyFor(user.uid));
      if (!seen) {
        setStep(0);
        setVisible(true);
        Analytics.logEvent('onboarding_started', { total_steps: steps.length });
      }
    } catch (e) {
      logger.log('checkOnboarding error', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    checkOnboarding();
  }, [checkOnboarding]);

  useEffect(() => {
    forceOpen = () => {
      setStep(0);
      setVisible(true);
      Analytics.logEvent('onboarding_reopened');
    };
    return () => {
      forceOpen = null;
    };
  }, []);

  // Loguea cada paso visto (drop-off).
  useEffect(() => {
    if (!visible) return;
    Analytics.logEvent('onboarding_step_viewed', { step, step_id: steps[step]?.icon ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, visible]);

  const persistSeen = useCallback(async () => {
    if (!user?.uid) return;
    try {
      await AsyncStorage.setItem(keyFor(user.uid), new Date().toISOString());
    } catch (e) {
      logger.log('persistSeen error', e);
    }
  }, [user?.uid]);

  const handleFinish = useCallback(
    (skipped = false) => {
      Analytics.logEvent(skipped ? 'onboarding_skipped' : 'onboarding_completed', {
        at_step: step,
        dont_show_again: dontShowAgain ? 1 : 0,
      });
      haptic(skipped ? 'select' : 'success');
      // Completar los 5 pasos = visto. Si sale antes (Omitir/✕), se lo
      // volvemos a ofrecer en el próximo ingreso salvo que haya tildado
      // "No volver a mostrar".
      if (!skipped || dontShowAgain) persistSeen();
      setVisible(false);
      onFinish?.();
    },
    [step, dontShowAgain, persistSeen, onFinish],
  );

  const goToStep = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, lastStep));
      if (clamped === step) return;
      dirRef.current = clamped > step ? 1 : -1;
      haptic('select');
      setStep(clamped);
    },
    [step, lastStep],
  );

  const handleNext = useCallback(() => {
    if (step < lastStep) goToStep(step + 1);
    else handleFinish(false);
  }, [step, lastStep, goToStep, handleFinish]);

  const handleBack = useCallback(() => {
    if (step > 0) goToStep(step - 1);
  }, [step, goToStep]);

  // Swipe con react-native-gesture-handler (PanResponder no dispara de forma
  // confiable dentro de un <Modal> con gesture-handler activo). `activeOffsetX`
  // hace que solo se active tras un drag horizontal claro → los taps en los
  // botones y el scroll vertical pasan sin problema. Necesita un
  // <GestureHandlerRootView> propio dentro del Modal (más abajo).
  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .failOffsetY([-22, 22])
        .onEnd((e) => {
          'worklet';
          if (e.translationX <= -45 || e.velocityX <= -350) runOnJS(handleNext)();
          else if (e.translationX >= 45 || e.velocityX >= 350) runOnJS(handleBack)();
        }),
    [handleNext, handleBack],
  );

  // Botón físico "atrás" de Android → cerrar (además de onRequestClose).
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleFinish(true);
      return true;
    });
    return () => sub.remove();
  }, [visible, handleFinish]);

  if (!visible) return null;

  const current = steps[Math.min(step, lastStep)];
  const isLast = step === lastStep;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      statusBarTranslucent
      onRequestClose={() => handleFinish(true)}
    >
      <GestureHandlerRootView style={styles.overlay}>
        <GestureDetector gesture={swipeGesture}>
        <View
          style={[styles.card, { backgroundColor: theme.card }]}
          accessibilityViewIsModal
        >
          {/* Cerrar — siempre visible */}
          <TouchableOpacity
            onPress={() => handleFinish(true)}
            style={styles.close}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Cerrar tutorial"
          >
            <Ionicons name="close" size={22} color={theme.textMuted} />
          </TouchableOpacity>

          <Animated.View
            style={{
              alignItems: 'center',
              opacity: anim,
              transform: [
                { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [dirRef.current * 36, 0] }) },
              ],
            }}
          >
            <Animated.View
              style={[
                styles.iconContainer,
                {
                  backgroundColor: current.color + '1A',
                  transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) }],
                },
              ]}
            >
              <Ionicons name={current.icon} size={60} color={current.color} />
            </Animated.View>

            <Text style={[styles.stepCount, { color: theme.textMuted }]}>
              {step + 1} / {steps.length}
            </Text>
            <Text style={[styles.title, { color: theme.text }]}>{current.title}</Text>
            <Text style={[styles.description, { color: theme.textMuted }]}>{current.description}</Text>
          </Animated.View>

          {/* Dots — tappables */}
          <View style={styles.dotsContainer}>
            {steps.map((_, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => goToStep(i)}
                hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel={`Ir al paso ${i + 1}`}
              >
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: i === step ? theme.accent : theme.textMuted + '55' },
                    i === step && styles.activeDot,
                  ]}
                />
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.buttonContainer}>
            {step > 0 ? (
              <TouchableOpacity
                onPress={handleBack}
                style={[styles.button, styles.secondaryButton, { borderColor: theme.border }]}
                accessibilityRole="button"
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>Atrás</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => handleFinish(true)}
                style={[styles.button, styles.secondaryButton, { borderColor: theme.border }]}
                accessibilityRole="button"
              >
                <Text style={{ color: theme.textMuted, fontWeight: '600' }}>Omitir</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={handleNext}
              style={[styles.button, styles.primaryButton, { backgroundColor: theme.accent }]}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>{isLast ? 'Comenzar' : 'Siguiente'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => setDontShowAgain((v) => !v)}
            style={styles.dontShow}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dontShowAgain }}
            accessibilityLabel="No volver a mostrar este tutorial"
          >
            <View
              style={[
                styles.checkbox,
                { borderColor: dontShowAgain ? theme.accent : theme.border, backgroundColor: dontShowAgain ? theme.accent : 'transparent' },
              ]}
            >
              {dontShowAgain && <Ionicons name="checkmark" size={13} color="#FFF" />}
            </View>
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>No volver a mostrar</Text>
          </TouchableOpacity>
        </View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 22,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  close: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 4,
    zIndex: 2,
  },
  iconContainer: {
    marginBottom: 18,
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCount: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: {
    fontSize: 23,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 26,
    lineHeight: 21,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 26,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeDot: {
    width: 22,
    borderRadius: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    alignItems: 'center',
  },
  dontShow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
  },
  primaryButton: {
    flex: 1,
  },
  primaryButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
