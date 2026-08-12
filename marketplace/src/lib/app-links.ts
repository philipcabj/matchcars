// marketplace/src/lib/app-links.ts
// Links de tienda compartidos entre el home y la ficha de auto.
export const APPLE_URL = "https://apps.apple.com/ar/app/matchcars/id6757968664";
export const PLAY_URL = "https://play.google.com/store/apps/details?id=com.matchcars.app";

// Deep link "abrir en la app" (botón "Ver/Hacer una oferta en la app").
//
// El plan final es que matchcars.app/car|user-profile|agencia sea la ficha
// propia de este marketplace y la app transaccional (Expo web) viva bajo
// /app — pero ese rebuild + corte de DNS todavía no se hizo (queda
// coordinado aparte). Hasta entonces, matchcars.app en producción sigue
// siendo el build viejo, que no conoce el prefijo /app — y son justo los
// paths SIN prefijo (/car/{id}, /user-profile/{uid}, /agencia/{slug}) los
// que ya usa la propia app para sus links de compartir (ver
// app/(screens)/user-profile/[uid].tsx, app/car/[id].tsx) y los que tiene
// registrados como Android App Links / iOS Universal Links (app.json) — así
// que con la app instalada esto abre la app nativa directo, y sin la app
// instalada cae en el sitio viejo tal cual está hoy. Cuando se haga la
// migración coordinada, esto pasa a necesitar el prefijo /app.
export function legacyAppUrl(path: string): string {
  return `https://matchcars.app${path}`;
}
