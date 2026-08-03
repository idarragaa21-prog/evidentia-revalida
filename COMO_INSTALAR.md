# Como instalar o Evidentia · Revalida no celular

Há duas formas de ter o aplicativo no seu telefone. A **app web instalável (PWA)** funciona tanto no iPhone quanto no Android. O **arquivo APK** é só para Android.

---

## Opção 1 — App web instalável (PWA) · iPhone e Android

A app precisa estar publicada num endereço `https://` para poder ser instalada. É gratuito e leva um minuto.

### Passo 1 — Publicar a pasta (uma única vez)

Escolha **um** destes caminhos:

**a) Netlify Drop (o mais rápido, sem conta)**
1. No computador, abra <https://app.netlify.com/drop>.
2. Arraste a pasta `app-web` inteira para a área indicada.
3. Em segundos aparece um endereço do tipo `https://algo.netlify.app`. Esse é o link do seu aplicativo.

**b) GitHub Pages (se você subiu o repositório)**
1. No repositório, coloque o conteúdo da pasta `app-web` dentro da pasta `docs`.
2. Em *Settings → Pages*, escolha *Deploy from a branch*, ramo `main`, pasta `/docs`.
3. O endereço será `https://SEU_USUARIO.github.io/evidentia-revalida/`.

### Passo 2 — Instalar no telefone

**No iPhone (Safari):**
1. Abra o endereço `https://…` no **Safari**.
2. Toque no botão de compartilhar (o quadrado com a seta para cima).
3. Escolha **Adicionar à Tela de Início** e confirme.
4. O ícone da Evidentia aparece na tela. Ao abri-lo, funciona em tela cheia, como um aplicativo, e sem internet depois da primeira vez.

**No Android (Chrome):**
1. Abra o endereço `https://…` no **Chrome**.
2. Toque no menu (três pontos) e escolha **Instalar aplicativo** (ou aparece sozinho um aviso *Instalar*).
3. O ícone aparece na tela inicial e a app funciona offline.

---

## Opção 2 — Arquivo APK · só Android

O arquivo `Evidentia-Revalida.apk` instala a app como um aplicativo Android comum.

1. Passe o arquivo `Evidentia-Revalida.apk` para o celular (por cabo, e-mail, nuvem ou mensagem).
2. Abra o arquivo no celular. O Android vai pedir permissão para **instalar apps de fontes desconhecidas** — é normal para apps fora da Play Store. Autorize para o app que estiver abrindo o arquivo (o gerenciador de arquivos ou o navegador).
3. Confirme a instalação. O ícone **Revalida** aparece na gaveta de aplicativos.

> Este APK é uma versão de teste assinada em modo *debug*, pensada para uso pessoal por instalação direta. Para publicar na Google Play seria necessário gerar uma versão assinada de produção e uma conta de desenvolvedor.

---

## Qual escolher?

- **iPhone:** só existe a Opção 1 (app web instalável). A Apple não permite instalar APK.
- **Android:** as duas funcionam. O APK é o mais parecido com baixar um app; a app web é ainda mais leve e não pede permissões.

Em todos os casos, todo o conteúdo (as 400 questões e as 22 figuras) fica dentro do próprio aplicativo e funciona **sem internet**. O seu progresso é salvo apenas no seu aparelho.
