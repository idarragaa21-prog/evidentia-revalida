# Contrato de compras nativas

Estado: contrato backend implementado; falta configurar productos/secretos y desplegar. Este documento no autoriza a confiar en datos del cliente.

## Regla de seguridad

El aplicativo no activa acceso por haber recibido un JWS, `purchaseToken` o callback de éxito. Envía el comprobante al backend autenticado; el backend consulta la API oficial de la tienda y solo entonces crea la suscripción. Después de `{ "ativo": true }`, el cliente puede finalizar/acknowledge la transacción y llamar a `emitir-licenca`.

Si faltan credenciales o la tienda está temporalmente indisponible, el comprobante queda como `pendente_verificacao`. No se guarda el JWS ni el `purchaseToken` en claro: únicamente SHA-256 para idempotencia. El cliente conserva la transacción unfinished/unacknowledged y reintenta.

## Endpoint único

`POST /functions/v1/validar-compra-nativa`

Cabeceras:

```http
Authorization: Bearer <access_token de Supabase>
apikey: <chave publicável>
Content-Type: application/json
```

Cuerpo estable:

```json
{
  "platform": "apple",
  "productId": "com.evidentia.revalida.access.180d",
  "transactionId": "2000000123456789",
  "signedTransaction": "eyJ...",
  "purchaseToken": null
}
```

- `platform`: `apple` o `google`.
- `productId`: identificador exacto configurado en la tienda y en `public.produtos_loja`.
  La allowlist de servidor es cerrada: `com.evidentia.revalida.access.30d`,
  `com.evidentia.revalida.access.90d` y `com.evidentia.revalida.access.180d`.
  Cualquier otro valor se rechaza antes de persistir el comprobante.
- `transactionId`: identificador informado por StoreKit/Billing. Es candidato; nunca fuente de verdad.
- `signedTransaction`: requerido para Apple. Se usa para integridad de transporte/idempotencia, pero no concede acceso por sí solo.
- `purchaseToken`: requerido para Google. Nunca se persiste en claro.

Respuesta verificada:

```json
{ "ativo": true }
```

Respuesta reintentable, HTTP `202`:

```json
{ "ativo": false, "pendente": true, "motivo": "credenciais_apple_ausentes" }
```

Respuesta definitiva inválida, HTTP `400`, `403` o `422`:

```json
{ "ativo": false, "motivo": "compra_nao_vinculada_a_conta" }
```

La respuesta nunca devuelve tokens, payloads del proveedor, emails ni claves internas.

## Apple

1. El cliente inicia StoreKit 2 con `appAccountToken = UUID(user.id de Supabase)`.
2. Envía `transaction.id` y `transaction.jwsRepresentation`.
3. El backend autentica la sesión y consulta `GET /inApps/v1/transactions/{transactionId}` en App Store Server API usando JWT ES256 de In-App Purchase.
4. Solo acepta la respuesta de Apple cuando `bundleId`, `productId`, `transactionId` y `appAccountToken` coinciden; la transacción no está revocada y su expiración, si existe, es futura.
5. Producción se consulta primero; sandbox solo se usa según `APPLE_APP_STORE_ENVIRONMENT` y el error oficial de transacción no encontrada.
6. Después de persistir el entitlement, devuelve `ativo=true`; recién entonces el plugin ejecuta `finish()`.

