# Evidentia Revalida v1 — runbook de publicación

Estado de este documento: **preparación local validada el 8 de agosto de 2026**. No equivale a
un despliegue ni a una aprobación de las tiendas. La publicación queda autorizada solo cuando
todos los ítems `NO-GO` de la tabla final estén cerrados con evidencia.

## Fuente de verdad de la release

- Bundle/package: `com.evidentia.revalida`.
- Versión comercial: `1.0.0`; build/versionCode actual: `2`. Si build 2 ya existe en una consola,
  incrementar antes de subir.
- Productos permitidos, idénticos en app, backend y tiendas:
  - `com.evidentia.revalida.access.30d`
  - `com.evidentia.revalida.access.90d`
  - `com.evidentia.revalida.access.180d`
- Apple: **Non-Renewing Subscription** de plazo fijo, sin renovación automática.
- Google: producto `SUBS` con base plan **Prepaid** de 1, 3 o 6 meses, sin renovación automática
  y sin ofertas. Los IDs conservan 30d/90d/180d; la expiración autoritativa es la informada por
  Google Play.
- PWA pública: muestra gratuita de 40 preguntas. El corpus comercial nunca se despliega como HTML
  público ni se versiona en el repositorio público.
- Cifras publicables: 600 preguntas, 6 ediciones, 600 justificativas, 526 con referencias
  catalogadas, 74 sin referencia catalogada y 30 figuras.

La copia de las fichas vive en `produto/metadados_lojas.json`; el contrato técnico de compra está
en `produto/CONTRATO_COMPRAS_NATIVAS.md` y la evidencia editorial en
`produto/RELATORIO_CORRECOES_CONTEUDO_2026-08-08.md`.

## 1. Preflight local reproducible

Ejecutar sobre el commit exacto que se quiere publicar:

```bash
cd /ruta/segura/evidentia-revalida
npm ci
python3 scripts/22_validar_metricas_produto.py
python3 scripts/23_validar_claims_comerciais.py
python3 scripts/24_validar_metadados_lojas.py
python3 scripts/25_verificar_conteudo_publico.py --self-test
python3 scripts/25_verificar_conteudo_publico.py
npm test
npm audit --audit-level=high

cd app-desktop && npm ci && npm audit --audit-level=high && cd ..
cd app-android && npm ci && npm audit --audit-level=high && cd ..

cd nuvem/supabase
deno check --config deno.json functions/*/index.ts functions/_shared/*.ts
deno test --config deno.json functions/_shared/*_test.ts
bash tests/rodar_testes.sh
```

El gate editorial completo (seis PDF oficiales, hashes y comparación 600/600) se ejecuta solo en
el repositorio/CI privado mediante `produto/ci-privada/qualidade-editorial.yml.example`. No se
convierte una fuente ausente en `skip` ni se copia el corpus a CI público.

## 2. Supabase y secretos

No dar por desplegado ningún archivo por estar presente en Git. Verificar primero el proyecto y
guardar un backup lógico de producción. Aplicar migraciones en staging y después en producción:

```bash
cd nuvem
supabase link --project-ref flnawwzkmttsxuozjwar
supabase db push --dry-run
supabase db push
```

Secretos requeridos; cargarlos desde un gestor/archivo fuera del repositorio y nunca imprimirlos
en logs o capturas:

