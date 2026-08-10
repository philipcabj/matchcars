# Portal de Agencias — Matchcars

App Next.js standalone (no toca `app/`, la app mobile/web actual). Vive en su
propia carpeta con su propio `package.json` — cero riesgo para el proyecto
Expo existente.

## Qué hay hoy

- **Modelo de planes** (`src/lib/plans.ts`): features (copiado de
  `lib/planChecks.ts` de la raíz) + **asientos de equipo por plan** y
  **roles de agencia** (owner/manager/sales con permisos), que no existían antes.
- **Multi-usuario real por agencia**: un miembro invitado tiene su propio login
  (uid distinto al dueño). `agencyMemberships/{uid} -> {agencyId, role}` es el
  índice inverso que resuelve "a qué agencia pertenezco" (`src/lib/agency-server.ts`).
  Todos los endpoints de agencia/stock/leads resuelven `agencyId` así, no
  asumen que el que llama es siempre el dueño.
- **Login** (`/login`) + **panel con sidebar** (`/dashboard`), tema **claro
  forzado** (antes seguía el modo oscuro del SO, se sacó a pedido).
- **Mi Agencia** (`/dashboard`): plan, avatar/logo de la agencia, autos activos
  vs. límite, equipo vs. asientos, features del plan.
- **Stock** (`/dashboard/stock`): listado con filtros por estado (Todos/
  Publicados/En revisión/Vendidos/Rechazados) y orden (reciente/precio/
  marca-modelo). Cada auto tiene **detalle de solo lectura** (`/stock/[id]`:
  fotos, specs, motivo de rechazo si aplica, vistas/likes, historial de
  precio) separado de **edición** (`/stock/[id]/edit`) — antes esa ruta era
  directamente el formulario de edición, sin forma de solo "ver". Alta en
  `/stock/new`. El formulario incluye **sugerencia de precio de mercado**
  (portado de `lib/pricing.ts`) igual que en la app. Reemplaza a
  `WebDealerAddCarForm.tsx` para el portal: mismo shape de datos en `vehicles`
  (100% compatible con lo que ya renderiza la app), pero la escritura pasa por
  `/api/agency/vehicles` (Admin SDK) en vez de que el cliente escriba directo
  a Firestore.
- **Equipo** (`/dashboard/team`): agregar un usuario de Matchcars *ya
  existente* por email (no es invitación por correo — busca la cuenta y la
  suma), cambiar rol, quitar. Respeta los asientos incluidos en el plan.
- **Leads** (`/dashboard/leads`): listado + KPIs (total/nuevos/negociando/
  vendidos/conversión/ingresos), filtro por estado, avanzar estado
  (nuevo→contactado→negociación) o marcar perdido. **"+ Agregar lead"**: carga
  manual (nombre/teléfono/email/auto/notas) para consultas por teléfono,
  WhatsApp o en el local — esto **no existe en ningún lado hoy, ni en la
  app**: ahí un lead se crea 100% automático (primer mensaje de chat o una
  oferta formal), y el portal no tiene chat, así que sin esto la pantalla
  nunca se hubiera llenado sola. Los leads manuales quedan con `buyerId: ""` y
  un campo nuevo `manualContact` (no rompe nada de lo que la app ya lee).
- **Reportes** (`/dashboard/reports`): autos activos, vistas totales, me gusta
  totales, días promedio en stock, desglose por estado y ranking de más
  vistos — todo derivado de campos que ya existen en cada auto
  (`views`/`likesCount`/`status`/`createdAt`). A propósito **no hay gráfico de
  tendencia**: no se guarda ninguna serie de tiempo en ningún lado, así que
  cualquier "evolución en el tiempo" sería inventada — mejor no mostrarlo que
  mostrar un dato falso.
- **Carga masiva CSV** (`/dashboard/stock/import`): sube CSV+ZIP de fotos a
  Storage y llama a la Cloud Function `startBulkImport` (sin tocar) que ya
  hacía todo el procesamiento server-side — el portal solo agrega la pantalla
  de upload y progreso. **Restringido al dueño real de la cuenta** (no a
  miembros de equipo): la función usa `request.auth.uid` como dueño de los
  autos que crea, sin concepto de "agencia", así que si la usara un miembro
  invitado los autos quedarían mal atribuidos.
- **Perfil de agencia** (`/dashboard/profile`): logo, marca de agua, nombre,
  contacto, ubicación, horario. Hallazgo: la marca de agua **no necesitó
  código nuevo** — es una Cloud Function (`autoEnhancePhoto`, disparada por
  Storage, sin tocar) que ya procesa cualquier foto subida a `uploads/{uid}/`
  sin importar qué cliente la subió, portal incluido. Lo único que faltaba era
  dónde activarla: antes solo se podía desde `edit-profile.tsx` de la app.
  Esta pantalla llena ese hueco (y de paso cubre más del perfil público que
  tampoco se podía editar desde acá). El logo sube a `logos/{uid}_...` (mismo
  path que la app, a propósito fuera de `uploads/` para no disparar el
  auto-enhance sobre el logo mismo).
