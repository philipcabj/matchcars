# ✅ Solución al Error de Expo Router Handoff

## Error en Producción

```
Alert
Expo Head: Add the handoff origin to the Expo Config (requires rebuild).
Add the Config Plugin { plugins: [["expo-router", { origin: "...<URL>..." }]] }, 
where "origin" is the hosted URL.
```

## Causa del Error

El plugin `expo-router` estaba configurado sin opciones en `app.json`. En producción, cuando la app intenta usar la funcionalidad de **Handoff** (continuidad entre dispositivos Apple), necesita saber cuál es el dominio web asociado a la app.

### ¿Qué es Handoff?

Handoff es una funcionalidad de Apple que permite a los usuarios continuar una actividad desde un dispositivo a otro. Por ejemplo:
- Ver un auto en el iPhone y continuar en el iPad
- Abrir un link de la app en Safari y que se abra en la app nativa

## Solución Aplicada ✅

Se actualizó la configuración del plugin `expo-router` en `app.json`:

### ANTES:
```json
"plugins": [
  "expo-router",
  [
    "react-native-fbsdk-next",
    ...
  ]
]
```

### DESPUÉS:
```json
"plugins": [
  [
    "expo-router",
    {
      "origin": "https://matchcars.app"
    }
  ],
  [
    "react-native-fbsdk-next",
    ...
  ]
]
```

## ¿Por qué "https://matchcars.app"?

Este es el dominio configurado en:
1. `ios.associatedDomains`: `["applinks:matchcars.app"]`
2. `android.intentFilters`: Con host `matchcars.app`
3. El dominio real donde está hosteada tu web

## Verificación

✅ `app.json` es JSON válido  
✅ Plugin `expo-router` configurado con origin  
✅ Origin coincide con associated domains  
✅ Origin coincide con intent filters de Android  

## Próximos Pasos

**IMPORTANTE:** Este cambio requiere un nuevo build, ya que modifica la configuración nativa.

```bash
# Limpiar caché
npx expo start --clear

# Nuevo build de producción
eas build --profile production --platform ios
eas build --profile production --platform android
```

## Beneficios de esta Configuración

1. **Handoff funcional**: Los usuarios pueden continuar actividades entre dispositivos
2. **Deep linking mejorado**: Links universales funcionan correctamente
3. **SEO y compartir**: Los links compartidos se abren correctamente en la app
4. **Sin alertas en producción**: El error desaparece

## Configuración Relacionada

Esta configuración trabaja en conjunto con:

### iOS - Associated Domains
```json
"ios": {
  "associatedDomains": ["applinks:matchcars.app"]
}
```

### Android - Intent Filters
```json
"android": {
  "intentFilters": [
    {
      "action": "VIEW",
      "autoVerify": true,
      "data": [
        {
          "scheme": "https",
          "host": "matchcars.app",
          "pathPrefix": "/"
        }
      ]
    }
  ]
}
```

### Archivo apple-app-site-association

Para que funcione completamente en iOS, necesitas tener este archivo en tu servidor web:

**URL:** `https://matchcars.app/.well-known/apple-app-site-association`

**Contenido:**
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.com.matchcars.app",
        "paths": [
          "/car/*",
          "/user-profile/*",
          "/chat/*",
          "/"
        ]
      }
    ]
  }
}
```

**Nota:** Reemplaza `TEAM_ID` con tu Apple Team ID.

### Archivo assetlinks.json (Android)

Para Android, necesitas este archivo:

**URL:** `https://matchcars.app/.well-known/assetlinks.json`

**Contenido:**
```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.matchcars.app",
      "sha256_cert_fingerprints": [
        "SHA256_FINGERPRINT_DE_TU_KEYSTORE"
      ]
    }
  }
]
```

**Obtener el fingerprint:**
```bash
# Para el keystore de producción
keytool -list -v -keystore @fguarino__matchcars.jks -alias matchcars

# O desde EAS
eas credentials
```

## Testing

### Probar Deep Links en Desarrollo

```bash
# iOS
xcrun simctl openurl booted "https://matchcars.app/car/123"

# Android
adb shell am start -W -a android.intent.action.VIEW -d "https://matchcars.app/car/123" com.matchcars.app
```

### Probar en Producción

1. Envía un link por WhatsApp/Email: `https://matchcars.app/car/123`
2. Toca el link en el dispositivo
3. Debería abrir la app directamente (no Safari/Chrome)

## Troubleshooting

### El link abre en el navegador en lugar de la app

**iOS:**
1. Verifica que el archivo `apple-app-site-association` esté accesible
2. Verifica que el Team ID sea correcto
3. Reinstala la app (iOS cachea la configuración)

**Android:**
1. Verifica que el archivo `assetlinks.json` esté accesible
2. Verifica que el SHA256 fingerprint sea correcto
3. Verifica que `autoVerify: true` esté en los intent filters

### El error sigue apareciendo

Si después del nuevo build el error persiste:
1. Desinstala completamente la app
2. Reinstala desde el nuevo build
3. Verifica que la versión sea la correcta

## Estado Final

🟢 **CONFIGURACIÓN COMPLETA** - El plugin expo-router está correctamente configurado.

⚠️ **REQUIERE REBUILD** - Debes generar un nuevo build para que los cambios tomen efecto.

📝 **OPCIONAL** - Configura los archivos `.well-known` en tu servidor web para deep linking completo.