| Ámbito | Secretos |
|:--|:--|
| Licencia | `REVALIDA_CHAVE_PRIVADA`, `REVALIDA_DIAS_LICENCA` |
| Apple API | `APPLE_APP_STORE_ISSUER_ID`, `APPLE_APP_STORE_KEY_ID`, `APPLE_APP_STORE_PRIVATE_KEY`, `APPLE_BUNDLE_ID`, `APPLE_APP_STORE_ENVIRONMENT` |
| Apple Notifications V2 | `APPLE_APP_ID`, `APPLE_ROOT_CA_CERTIFICATES_BASE64` (array JSON de certificados raíz Apple en DER/base64) |
| Google Play API | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_PACKAGE_NAME` |
| Google RTDN | `GOOGLE_PUBSUB_AUDIENCE`, `GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PUBSUB_SUBSCRIPTION` |
| Checkout web | credenciales de dLocal Go solo si se habilita ese canal |

Desplegar funciones de usuario con verificación JWT. Las dos notificaciones de tienda son la única
excepción: Apple y Pub/Sub no envían un JWT de Supabase; se despliegan con gateway JWT desactivado
porque verifican criptográficamente JWS Apple u OIDC Google dentro del handler.

```bash
supabase functions deploy validar-compra-nativa --project-ref flnawwzkmttsxuozjwar
supabase functions deploy emitir-licenca --project-ref flnawwzkmttsxuozjwar
supabase functions deploy excluir-conta --project-ref flnawwzkmttsxuozjwar
supabase functions deploy notificacao-app-store --no-verify-jwt --project-ref flnawwzkmttsxuozjwar
supabase functions deploy notificacao-google-play --no-verify-jwt --project-ref flnawwzkmttsxuozjwar
```

Programar una ejecución diaria de `public.revalida_aplicar_retencao_completa()` y alertar por
errores. Antes de abrir ventas, ejecutar consultas de reconciliación sobre compras pendientes,
eventos de tienda en `erro_temporario` y licencias activas sin compra/plan válido.

## 3. App Store Connect y TestFlight

1. Terminar la verificación de Apple Developer, aceptar contratos bancarios/fiscales y crear la app
   con bundle `com.evidentia.revalida`.
2. Crear los tres productos en **Monetization → Subscriptions → Non-Renewing Subscriptions**.
   Configurar nombre, plazo, precio y localización pt-BR. La primera suscripción no renovable se
   envía junto con una versión nueva de la app.
3. Crear la clave de In-App Purchase para App Store Server API; cargar sus IDs y `.p8` únicamente
   como secretos del backend.
4. Configurar App Store Server Notifications **V2**:
   - producción: `https://flnawwzkmttsxuozjwar.supabase.co/functions/v1/notificacao-app-store`;
   - sandbox: la misma URL durante la fase de pruebas;
   - solicitar una notificación `TEST` y comprobar procesamiento/idempotencia antes de venta.
5. Completar App Privacy de forma coherente con `App/PrivacyInfo.xcprivacy` y la política:
   e-mail, ID de usuario, historial de compras y otros diagnósticos; vinculados a la cuenta,
   usados para funcionalidad, sin tracking. No declarar salud, ubicación, publicidad ni respuestas
   de estudio porque no se envían al servidor.
6. Usar la política, soporte, copy y capturas definidos en `produto/metadados_lojas.json`. Probar
   todas las URL sin sesión. Proporcionar una cuenta de revisión integral que no expire.
7. Preparar y abrir el workspace:

```bash
cd app-android
npm run prepare:ios
open ios/App/App.xcworkspace
```

8. En Xcode seleccionar el Team, revisar `1.0.0 (2)`, ejecutar tests, `Product → Archive` y subir a
   TestFlight. No subir el build genérico sin firma usado por CI local.
9. En Sandbox/TestFlight probar compra de cada plazo, cancelación del diálogo, Ask to Buy/pending,
   restauración, reinstalación, backend temporalmente caído y refund/revoke. La transacción solo se
   finaliza después de que el backend devuelve `ativo: true`.

