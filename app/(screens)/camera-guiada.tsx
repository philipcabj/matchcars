import { useTheme } from "@/contexts/ThemeContext";
import { setGuidedPhotos } from "@/lib/cameraHandoff";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Las 8 tomas que se le piden a un vendedor. La primera es la portada.
const SHOTS: { key: string; label: string; tip: string }[] = [
  { key: "frente", label: "Frente", tip: "De frente, el auto centrado y completo." },
  { key: "34-del", label: "3/4 delantero", tip: "Desde una esquina delantera, para ver frente y lateral." },
  { key: "lateral", label: "Lateral", tip: "De costado, todo el auto en el cuadro." },
  { key: "34-tras", label: "3/4 trasero", tip: "Desde una esquina trasera." },
  { key: "interior", label: "Interior", tip: "Butacas delanteras y tablero desde la puerta." },
  { key: "tablero", label: "Tablero", tip: "El tablero con el cuentakilómetros visible." },
  { key: "motor", label: "Motor", tip: "Capó abierto, motor completo." },
  { key: "baul", label: "Baúl", tip: "Baúl abierto y vacío si se puede." },
];

export default function CameraGuiadaScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [photos, setPhotos] = useState<(string | null)[]>(Array(SHOTS.length).fill(null));
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);

  const takenCount = photos.filter(Boolean).length;
  const shot = SHOTS[current];

  const finish = () => {
    const uris = photos.filter((u): u is string => !!u);
    if (uris.length === 0) {
      router.back();
      return;
    }
    setGuidedPhotos(uris);
    router.back();
  };

  const capture = async () => {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    try {
      const pic = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (pic?.uri) {
        setPhotos((prev) => {
          const next = [...prev];
          next[current] = pic.uri;
          return next;
        });
        // Avanzar a la próxima toma sin foto.
        setCurrent((c) => {
          const nextEmpty = photos.findIndex((p, i) => i > c && !p);
          return nextEmpty >= 0 ? nextEmpty : c;
        });
      }
    } catch {
      // silencioso — el usuario reintenta
    } finally {
      setBusy(false);
    }
  };

  if (!permission) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 }}>
        <Ionicons name="camera-outline" size={48} color={theme.textMuted} />
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700", textAlign: "center" }}>
          Necesitamos acceso a la cámara
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: "center" }}>
          Para sacar las fotos de tu auto con la guía paso a paso.
        </Text>
        <TouchableOpacity onPress={requestPermission} style={{ backgroundColor: theme.accent, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 11 }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Permitir cámara</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>Volver</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />

      {/* Overlay */}
      <SafeAreaView style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
            {takenCount} / {SHOTS.length} fotos
          </Text>
          <TouchableOpacity onPress={finish} hitSlop={10} disabled={takenCount === 0}>
            <Text style={{ color: takenCount === 0 ? "#ffffff66" : "#fff", fontWeight: "700", fontSize: 15 }}>Listo</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 12, marginHorizontal: 16, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 14, padding: 12 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>
            {current + 1}. {shot.label}
            {current === 0 ? "  · portada" : ""}
          </Text>
          <Text style={{ color: "#e5e7eb", fontSize: 13, marginTop: 2 }}>{shot.tip}</Text>
        </View>
      </SafeAreaView>

      {/* Guía de encuadre */}
      <View pointerEvents="none" style={{ position: "absolute", top: "30%", left: "8%", right: "8%", bottom: "30%", borderWidth: 2, borderColor: "rgba(255,255,255,0.55)", borderRadius: 12, borderStyle: "dashed" }} />

      {/* Bottom bar */}
      <SafeAreaView style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 10 }}
        >
          {SHOTS.map((s, i) => (
            <Pressable
              key={s.key}
              onPress={() => setCurrent(i)}
              style={{
                width: 56,
                height: 56,
                borderRadius: 8,
                overflow: "hidden",
                borderWidth: i === current ? 2 : 1,
                borderColor: i === current ? theme.accent : "rgba(255,255,255,0.4)",
                backgroundColor: "rgba(255,255,255,0.12)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {photos[i] ? (
                <Image source={{ uri: photos[i]! }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
              ) : (
                <Text style={{ color: "#fff", fontSize: 9, textAlign: "center", paddingHorizontal: 2 }}>{s.label}</Text>
              )}
            </Pressable>
          ))}
        </ScrollView>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingBottom: Platform.OS === "ios" ? 8 : 18, gap: 40 }}>
          <TouchableOpacity
            onPress={() => setCurrent((c) => Math.max(0, c - 1))}
            disabled={current === 0}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={30} color={current === 0 ? "#ffffff44" : "#fff"} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={capture}
            disabled={busy}
            style={{ width: 74, height: 74, borderRadius: 37, borderWidth: 5, borderColor: "#fff", alignItems: "center", justifyContent: "center" }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: photos[current] ? theme.accent : "#fff" }} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setCurrent((c) => Math.min(SHOTS.length - 1, c + 1))}
            disabled={current === SHOTS.length - 1}
            hitSlop={10}
          >
            <Ionicons name="chevron-forward" size={30} color={current === SHOTS.length - 1 ? "#ffffff44" : "#fff"} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}
