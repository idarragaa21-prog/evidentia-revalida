# Como instalar o Evidentia · Revalida

O aplicativo funciona no **computador**, no **iPhone** e no **Android**. Depois de instalado, todo o conteúdo — as 400 questões e as 26 figuras — fica dentro do próprio aparelho e **funciona sem internet**. O seu progresso é salvo apenas no seu aparelho e não é enviado para lugar nenhum.

O endereço do aplicativo é:

**<https://idarragaa21-prog.github.io/evidentia-revalida/>**

> Se o endereço ainda não abrir, é porque a publicação não foi ligada. Veja [Ligar a publicação](#ligar-a-publicação-uma-única-vez), no fim desta página. Enquanto isso, dá para usar o aplicativo pelo arquivo único (o último item de cada seção abaixo).

---

## No computador (Windows, macOS ou Linux)

**Instalando como aplicativo — Chrome, Edge ou Brave**

1. Abra <https://idarragaa21-prog.github.io/evidentia-revalida/>.
2. Na barra de endereço, à direita, clique no ícone de instalar (um monitor com uma seta para baixo). Se ele não aparecer, abra o menu **⋮** e escolha **Instalar** ou *Apps → Instalar esta página como aplicativo*.
3. Confirme. O Evidentia passa a abrir em janela própria, com ícone na área de trabalho ou no menu de aplicativos, e funciona sem internet.

**Sem instalar nada**

Baixe o arquivo [`aplicativo/Revalida_Evidentia.html`](aplicativo/Revalida_Evidentia.html) e abra-o com dois cliques. É um único arquivo: não precisa de instalação, de servidor nem de conexão. Dá para guardá-lo num pen drive.

> No Firefox e no Safari do computador não existe o botão de instalar. Use o endereço normalmente pelo navegador, ou o arquivo único.

---

## No iPhone e no iPad

No iOS, só o **Safari** consegue instalar o aplicativo na tela de início — pelo Chrome ou pelo Firefox a opção não aparece.

1. Abra <https://idarragaa21-prog.github.io/evidentia-revalida/> **no Safari**.
2. Toque no botão de compartilhar (o quadrado com uma seta para cima, na barra de baixo).
3. Deslize a lista e escolha **Adicionar à Tela de Início**.
4. Toque em **Adicionar**, no canto superior direito.

O ícone da Evidentia aparece junto dos outros aplicativos. Ao abri-lo, ele ocupa a tela inteira, sem a barra do navegador, e funciona offline depois da primeira abertura.

> Deixe a primeira abertura terminar de carregar antes de ficar sem sinal: é nela que o conteúdo é guardado no aparelho.

---

## No Android

**Opção 1 — Instalar pelo navegador (recomendada)**

1. Abra <https://idarragaa21-prog.github.io/evidentia-revalida/> no **Chrome**.
2. Toque no menu **⋮** e escolha **Instalar aplicativo** — muitas vezes aparece sozinho um aviso de *Instalar*.
3. Confirme. O ícone aparece na tela inicial e o aplicativo funciona offline.

**Opção 2 — Arquivo APK**

> ⚠️ **O APK versionado hoje está desatualizado.** Ele foi gerado antes da conferência contra o caderno oficial, então ainda traz os textos com unidades e cifras faltando e está sem quatro figuras. Enquanto ele não for gerado de novo, **prefira a Opção 1** — ela sempre entrega a versão corrigida. Para gerar o APK novo é preciso Android Studio; o passo a passo está em [`app-android/COMO_COMPILAR.md`](app-android/COMO_COMPILAR.md) e o conteúdo a empacotar (`app-android/www/`) já está atualizado no repositório.

O arquivo [`app-android/Evidentia-Revalida.apk`](app-android/Evidentia-Revalida.apk) instala o aplicativo como um app Android comum.

1. Passe o APK para o celular (cabo, e-mail, nuvem ou mensagem).
2. Abra o arquivo no celular. O Android vai pedir permissão para **instalar apps de fontes desconhecidas** — isso é o normal para qualquer app fora da Play Store. Autorize para o aplicativo que estiver abrindo o arquivo (o gerenciador de arquivos ou o navegador).
3. Confirme a instalação. O ícone **Revalida** aparece na gaveta de aplicativos.

> O APK é assinado em modo *debug*, para instalação direta e uso pessoal. Publicar na Google Play exigiria uma assinatura de produção e uma conta de desenvolvedor. Para gerar o APK a partir do código, veja [`app-android/COMO_COMPILAR.md`](app-android/COMO_COMPILAR.md).

**Opção 3 — Sem instalar**

Baixe [`aplicativo/Revalida_Evidentia.html`](aplicativo/Revalida_Evidentia.html) e abra o arquivo no navegador do celular.

---

## Qual escolher?

| Aparelho | Melhor caminho | Também funciona |
|:--|:--|:--|
| Computador | Instalar pelo Chrome ou Edge | Abrir o arquivo único |
| iPhone / iPad | Safari → Adicionar à Tela de Início | Abrir o arquivo único |
| Android | Chrome → Instalar aplicativo | APK, ou o arquivo único |

---

## Ligar a publicação (uma única vez)

O endereço acima é servido pelo GitHub Pages e só começa a funcionar depois que o dono do repositório ligar a opção. São dois passos, feitos uma só vez:

1. No repositório, vá em **Settings → Pages**.
2. Em *Build and deployment*, escolha **Source: GitHub Actions** e salve.

A partir daí, cada envio para o ramo `main` publica sozinho a versão nova — a rotina está em [`.github/workflows/publicar-app-web.yml`](.github/workflows/publicar-app-web.yml). A primeira publicação leva um ou dois minutos; o andamento aparece na aba **Actions**.

Quem já tiver o aplicativo instalado recebe a atualização na abertura seguinte, com um aviso discreto de *Nova versão disponível*.

---

## Atualizar o aplicativo

- **Instalado pelo navegador (computador, iPhone, Android):** a atualização chega sozinha. Se aparecer o aviso *Nova versão do aplicativo disponível*, toque em **Atualizar agora**; o aviso nunca interrompe um simulado em andamento.
- **APK:** baixe o APK novo e instale por cima. O histórico é preservado.
- **Arquivo único:** baixe o arquivo novo.

Antes de trocar de aparelho, use **Sobre e integridade → Exportar backup** para levar o seu histórico junto.
