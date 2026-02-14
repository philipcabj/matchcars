import { Platform, Share } from 'react-native';

const ANDROID_LINK = "https://play.google.com/store/apps/details?id=com.matchcars.app";
const IOS_LINK = "https://apps.apple.com/app/id6757968664";
const WEB_BASE = "https://matchcars.app";

const getDownloadMessage = () => {
  return `\n\n📲 Descargá la App para la mejor experiencia:\nAndroid: ${ANDROID_LINK}\niOS: ${IOS_LINK}`;
};

/**
 * Comparte un vehículo con un formato estandarizado.
 * @param vehicle Objeto del vehículo (debe tener id, brand, model, price, currency)
 */
export const shareVehicle = async (vehicle: any) => {
  try {
    const url = `${WEB_BASE}/car/${vehicle.id}`;
    // Formato más limpio: Título, Datos clave, Link Web, Links App
    const title = `¡Mirá este ${vehicle.brand} ${vehicle.model} en MatchCars! 🚗💨`;
    const details = vehicle.price && vehicle.currency ? `${vehicle.currency} ${vehicle.price}` : '';
    
    const messageBody = [
      title,
      details,
      `Ver más detalles: ${url}`
    ].filter(Boolean).join('\n\n');

    await executeShare(messageBody, url);
  } catch (error) {
    console.error("Error sharing vehicle:", error);
  }
};

/**
 * Comparte un perfil de usuario/agencia.
 * @param uid ID del usuario
 * @param name Nombre a mostrar
 */
export const shareProfile = async (uid: string, name: string) => {
  try {
    const url = `${WEB_BASE}/user-profile/${uid}`;
    const title = `¡Mirá el perfil de ${name} en MatchCars! 🚗💨`;
    
    const messageBody = [
      title,
      `Ver inventario completo: ${url}`
    ].join('\n\n');

    await executeShare(messageBody, url);
  } catch (error) {
    console.error("Error sharing profile:", error);
  }
};

/**
 * Función interna para ejecutar el Share nativo manejando diferencias de plataforma
 */
const executeShare = async (mainMessage: string, mainUrl: string) => {
  const downloadLinks = getDownloadMessage();
  const fullMessage = `${mainMessage}${downloadLinks}`;

  if (Platform.OS === 'ios') {
    await Share.share({
      message: fullMessage,
      url: mainUrl, // iOS usa este campo para previsualizaciones o adjuntar el link
    });
  } else {
    // Android concatena todo en el mensaje
    await Share.share({
      message: fullMessage,
      title: 'MatchCars',
    });
  }
};
