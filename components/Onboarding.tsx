import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Modal, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export const ONBOARDING_KEY = 'matchcars_onboarding_seen_v4';
export const ONBOARDING_PERMANENT_KEY = 'matchcars_onboarding_permanent_dismiss_v2';

interface OnboardingProps {
  onFinish?: () => void;
}

export const Onboarding = ({ onFinish }: OnboardingProps) => {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const steps = [
    {
      title: "Bienvenido a MatchCars",
      description: "La comunidad más segura para comprar y vender tu auto. ¡Empecemos!",
      icon: "car-sport",
      color: theme.accent
    },
    {
      title: "Favoritos y Matches",
      description: "Dale ❤️ a los autos que te gustan para guardarlos. Te avisaremos de novedades y autos similares (Matches).",
      icon: "heart",
      color: "#EF4444"
    },
    {
      title: "Chat y Mensajes",
      description: "Comunicate de forma segura con vendedores o interesados directamente desde la app, sin compartir tu teléfono.",
      icon: "chatbubbles",
      color: "#3B82F6"
    },
    {
      title: "Gestioná tu Venta",
      description: "En la sección 'Mis Autos' controlás tus publicaciones, ves estadísticas de visitas y quiénes están interesados.",
      icon: "speedometer",
      color: "#8B5CF6"
    },
    {
      title: "Alertas y Publicación",
      description: "Suscribite a bajadas de precio para cazar oportunidades y publicá tu auto gratis en simples pasos.",
      icon: "notifications",
      color: "#F59E0B"
    }
  ];

  useEffect(() => {
    checkOnboarding();
  }, []);

  const checkOnboarding = async () => {
    try {
      const permanentDismiss = await AsyncStorage.getItem(ONBOARDING_PERMANENT_KEY);
      if (permanentDismiss) return; 

      const seen = await AsyncStorage.getItem(ONBOARDING_KEY);
      if (!seen) {
        setVisible(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleFinish = async (skip = false) => {
    try {
      if (dontShowAgain) {
          await AsyncStorage.setItem(ONBOARDING_PERMANENT_KEY, 'true');
      }
      
      // Mark as seen for this session
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      
      setVisible(false);
      if (onFinish) onFinish();
    } catch (e) {
      console.error(e);
    }
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      handleFinish();
    }
  };
  
  const handleBack = () => {
      if (step > 0) {
          setStep(step - 1);
      }
  };

  // PanResponder for Swipe
  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderEnd: (e, gestureState) => {
        // Swipe Left -> Next
        if (gestureState.dx < -50) {
          if (step < steps.length - 1) {
            setStep(prev => prev + 1);
          } else {
            handleFinish();
          }
        }
        // Swipe Right -> Back
        else if (gestureState.dx > 50) {
          if (step > 0) {
            setStep(prev => prev - 1);
          }
        }
      },
    })
  ).current;

  if (!visible) return null;

  const currentStep = steps[step];

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View style={styles.overlay}>
        <View 
            style={[styles.card, { backgroundColor: theme.card }]}
            {...panResponder.panHandlers}
        >
          <View style={styles.iconContainer}>
            <Ionicons name={currentStep.icon as any} size={64} color={currentStep.color} />
          </View>
          
          <Text style={[styles.title, { color: theme.text }]}>{currentStep.title}</Text>
          <Text style={[styles.description, { color: theme.textMuted }]}>{currentStep.description}</Text>

          <View style={styles.dotsContainer}>
            {steps.map((_, i) => (
              <View 
                key={i} 
                style={[
                  styles.dot, 
                  { backgroundColor: i === step ? theme.accent : theme.border },
                  i === step && styles.activeDot
                ]} 
              />
            ))}
          </View>

          <View style={styles.buttonContainer}>
            {step > 0 ? (
                <TouchableOpacity onPress={handleBack} style={[styles.button, { backgroundColor: theme.border, marginRight: 10 }]}>
                    <Text style={{ color: theme.text }}>Atrás</Text>
                </TouchableOpacity>
            ) : (
                <TouchableOpacity onPress={() => handleFinish(true)} style={[styles.button, { backgroundColor: 'transparent', marginRight: 10, borderWidth: 1, borderColor: theme.border }]}>
                    <Text style={{ color: theme.textMuted }}>Omitir</Text>
                </TouchableOpacity>
            )}
            
            <TouchableOpacity onPress={handleNext} style={[styles.button, { backgroundColor: theme.accent, flex: 1 }]}>
              <Text style={styles.buttonText}>
                {step === steps.length - 1 ? "Comenzar" : "Siguiente"}
              </Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity 
            onPress={() => setDontShowAgain(!dontShowAgain)} 
            style={{ marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
              <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', backgroundColor: dontShowAgain ? theme.accent : 'transparent' }}>
                  {dontShowAgain && <Ionicons name="checkmark" size={14} color="#FFF" />}
              </View>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                  No mostrar más este mensaje
              </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10
  },
  iconContainer: {
    marginBottom: 20,
    padding: 16,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.05)'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center'
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 30
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  activeDot: {
    width: 20,
    borderRadius: 4
  },
  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16
  }
});
