# Guía de Implementación de Meta Analytics - Matchcars

## ✅ Cambios Realizados

### 1. Eventos Estándar Corregidos
Se actualizaron los nombres de eventos para usar los estándar de Meta:
- `fb_mobile_complete_registration` → `CompleteRegistration`
- `fb_mobile_content_view` → `ViewContent`

### 2. Nuevos Eventos Agregados
- `logCarView()` - Para trackear vistas de vehículos (ViewContent)
- `logContact()` - Para trackear contactos con vendedores (Contact)
- `logSearch()` - Para trackear búsquedas (Search)

### 3. Parámetros Estándar
Se agregaron parámetros estándar de Meta con prefijo `fb_`:
- `fb_content_type` - Tipo de contenido
- `fb_content_id` - ID del contenido
- `fb_currency` - Moneda
- `fb_value` - Valor monetario
- `fb_search_string` - Texto de búsqueda

### 4. Inicialización del SDK
Se creó `lib/metaSDK.ts` para inicializar el SDK correctamente al inicio de la app.

### 5. Variables de Entorno
Se actualizó `.env` con los valores correctos del App ID y Client Token.

## 📊 Eventos Disponibles

### Eventos Estándar (Optimizados para Meta Ads)

```typescript
// Registro de usuario
Analytics.logRegistration('email' | 'google' | 'apple');

// Vista de contenido (inicio de publicación)
Analytics.logStartPublication();

// Vista de vehículo
Analytics.logCarView(carId, brand, model, price, currency);

// Publicación de vehículo
Analytics.logCarPublished(brand, model, price, currency);

// Compra de plan PRO
Analytics.logPurchasePro(planId, price, currency);

// Contacto con vendedor
Analytics.logContact('whatsapp' | 'instagram', profileId);

// Búsqueda
Analytics.logSearch(searchString, contentType);

// Evento personalizado
Analytics.logEvent('EventName', { param1: 'value1' });
```

## 🎯 Mejores Prácticas

### 1. Usar Eventos Estándar Cuando Sea Posible
Los eventos estándar de Meta están optimizados para el algoritmo de ads:
- `CompleteRegistration` - Registro
- `ViewContent` - Vista de contenido
- `Search` - Búsqueda
- `AddToCart` - Agregar al carrito (usado para publicar auto)
- `Purchase` - Compra
- `Contact` - Contacto

### 2. Incluir Parámetros de Valor
Siempre que sea posible, incluye:
- `fb_currency` y `fb_value` para eventos con valor monetario
- `fb_content_type` y `fb_content_id` para identificar el contenido

### 3. Eventos Personalizados vs Estándar
- **Eventos Estándar**: Mejor para optimización de campañas de Meta
- **Eventos Personalizados**: Útiles para análisis interno específico

En `logCarPublished()` y `logPurchasePro()` se envían ambos tipos para tener lo mejor de ambos mundos.

## 🔍 Verificación de Eventos

### En Meta Events Manager
1. Ve a [Meta Events Manager](https://business.facebook.com/events_manager2)
2. Selecciona tu app (Matchcars - 1163293382582083)
3. Ve a "Test Events" para ver eventos en tiempo real
4. Usa la app y verifica que los eventos aparezcan

### Eventos de Prueba
Para probar en desarrollo, usa el Test Events tool:
```typescript
// En modo desarrollo, los eventos aparecerán en "Test Events"
Analytics.logEvent('test_event', { test: 'value' });
```

## 📱 Configuración por Plataforma

### iOS
- ✅ Configurado en `app.json` con `GoogleService-Info.plist`
- ✅ Permisos de tracking configurados en `infoPlist`
- ⚠️ Requiere que el usuario acepte el tracking (iOS 14+)

### Android
- ✅ Configurado en `app.json` con `google-services.json`
- ✅ Permisos configurados en `android.permissions`
- ✅ Incluye `com.google.android.gms.permission.AD_ID`

### Web
- ⚠️ El SDK de React Native no funciona en web
- 💡 Para web, considera usar Meta Pixel directamente

## 🚀 Próximos Pasos Recomendados

### 1. Agregar Más Eventos
Considera agregar tracking para:
- Favoritos (AddToWishlist)
- Inicio de checkout para planes PRO (InitiateCheckout)
- Compartir vehículos (Share)
- Filtros aplicados en búsqueda

### 2. Parámetros de Usuario
Agrega información del usuario cuando esté disponible:
```typescript
import { AppEventsLogger } from 'react-native-fbsdk-next';

// Cuando el usuario inicie sesión
AppEventsLogger.setUserID(userId);
AppEventsLogger.setUserData({
  email: userEmail,
  // No incluir datos sensibles
});
```

### 3. Conversiones Avanzadas
Para optimización avanzada de campañas:
- Configura eventos de conversión en Meta Ads Manager
- Define el valor de cada evento
- Crea audiencias personalizadas basadas en eventos

### 4. Deferred Deep Linking
El SDK ya está configurado con `scheme` en app.json, pero considera:
- Implementar manejo de deep links desde ads
- Trackear instalaciones desde campañas específicas

## 🐛 Troubleshooting

### Los eventos no aparecen en Events Manager
1. Verifica que el App ID sea correcto (1163293382582083)
2. Asegúrate de que la app esté en modo desarrollo en Meta
3. Revisa los logs de la consola para errores
4. En iOS 14+, verifica que el usuario haya aceptado el tracking

### Eventos duplicados
- Asegúrate de no llamar al mismo evento múltiples veces
- Revisa que no haya múltiples inicializaciones del SDK

### Parámetros no aparecen
- Verifica que uses los nombres estándar con prefijo `fb_`
- Asegúrate de que los valores sean del tipo correcto (string/number)

## 📚 Referencias

- [Meta App Events - Documentación Oficial](https://developers.facebook.com/docs/app-events)
- [react-native-fbsdk-next - GitHub](https://github.com/thebergamo/react-native-fbsdk-next)
- [Standard Events Reference](https://developers.facebook.com/docs/app-events/reference)
- [Meta Events Manager](https://business.facebook.com/events_manager2)