Referencias: [suscripciones no renovables](https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/create-non-renewing-subscriptions/),
[envío del primer IAP](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase/),
[Notifications V2](https://developer.apple.com/documentation/appstoreservernotifications/enabling-app-store-server-notifications) y
[privacy manifests](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files).

## 4. Google Play Console e internal testing

1. Completar la cuenta de desarrollador/verificación, crear la app con package inmutable
   `com.evidentia.revalida` y activar Google Play App Signing.
2. Crear una upload key en almacenamiento seguro. Definir para el build:

```bash
export EVIDENTIA_ANDROID_KEYSTORE="/ruta/segura/evidentia-upload.jks"
export EVIDENTIA_ANDROID_KEYSTORE_PASSWORD="..."
export EVIDENTIA_ANDROID_KEY_ALIAS="evidentia-upload"
export EVIDENTIA_ANDROID_KEY_PASSWORD="..."
cd app-android
npm run build:aab
```

El build falla deliberadamente sin estas cuatro variables. Nunca subir el AAB creado con
`-PallowUnsignedRelease=true`; sirve solo para comprobar compilación.

3. Crear tres subscriptions con los IDs exactos y un único base plan `Prepaid`: 1 mes, 3 meses y
   6 meses respectivamente. No crear offers ni activar autorrenovación. Habilitar Brasil y los
   precios/localizaciones definitivos.
4. Vincular la service account a Google Play Developer API con el mínimo permiso necesario.
5. Configurar RTDN:
   - crear topic Pub/Sub y dar `Pub/Sub Publisher` a
     `google-play-developer-notifications@system.gserviceaccount.com`;
   - crear push subscription autenticada hacia
     `https://flnawwzkmttsxuozjwar.supabase.co/functions/v1/notificacao-google-play`;
   - fijar la audiencia OIDC y la service account de push exactamente iguales a los secretos;
   - mantener el payload Pub/Sub envuelto (no activar `No wrapper`) y guardar en
     `GOOGLE_PUBSUB_SUBSCRIPTION` el nombre `projects/.../subscriptions/...` completo;
   - seleccionar suscripciones y voided purchases, enviar el mensaje de prueba y comprobar 2xx.
6. Completar Data safety con e-mail, ID de usuario, compras y diagnósticos técnicos para
   funcionalidad, cifrados en tránsito, sin venta/ads/tracking. URL de eliminación:
   `https://idarragaa21-prog.github.io/evidentia-revalida/excluir-conta/`.
7. Subir primero a **Internal testing**, añadir license testers y probar la matriz de la sección 6.

Referencias: [base plans Prepaid](https://support.google.com/googleplay/android-developer/answer/140504),
[RTDN](https://developer.android.com/google/play/billing/getting-ready),
[OIDC para push](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions),
[Data safety](https://support.google.com/googleplay/android-developer/answer/10787469) y
[eliminación de cuenta](https://support.google.com/googleplay/android-developer/answer/13327111).

## 5. PWA, checkout y repositorios

- Generar la muestra pública solo desde el entorno editorial privado:

```bash
python3 scripts/08_montar_aplicativo.py --edicao livre
python3 scripts/09_montar_pwa.py --edicao livre
python3 scripts/25_verificar_conteudo_publico.py
```

- El workflow público despliega el `app-web/` ya generado; no reconstruye desde un corpus que no
  debe existir en ese repositorio.
- Probar `/`, `/assinar/`, `/assinar/termos.html`, `/privacidade/` y `/excluir-conta/` después del
  deploy. No activar dLocal hasta cerrar KYC, secretos, webhook, pago y reembolso sandbox.
- El repositorio remoto actual fue público y su historial contiene el bundle/corpus premium bajo
  una licencia MIT anterior. Quitar archivos del `HEAD` y cambiar la licencia ahora no revoca
  permisos ni copias previas. Antes de cobrar se debe privatizar el repositorio comercial y mover
  el sitio público a un repositorio limpio, o ejecutar una estrategia equivalente revisada. No
  reescribir historia ni cambiar visibilidad sin confirmar primero el impacto sobre GitHub Pages.

## 6. Matriz obligatoria de aceptación

| Caso | Resultado exigido |
|:--|:--|
| Cuenta nueva / confirmación / login | flujo completo sin filtrar si un e-mail existe |
| Compra 30d, 90d, 180d | precio de la tienda, backend autoritativo, acceso y licencia correctos |
| Cancelar o pending | cero acceso y mensaje no alarmista; reintento posible |
| Backend/tienda indisponible | comprobante pendiente, nunca acceso por confianza en cliente |
| Replay misma cuenta | idempotente; no duplica ni extiende dos veces |
| Replay/copia en otra cuenta | rechazo y auditoría, sin revelar propietario |
| Restaurar y reinstalar | revalida en backend; no activa solo por respuesta local |
| Offline | acceso durante la ventana de licencia; respuestas/historial quedan locales |
| Refund/revoke Apple | notificación V2 verificada, acceso y licencias revocados una vez |
| Cancel/expire/refund Google | RTDN + `subscriptionsv2.get`; CANCELED conserva acceso hasta expiry |
| Eliminar cuenta activa, vencida y sin compra | opción siempre visible; anonimización y login inválido |
| Accesibilidad | VoiceOver/TalkBack, foco, Dynamic Type/zoom, dark mode y controles de 44 px |
| Red | sin HTTP claro, sin CSP violations, sin secretos/tokens en logs o almacenamiento web |

Guardar evidencia con fecha, build, ambiente y transaction IDs truncados; nunca guardar JWS,
purchaseToken, contraseña, `.p8`, service account JSON o e-mail completo en tickets/capturas.

## 7. Observación y rollback

- Revisar logs de Edge Functions y la tabla de notificaciones por error temporal/permanente,
  latencia, reintentos y eventos ocupados. Alertar por acumulación, no por datos personales.
- Conciliar diariamente compras verificadas, expiraciones, reembolsos y licencias activas.
- Ante fallo de compras: desactivar productos/venta nueva en la consola, mantener restauración y
  soporte, corregir backend y revalidar recibos. No conceder acceso global ni saltar verificación.
- Ante problema de contenido: desactivar la versión/venta afectada, conservar evidencia editorial
  y publicar corrección versionada; no editar silenciosamente una respuesta oficial.
- Rollback de app mediante release anterior de tienda; rollback de función mediante deploy del
  commit anterior compatible con el esquema. Las migraciones son forward-only y necesitan plan de
  reversión probado antes de producción.

## 8. Go / no-go

| Estado actual | Gate | Evidencia de salida |
|:--:|:--|:--|
| **NO-GO P0** | Repositorio/historial público expuso corpus y licencia MIT | repo comercial privado + sitio público limpio; validar Pages y `git ls-files` |
| **NO-GO P0** | Derechos de explotación comercial de preguntas/figuras INEP | dictamen de abogado brasileño de PI o autorización escrita aplicable al uso exacto |
| **NO-GO P0** | Apple Developer está pendiente y no hay firma/ASC configurado | Team activo, contratos, productos, secretos, V2 test y TestFlight verde |
| **NO-GO P0** | Falta confirmar cuenta Google, upload key y catálogo | Play App Signing, AAB firmado, productos, RTDN y internal test verdes |
| **NO-GO P0** | Backend nuevo no fue desplegado por esta entrega | migrations/functions/secrets en staging+prod, smoke tests y rollback registrados |
| **NO-GO P1** | Capturas finales dependen del flujo nativo configurado | seis imágenes reales por plataforma, dimensiones y copy del JSON validados |
| **NO-GO P1** | Venta web depende de KYC/procesador | sandbox pago→acceso→reembolso completo o checkout mantenido inactivo |
| **GO técnico local** | Código, UI, contenido y builds sin firma | matriz automática verde y artefactos inspeccionados para el commit candidato |

La orden correcta es: cerrar PI/repositorio → configurar staging/tiendas → probar compras y
reembolsos reales en sandbox → firmar/capturar → revisión interna → publicar por etapas. Saltar un
`NO-GO P0` pone en riesgo ingresos, derechos de contenido o aprobación de la tienda.
