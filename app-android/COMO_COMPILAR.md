# Aplicativos móveis (Capacitor 8)

Este projeto empacota a edição comercial da Evidentia Revalida para iOS e Android.
O conteúdo nativo é gerado a partir das fontes editoriais locais e não deve ser
versionado nem distribuído como HTML solto.

## Requisitos fixados

- Node.js 22 ou superior;
- JDK 21;
- Android SDK 36 e Build Tools 36;
- Xcode 26 ou superior e CocoaPods, para iOS;
- dependências exatas do Capacitor 8.5.0 registradas no `package-lock.json`.

Instale as dependências de forma reproduzível:

```bash
npm ci
```

## Android de desenvolvimento

O comando de preparação gera a variante Android, elimina qualquer direcionamento
para checkout externo e sincroniza os assets do Capacitor:

```bash
npm run prepare:android
cd android
./gradlew assembleDebug
```

Saída: `android/app/build/outputs/apk/debug/app-debug.apk`.

O APK debug serve apenas para testes locais. Ele não pode ser enviado à Play Store.

## Android de produção

Use o **Google Play App Signing** e mantenha a upload key fora do repositório. O
build falha de propósito se uma assinatura de produção não estiver configurada.
Defina as quatro variáveis no terminal ou no cofre de segredos da CI:

```bash
export EVIDENTIA_ANDROID_KEYSTORE="/caminho/seguro/evidentia-upload.jks"
export EVIDENTIA_ANDROID_KEYSTORE_PASSWORD="..."
export EVIDENTIA_ANDROID_KEY_ALIAS="evidentia-upload"
export EVIDENTIA_ANDROID_KEY_PASSWORD="..."
npm run build:aab
```

Saída: `android/app/build/outputs/bundle/release/app-release.aab`.

Antes de cada upload, incremente `versionCode`, confirme o `versionName` e valide
a assinatura. Nunca reutilize nem publique a senha ou o arquivo `.jks`.

Para validar somente a compilação Release sem possuir a chave, é possível executar
`./gradlew bundleRelease -PallowUnsignedRelease=true`. O AAB resultante é
deliberadamente não publicável e não deve sair da máquina de desenvolvimento.

## iOS

```bash
npm run prepare:ios
open ios/App/App.xcworkspace
```

No Xcode, selecione o Team da conta Apple Developer, confira o bundle
`com.evidentia.revalida`, incremente o build e execute primeiro os testes. Para a
entrega: **Product → Archive → Distribute App → App Store Connect**.

Os produtos nativos precisam existir nas duas lojas com estes IDs exatos:

- `com.evidentia.revalida.access.30d`
- `com.evidentia.revalida.access.90d`
- `com.evidentia.revalida.access.180d`

A transação só é finalizada/confirmada no aparelho depois que o backend retorna
`ativo: true`. Sandbox, TestFlight e License Testers devem ser aprovados antes da
produção.
