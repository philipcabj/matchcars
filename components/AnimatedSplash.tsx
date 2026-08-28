import React, { useEffect, useRef, useCallback } from 'react';
import {
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * MatchCars - Animated Splash (versión final)
 * -------------------------------------------------------------
 * Coreografía:
 *   1. El auto (logo real recortado) entra desde abajo con fade + scale
 *   2. El wordmark MATCH / CARS sube en fade
 *   3. La cadena (eslabones) se despliega con un rebote
 *   4. El tagline "ENCONTRÁ TU AUTO" aparece con fade
 *   5. Una vez armado todo, el conjunto completo "respira" (escala/opacidad
 *      muy sutil en loop) mientras se espera que appReady pase a true
 *   → fade-out cuando la app está lista
 *
 * Toda la vista es flex 100% — se adapta a CUALQUIER relación de aspecto
 * (iPhone SE, Android grande, tablets). No usa medidas de pantalla fijas.
 *
 * Requisitos:
 *   - expo-splash-screen (viene en el SDK de Expo)
 *   - La tipografía Archivo Black cargada con expo-font (ver instrucciones).
 *     Si no la cargás, cae a la fuente del sistema sin romper.
 *   - El asset del auto en assets/images/matchcars_auto.png (+ @2x, @3x)
 */

// === Marca (colores exactos de MatchCars) ===
const BRAND = {
  bgCenter: '#2A2A2F',
  bgEdge: '#201F23',
  bgFlat: '#232327', // usar este mismo en el splash NATIVO (app.json)
  orange: '#FB8D1C',
  white: '#FDFDFD',
  whiteDim: 'rgba(253,253,253,0.5)',
};

// Nombre de la familia una vez cargada con expo-font.
// Si todavía no la cargaste, dejá undefined y usa la del sistema.
const FONT_DISPLAY: string | undefined = 'ArchivoBlack';

type Props = {
  onFinish?: () => void;
  appReady?: boolean;
};

export default function AnimatedSplash({ onFinish, appReady = true }: Props) {
  const carY = useRef(new Animated.Value(14)).current;
  const carOpacity = useRef(new Animated.Value(0)).current;
  const carScale = useRef(new Animated.Value(0.9)).current;

  const wordY = useRef(new Animated.Value(10)).current;
  const wordOpacity = useRef(new Animated.Value(0)).current;

  const chainScale = useRef(new Animated.Value(0.6)).current;
  const chainOpacity = useRef(new Animated.Value(0)).current;

  const tagOpacity = useRef(new Animated.Value(0)).current;

  // Respiración del logo entero mientras se espera que appReady pase a
  // true — reemplaza el glow circular (se sacó, quedaba feo). 0 = reposo,
  // 1 = punto más "inflado" del pulso.
  const breathe = useRef(new Animated.Value(0)).current;

  const rootOpacity = useRef(new Animated.Value(1)).current;

  const hideNative = useCallback(async () => {
    try {
      await SplashScreen.hideAsync();
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    hideNative();

    Animated.parallel([
      Animated.sequence([
        Animated.delay(200),
        Animated.parallel([
          Animated.timing(carOpacity, {
            toValue: 1,
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(carY, {
            toValue: 0,
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(carScale, {
            toValue: 1,
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.sequence([
        Animated.delay(500),
        Animated.parallel([
          Animated.timing(wordOpacity, {
            toValue: 1,
            duration: 650,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(wordY, {
            toValue: 0,
            duration: 650,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.sequence([
        Animated.delay(850),
        Animated.parallel([
          Animated.timing(chainOpacity, {
            toValue: 1,
            duration: 600,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.spring(chainScale, {
            toValue: 1,
            friction: 5,
            tension: 120,
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.sequence([
        Animated.delay(1150),
        Animated.timing(tagOpacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, {
            toValue: 1,
            duration: 1600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(breathe, {
            toValue: 0,
            duration: 1600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (appReady) {
      const t = setTimeout(() => {
        Animated.timing(rootOpacity, {
          toValue: 0,
          duration: 450,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }).start(() => onFinish?.());
      }, 2100);
      return () => clearTimeout(t);
    }
  }, [appReady, onFinish, rootOpacity]);

  // Pulso muy sutil — 1.035x de escala y una leve baja de opacidad en el
  // punto más "inflado", nada más. Tiene que leerse como "sigue vivo,
  // esperando", no como una animación protagonista.
  const breatheScale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.035],
  });
  const breatheOpacity = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.92],
  });

  return (
    <Animated.View style={[styles.root, { opacity: rootOpacity }]}>
      {/* Vignette vertical (borde oscuro -> centro más claro -> borde oscuro)
          reemplaza los dos Views planos de antes — con solo backgroundColor +
          borderRadius no hay forma de difuminar el borde, se veía como un
          óvalo de borde duro en vez de un degradé de fondo. */}
      <LinearGradient
        colors={[BRAND.bgEdge, BRAND.bgCenter, BRAND.bgEdge]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      <Animated.View
        style={[
          styles.stage,
          { opacity: breatheOpacity, transform: [{ scale: breatheScale }] },
        ]}
      >
        <Animated.View
          style={{
            opacity: carOpacity,
            transform: [{ translateY: carY }, { scale: carScale }],
          }}
        >
          <Image
            source={require('../assets/images/matchcars_auto.png')}
            style={styles.car}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.View
          style={{
            opacity: wordOpacity,
            transform: [{ translateY: wordY }],
            alignItems: 'center',
            marginTop: 10,
          }}
        >
          <Text style={styles.word}>MATCH</Text>
          <Text style={styles.word}>CARS</Text>
        </Animated.View>

        <Animated.View
          style={{
            opacity: chainOpacity,
            transform: [{ scaleX: chainScale }],
            marginTop: 18,
          }}
        >
          <View style={styles.chainRow}>
            <View style={styles.chainBar} />
            <View style={styles.link} />
            <View style={[styles.link, styles.linkOverlap]} />
            <View style={styles.chainBar} />
          </View>
        </Animated.View>

        <Animated.Text
          style={[
            styles.tag,
            { opacity: tagOpacity },
          ]}
        >
          ENCONTRÁ TU AUTO
        </Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  car: {
    width: 190,
    height: 62,
  },
  word: {
    fontFamily: FONT_DISPLAY,
    fontSize: 46,
    lineHeight: 44,
    color: BRAND.white,
    // El paddingRight no tuvo ningún efecto (probado) — Android recorta el
    // texto según el ancho medido por StaticLayout, que no incluye el
    // padding del View. Lo que sí importa es el letterSpacing: Android
    // suma ese espaciado también DESPUÉS del último carácter (a diferencia
    // de como se ve en iOS), así que con -1 el "colchón" final quedaba en
    // negativo y el trazo itálico de la última letra (H de MATCH, S de
    // CARS) se recortaba. En Android se neutraliza a 0; en iOS se deja
    // igual que antes porque ahí nunca hubo problema.
    letterSpacing: Platform.OS === 'android' ? 0 : -1,
    fontStyle: 'italic',
    fontWeight: '900',
  },
  chainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chainBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: BRAND.orange,
  },
  link: {
    width: 18,
    height: 13,
    borderRadius: 7,
    borderWidth: 4,
    borderColor: BRAND.orange,
    marginHorizontal: -1,
  },
  linkOverlap: {
    marginLeft: -6,
  },
  tag: {
    marginTop: 14,
    fontFamily: FONT_DISPLAY ? 'Archivo' : undefined,
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.whiteDim,
    // Valor final fijo — letterSpacing no se anima más (ver useEffect):
    // aunque se corría con useNativeDriver:false, React Native seguía
    // tirando error porque no es una propiedad animable de forma confiable.
    letterSpacing: 3,
  },
});
