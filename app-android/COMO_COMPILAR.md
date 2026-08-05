# App Android (Capacitor)

Este é o projeto que empacota o aplicativo web em um app Android nativo (WebView),
usando o Capacitor. O arquivo pronto para instalar já está aqui:
**`Evidentia-Revalida.apk`** (versão de teste, assinada em modo debug).

## Estrutura

- `www/index.html` — o aplicativo (o mesmo arquivo único da pasta `aplicativo/`)
- `resources/` — ícone e tela de abertura de origem
- `android/` — projeto Android nativo gerado pelo Capacitor
- `capacitor.config.json` — identificador `com.evidentia.revalida`, nome “Revalida”

## Recompilar o APK

Requer Node, Java 17 ou 21 (nao 22+: o Gradle deste projeto nao os suporta) e o Android SDK (plataforma 34 e build-tools 34).

```bash
npm install
npx cap sync android
cd android
./gradlew assembleDebug
# saída: android/app/build/outputs/apk/debug/app-debug.apk
```

Para atualizar o conteúdo do app, substitua `www/index.html` pelo novo
`aplicativo/Revalida_Evidentia.html`, rode `npx cap sync android` e compile de novo.

A forma mais simples de compilar sem configurar o SDK à mão é abrir a pasta
`android/` no **Android Studio** e usar *Build → Build APK(s)*.

## Publicar na Google Play

Para a Play Store é preciso gerar um *Android App Bundle* assinado com uma chave
de produção (`./gradlew bundleRelease` após configurar a assinatura) e uma conta
de desenvolvedor do Google Play (taxa única de 25 dólares).
