# App web instalável (PWA)

Esta pasta é o aplicativo publicado na web: `index.html` com todo o conteúdo embutido, o manifesto, os ícones e o *service worker* que faz o aplicativo funcionar sem internet.

**Não edite os arquivos daqui à mão.** Eles são gerados por:

```bash
python3 scripts/08_montar_aplicativo.py   # monta o aplicativo a partir do modelo e dos dados
python3 scripts/09_montar_pwa.py          # gera app-web/index.html e versiona o cache do sw.js
```

A publicação é automática: cada envio para o ramo `main` dispara [`.github/workflows/publicar-app-web.yml`](../.github/workflows/publicar-app-web.yml), que põe o conteúdo desta pasta no ar.

O passo a passo de instalação para computador, iPhone e Android está em [`COMO_INSTALAR.md`](../COMO_INSTALAR.md), na raiz do repositório.