- `firestore.rules` (raíz del repo): bloques nuevos y aditivos para
  `agencies/{agencyId}`, `agencies/{agencyId}/members`, `agencyMemberships`.
  Ninguna regla existente se tocó. **No hace falta deployarlas todavía**: todo
  lo que construí acá pasa por rutas del backend (Admin SDK), que siempre
  bypassea las reglas — solo importarían si en el futuro algo lee/escribe
  estas colecciones directo desde el cliente.
- **Manejo de errores robusto en toda la API** (`src/lib/api-handler.ts`,
  `src/lib/api-client.ts`): antes, si una ruta tiraba una excepción no
  controlada, Next.js (en dev) devolvía una página HTML de error, y el cliente
  explotaba con `Unexpected token '<'...` — un error ilegible que no decía qué
  había pasado realmente (así se vio el bug real al probar "avanzar" un lead).
  Ahora toda excepción vuelve como JSON con status 500 y se loguea en la
  terminal del `npm run dev` con la ruta exacta — así el próximo error real es
  diagnosticable de un vistazo, no una adivinanza.

### Gaps conocidos, dejados afuera a propósito

- Stock: no reevalúa riesgo (`lib/riskScoring.ts`, no portado), no notifica al
  admin al publicar (`lib/admin-notifications.ts`, no portado), catálogo de
  marca/modelo/versión solo estático (no lee el catálogo dinámico de Firestore).
- Leads: no incluye negociar ofertas (aceptar/rechazar/contraofertar) ni
  "marcar vendido" con precio de cierre — eso vive en el flujo de venta de
  `mycars.tsx` de la app, no portado.
- Equipo: agregar miembro requiere que la persona ya tenga cuenta en Matchcars
  (no hay invitación por email todavía).

## Cómo correrlo en local

**Con datos de prueba, sin tocar producción (recomendado):** todo corre contra
el Firebase Emulator Suite mientras `.env.local` tenga
`NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` (es el default).

1. **Requisito: Java 21+** para el emulador de Firestore (esta máquina tenía
   solo Java 8 — instalar un JDK 21 LTS, ej. Temurin).
2. Desde la raíz del repo: `firebase emulators:start --only auth,firestore --project matchcars-a7847`
3. Desde `portal/`: `npm run seed:emulator` (crea agencia demo `dealer@demo.matchcars.local` / `Demo1234!`, plan `pro_dealer_monthly`, 3 autos).
4. Desde `portal/`: `npm run dev` → http://localhost:3000

**Con tu cuenta real (lo que se usó para probar hoy):** en `.env.local`,
comentar las 3 líneas de emulador y descomentar
`FIREBASE_SERVICE_ACCOUNT_PATH=../credentials.json`. Ojo: en este modo, alta/
edición en Stock y acciones de Equipo/Leads **escriben de verdad en
producción** — igual que si lo hicieras desde la app.

## Verificado hasta ahora

✅ `npm run build` y `npm run lint` limpios (19 rutas, 0 errores, 0 warnings).
✅ Probado en vivo contra producción real (con cuenta real del dueño del
proyecto): login, Mi Agencia, y feedback de diseño ya incorporado (tema claro,
avatar, sugerencia de precio).
⚠️ Bug real encontrado probando "avanzar" un lead en vivo: una excepción sin
capturar en la ruta volvía como HTML en vez de JSON. Arreglado con
`withApiErrors` en todas las rutas de la API — si vuelve a fallar algo, ahora
el error real aparece en la terminal del `npm run dev`.

⚠️ Todavía sin probar en vivo con datos reales: Equipo, Leads (incl. lead
manual), Carga masiva, Perfil de agencia y el Stock rediseñado (detalle/
filtros/orden) — se construyeron y verificaron por build/tipo, pero no se
ejercitaron clickeando en el navegador contra datos
reales todavía.

## Checklist de lo que promete cada plan (dealer)

| Prometido | Estado |
|---|---|
| Autos activos (límite) | ✅ |
| Video walkaround | ✅ |
| CRM de Leads | ✅ (parcial, ver gaps) |
| Acceso Web | ✅ (este portal) |
| Carga masiva CSV | ✅ |
| Destacados ilimitados | ✅ automático al publicar, falta UI para destacar/sacar destacado a mano |
| Marca de agua con logo | ✅ |
| Mejorar foto (encuadre IA) | ❌ |
| Tapar patente automáticamente (IA) | ❌ |
| Reportes avanzados / Métricas | ✅ |
| Gestión de cierre de ventas | ❌ |
| Ficha PDF con QR (Pro+) | ❌ |

## Próximos pasos posibles

- Probar Equipo, Leads, Carga masiva y Perfil en el navegador con datos reales.
- Seguir bajando el checklist de arriba (reportes/métricas es lo que sigue).
- Invitación de equipo por email (hoy requiere que la cuenta ya exista).
- Negociación de ofertas y "marcar vendido" en Leads.
- Cuando el diseño convenza: link puntual desde la app actual ("Abrí tu Panel
  de Agencia") — recién ahí se conecta con producción real de forma visible
  para usuarios de verdad.
- Deploy de prueba a `portal.matchcars.app` (Firebase Hosting, sitio/target
  nuevo) — todavía no configurado.
- Frontend público (sitio de consumidores): decidido posponer hasta terminar
  lo de arriba. Primer pedacito sugerido cuando arranque: formulario de
  contacto en la ficha del auto, que alimenta directo el CRM de Leads.