El JWS del cliente nunca se valida “a ojo” ni se decodifica para conceder acceso. La fuente autoritativa es [App Store Server API — Get Transaction Info](https://developer.apple.com/documentation/appstoreserverapi/get-transaction-info).

Secretos requeridos:

- `APPLE_APP_STORE_ISSUER_ID`
- `APPLE_APP_STORE_KEY_ID`
- `APPLE_APP_STORE_PRIVATE_KEY` — contenido PEM `.p8`, solo Supabase Secrets
- `APPLE_BUNDLE_ID`
- `APPLE_APP_STORE_ENVIRONMENT` — `production`, `sandbox` o `both`

## Google

1. Billing Client se configura con `setObfuscatedAccountId(SHA-256(user.id de Supabase))`.
2. El cliente envía `productId`, `transactionId/orderId` y `purchaseToken`.
3. El backend usa OAuth 2.0 de service account y consulta Google Play Developer API:
   - producto: `purchases.products.get`;
   - suscripción: `purchases.subscriptionsv2.get`.
4. Solo acepta estado comprado/activo, package/producto exactos y `obfuscatedExternalAccountId` correspondiente a la cuenta autenticada.
5. Después de persistir el entitlement devuelve `ativo=true`; recién entonces el cliente acknowledge/consume según el tipo configurado.

Fuentes: [Google Play Developer API](https://developers.google.com/android-publisher/api-ref/rest) y [OAuth para service accounts](https://developers.google.com/identity/protocols/oauth2/service-account).

Secretos requeridos:

- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- `GOOGLE_PLAY_PACKAGE_NAME`

## Persistencia e idempotencia

- `public.produtos_loja`: mapea `(plataforma, produto_id)` a un plan y tipo (`consumivel`, `nao_consumivel`, `assinatura`). La migración siembra `30d → mensal`, `90d → trimestral` y `180d → semestral`; Apple usa IAP no renovable de plazo fijo y Google usa suscripciones **prepagadas** (`assinatura`) consultadas por `subscriptionsv2`. Ninguna se configura con renovación automática.
- `public.compras_nativas`: conserva hash del comprobante, transacción verificada, estado y vínculo al entitlement; RLS sin policies y sin grants al cliente.
- Estados: `pendente_verificacao`, `verificada`, `rejeitada`, `reembolsada`, `revogada`.
- Un hash o una transacción externa solo puede pertenecer a una cuenta. Un replay de la misma cuenta es idempotente; otra cuenta recibe rechazo.
- `confirmar_compra_nativa` es service-role-only y constituye el único punto que crea `public.assinaturas`.
- La eliminación de cuenta desvincula los metadatos fiscales retenidos; los intentos pendientes/rechazados expiran a los 90 días y el resto a los 5 años.

## Configuración previa al deploy

1. Aplicar migraciones `202608080001_privacidade_e_seguranca.sql` y `202608080002_compras_nativas.sql`.
2. Como administrador, verificar los seis mapeos sembrados y desactivar cualquier SKU que aún no esté aprobado en su tienda. `salvar_produto_loja(...)` no acepta IDs fuera de la allowlist.
3. Cargar secretos con `supabase secrets set`; nunca pasarlos por Git, el bundle o logs.
4. Ejecutar pruebas SQL y `deno test`/`deno check` de Edge Functions.
5. Desplegar `validar-compra-nativa` con verificación JWT habilitada. No usar `--no-verify-jwt`.
6. Probar Apple Sandbox/TestFlight y Google License Testers antes de producción.
7. Configurar después App Store Server Notifications V2 y Google RTDN para renovaciones, reembolsos y revocaciones; el RPC `encerrar_compra_nativa` ya deja preparado el contrato de invalidación.
8. Antes de producción, programar un cron diario que ejecute
   `select public.revalida_aplicar_retencao_completa();`. La migración crea la entrada
   única y sus permisos, pero no activa `pg_cron` ni modifica servicios externos.

La ausencia de secretos es un estado operativo seguro: se registra `pendente_verificacao`, se responde `pendente=true` y no se concede acceso.

## Contrato del plugin nativo

El nombre público del plugin Capacitor 6 es `NativePurchases`. En iOS se obtiene sin agregar un script web compartido:

```js
const NativePurchases = window.Capacitor?.Plugins?.NativePurchases;
if (!NativePurchases) throw new Error("Compras nativas no disponibles");
```

La implementación iOS requiere iOS 15 o posterior y usa únicamente StoreKit 2. `platform` vale `apple`; Android usa el mismo formato con `platform: "google"`. Los identificadores de transacción se transportan como texto para no perder precisión en JavaScript.

### Configuración de productos Apple

La lista permitida está en `EvidentiaStoreKitProductIDs`, dentro de `app-android/ios/App/App/Info.plist`. Los SKU no son secretos, pero deben coincidir exactamente en estos tres lugares:

1. App Store Connect;
2. `EvidentiaStoreKitProductIDs`;
3. `public.produtos_loja`, configurado mediante `salvar_produto_loja(...)`.

El plugin rechaza cualquier `productId` fuera de esta allowlist. Los valores versionados son identificadores iniciales configurables, no credenciales de Apple.

### `getProducts({ productIds? })`

Sin `productIds`, consulta toda la allowlist. Si se especifica el array, debe ser un subconjunto permitido.

```js
const catalogo = await NativePurchases.getProducts({
  productIds: ["com.evidentia.revalida.access.180d"]
});
```

Respuesta:

```json
{
  "platform": "apple",
  "state": "ready",
  "products": [
    {
      "platform": "apple",
      "productId": "com.evidentia.revalida.access.180d",
      "state": "available",
      "type": "Non-Renewing Subscription",
      "displayName": "Acceso 180 días",
      "description": "...",
      "displayPrice": "R$ 149,90",
      "price": "149.9",
      "isFamilyShareable": false
    }
  ],
  "missingProductIds": []
}
```

`displayPrice` es el único precio que debe mostrarse al usuario: ya está localizado por la App Store. Un ID en `missingProductIds` indica una diferencia de configuración o un producto todavía no disponible en el storefront; no se debe inventar precio ni iniciar compra.

### `purchase({ productId, accountToken? })`

`accountToken` debe ser el UUID estable del usuario autenticado en Supabase. No se acepta email, JWT, clave ni otro dato personal.

```js
const compra = await NativePurchases.purchase({
  productId: "com.evidentia.revalida.access.180d",
  accountToken: session.user.id
});
```

Compra verificada localmente por StoreKit:

```json
{
  "platform": "apple",
  "productId": "com.evidentia.revalida.access.180d",
  "transactionId": "2000000123456789",
  "originalTransactionId": "2000000123456789",
  "signedTransaction": "eyJ...",
  "state": "verified",
  "needsFinish": true,
  "purchaseDate": "2026-08-08T12:00:00.000Z",
  "expirationDate": "2027-02-04T12:00:00.000Z",
  "accountToken": "00000000-0000-0000-0000-000000000000"
}
```

Resultados sin comprobante:

- `state: "cancelled"`: el usuario canceló; no mostrarlo como error ni reintentar automáticamente.
- `state: "pending"`: Ask to Buy u otra aprobación pendiente; no conceder acceso. La actualización posterior llegará por evento.
- `state: "unverified"`: el plugin entrega el JWS para diagnóstico/verificación autoritativa, pero jamás concede acceso ni permite finalizar localmente la transacción.

En estados sin transacción, `transactionId` y `signedTransaction` son cadenas vacías para mantener el formato multiplataforma.

### `restore()`

```js
const restauracion = await NativePurchases.restore();
```

Ejecuta `AppStore.sync()` y devuelve los entitlements actuales permitidos:

```json
{
  "platform": "apple",
  "state": "restored",
  "transactions": [
    {
      "platform": "apple",
      "productId": "com.evidentia.revalida.access.180d",
      "transactionId": "2000000123456789",
      "signedTransaction": "eyJ...",
      "state": "verified",
      "needsFinish": false
    }
  ]
}
```

Cada transacción restaurada se reenvía al endpoint idempotente. Restaurar no implica activar acceso localmente. `state: "cancelled"` significa que el usuario cerró la autenticación de Apple y deja `transactions: []`.

### Evento `transactionUpdated`

El observador se inicia al cargar el bridge y conserva eventos hasta que JavaScript añade el listener:

```js
const listener = await NativePurchases.addListener(
  "transactionUpdated",
  async transaction => {
    await verificarYFinalizar(transaction);
  }
);

// Al desmontar la pantalla o cerrar la sesión:
await listener.remove();
```

El evento usa el mismo objeto que `purchase`. Cubre aprobaciones diferidas, renovaciones y transacciones recibidas mientras la app no estaba activa. El consumidor debe aplicar idempotencia por `transactionId` y puede recibir el mismo evento más de una vez hasta finalizarlo.

### Orden obligatorio de verificación y `finishTransaction`

```js
async function verificarYFinalizar(transaction) {
  if (!transaction.transactionId || !transaction.signedTransaction) return;

  const response = await fetch(`${SUPABASE_URL}/functions/v1/validar-compra-nativa`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      platform: transaction.platform,
      productId: transaction.productId,
      transactionId: transaction.transactionId,
      signedTransaction: transaction.signedTransaction,
      purchaseToken: null
    })
  });

  const resultado = await response.json();
  if (response.ok && resultado.ativo === true && transaction.needsFinish) {
    await NativePurchases.finishTransaction({
      transactionId: transaction.transactionId
    });
  }
  return resultado;
}
```

Orden inalterable:

1. recibir el JWS/identificadores;
2. enviarlos al endpoint autenticado;
3. esperar persistencia idempotente y `{ "ativo": true }`;
4. llamar `finishTransaction` únicamente cuando `needsFinish` sea `true`;
5. renovar la licencia/sesión de acceso.

Ante HTTP `202`, timeout, falta de red o error `5xx`, no se ejecuta `finishTransaction`: StoreKit conserva la transacción y el cliente reintenta con backoff. Un entitlement restaurado ya finalizado devuelve `needsFinish: false` y no necesita esa llamada.

`finishTransaction({ transactionId })` solo termina una transacción `verified` que siga en `Transaction.unfinished`. Devuelve `state: "finished"`. Nunca acepta un ID arbitrario, una transacción no verificada ni finaliza antes del ACK backend.

### Errores estables iOS

- `E_PRODUCTS_NOT_CONFIGURED`: falta `EvidentiaStoreKitProductIDs`.
- `E_PRODUCT_NOT_ALLOWED`: SKU fuera de la allowlist.
- `E_PRODUCT_NOT_FOUND`: App Store no devolvió el SKU configurado.
- `E_ACCOUNT_TOKEN_INVALID`: `accountToken` no es UUID.
- `E_NETWORK`: error de red StoreKit; reintentable.
- `E_STOREFRONT_UNAVAILABLE`: producto no disponible en la tienda actual.
- `E_TRANSACTION_ID_INVALID`, `E_TRANSACTION_NOT_FOUND`, `E_TRANSACTION_UNVERIFIED`: fallo al finalizar.
- `E_STOREKIT_SYSTEM`, `E_STOREKIT_UNSUPPORTED`, `E_STOREKIT_UNKNOWN`: error nativo no clasificado o función StoreKit no soportada.

Los rechazos Capacitor incluyen `{ "platform": "apple", "state": "failed" }` en `error.data`. No se registran JWS, tokens, JWT de Supabase ni respuestas completas de Apple en logs.
