# -*- coding: utf-8 -*-
"""Gera a versao instalavel (PWA) a partir do aplicativo montado.

Injeta no HTML as etiquetas de manifest, icones da Apple e o registro do
service worker, e produz app-web/index.html. Os demais arquivos da PWA
(manifest.webmanifest, sw.js e a pasta icons/) ja estao versionados em
app-web/ e nao sao alterados por este script.

Uso: python3 scripts/09_montar_pwa.py
"""
import os, sys
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
    '}\n'
    '</script>\n'
    '</body>'
)


def main():
    html = open(os.path.join(APLICATIVO, "Revalida_Evidentia.html"), encoding="utf-8").read()
    idx = html.find("<title>")
    html = html[:idx] + HEAD + html[idx:]
    html = html.replace("</body>", SW, 1)
    os.makedirs(APP_WEB, exist_ok=True)
    destino = os.path.join(APP_WEB, "index.html")
    open(destino, "w", encoding="utf-8").write(html)
    print(f"gerado: {destino}  ({round(len(html)/1048576, 2)} MB)")
    print("os arquivos manifest.webmanifest, sw.js e icons/ ja estao em app-web/")


if __name__ == "__main__":
    main()
