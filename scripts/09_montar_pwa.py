# -*- coding: utf-8 -*-
"""Gera a versao instalavel (PWA) a partir do aplicativo montado.

Injeta no HTML as etiquetas de manifest, icones da Apple e o registro do
service worker, e produz app-web/index.html.

O sw.js e versionado a mao em app-web/, com uma unica parte gerada: a
constante VERSAO, que este script reescreve com o resumo (sha256) do
index.html montado mais o manifesto e os icones. Como o nome do cache
deriva de VERSAO, cada publicacao invalida sozinha o cache anterior --
sem isso quem ja instalou o aplicativo ficaria preso na primeira versao.

A PWA publicada e a EDICAO LIVRE: e a pagina publica, aberta a qualquer um, e
serve de funil. A edicao completa nao vai para o Pages -- ela se distribui por
download depois da compra e pede licenca para abrir.

Uso: python3 scripts/09_montar_pwa.py [--edicao livre|completo]
"""
import os, re, sys, hashlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import RAIZ, APLICATIVO

APP_WEB = os.path.join(RAIZ, "app-web")

HEAD = (
    '<link rel="manifest" href="manifest.webmanifest">\n'
    '<link rel="apple-touch-icon" href="icons/apple-touch-icon-180.png">\n'
    '<meta name="apple-mobile-web-app-capable" content="yes">\n'
    '<meta name="mobile-web-app-capable" content="yes">\n'
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">\n'
    '<meta name="apple-mobile-web-app-title" content="Revalida">\n'
    '<meta name="application-name" content="Revalida">\n'
)

SW = (
    '<script>\n'
    'if ("serviceWorker" in navigator) {\n'
    '  window.addEventListener("load", function () {\n'
    '    navigator.serviceWorker.register("sw.js").catch(function(){});\n'
    '  });\n'
    '  navigator.serviceWorker.addEventListener("message", function (e) {\n'
    '    if (e.data && e.data.tipo === "evidentia-atualizado" && typeof avisarAtualizacao === "function") avisarAtualizacao();\n'
    '  });\n'
    '}\n'
    '</script>\n'
    '</body>'
)

# arquivos cujo conteudo define a versao do cache do service worker
ASSETS_VERSAO = [
    "manifest.webmanifest",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-512-maskable.png",
    "icons/icon-1024.png",
    "icons/apple-touch-icon-180.png",
    "icons/favicon-64.png",
]


def versao_do_conteudo(html):
    """Resumo curto do que a PWA serve: muda o conteudo, muda o cache."""
    h = hashlib.sha256(html.encode("utf-8"))
    for rel in ASSETS_VERSAO:
        caminho = os.path.join(APP_WEB, rel)
        if os.path.exists(caminho):
            h.update(rel.encode("utf-8"))
            h.update(open(caminho, "rb").read())
    return h.hexdigest()[:12]


def gravar_versao_sw(versao):
    sw = os.path.join(APP_WEB, "sw.js")
    fonte = open(sw, encoding="utf-8").read()
    novo, n = re.subn(r'const VERSAO = "[^"]*";', f'const VERSAO = "{versao}";', fonte, count=1)
    assert n == 1, "constante VERSAO nao encontrada em app-web/sw.js"
    if novo != fonte:
        open(sw, "w", encoding="utf-8").write(novo)
    return sw


# O APK ja carrega tudo do proprio pacote: um service worker so acrescentaria
# uma segunda camada de cache offline. Por isso o Android recebe o HTML puro.
DESTINOS_ANDROID = [
    os.path.join(RAIZ, "app-android", "www", "index.html"),
    os.path.join(RAIZ, "app-android", "android", "app", "src", "main",
                 "assets", "public", "index.html"),
]


def main():
    qual = "livre"
    for i, a in enumerate(sys.argv):
        if a == "--edicao" and i + 1 < len(sys.argv):
            qual = sys.argv[i + 1]
    nome = "Revalida_Evidentia.html" if qual == "completo" else "Revalida_Evidentia_livre.html"
    origem = os.path.join(APLICATIVO, nome)
    if not os.path.exists(origem):
        raise SystemExit(f"nao encontrei {origem}; rode antes o 08_montar_aplicativo.py")
    print(f"origem: {nome} (edicao {qual})")
    puro = open(origem, encoding="utf-8").read()
    idx = puro.find("<title>")
    html = puro[:idx] + HEAD + puro[idx:]
    html = html.replace("</body>", SW, 1)
    os.makedirs(APP_WEB, exist_ok=True)
    destino = os.path.join(APP_WEB, "index.html")
    open(destino, "w", encoding="utf-8").write(html)
    versao = versao_do_conteudo(html)
    gravar_versao_sw(versao)
    print(f"gerado: {destino}  ({round(len(html)/1048576, 2)} MB)")
    print(f"sw.js: cache versionado como evidentia-revalida-{versao}")

    # O aplicativo de celular NAO leva a edicao livre: ele e o produto pago, baixado
    # depois da compra e liberado com a conta. Por isso o Android recebe a edicao
    # completa, e nao o que acabou de ir para o Pages.
    completo = os.path.join(APLICATIVO, "Revalida_Evidentia.html")
    if os.path.exists(completo):
        conteudo = open(completo, encoding="utf-8").read()
        for caminho in DESTINOS_ANDROID:
            if os.path.isdir(os.path.dirname(caminho)):
                open(caminho, "w", encoding="utf-8").write(conteudo)
                print(f"sincronizado (edicao completa): {os.path.relpath(caminho, RAIZ)}")
    else:
        print("aviso: sem a edicao completa montada, o Android nao foi sincronizado")
    print("os arquivos manifest.webmanifest e icons/ ja estao em app-web/")


if __name__ == "__main__":
    main()
