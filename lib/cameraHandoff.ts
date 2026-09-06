// lib/cameraHandoff.ts
// Traspaso de las fotos sacadas en la cámara guiada (app/(screens)/camera-guiada)
// de vuelta a la pantalla de publicar (app/(screens)/add-car). expo-router no
// pasa arrays por params de forma cómoda, así que se usa este singleton: la
// cámara guarda las URIs y add-car las consume al recuperar el foco.
let pending: string[] | null = null;

export function setGuidedPhotos(uris: string[]) {
  pending = uris;
}

export function takeGuidedPhotos(): string[] | null {
  const p = pending;
  pending = null;
  return p;
}
