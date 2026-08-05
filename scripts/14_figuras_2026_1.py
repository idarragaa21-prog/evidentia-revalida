# -*- coding: utf-8 -*-
"""Extrai as figuras das questoes do caderno 2026/1.

Procura os blocos de imagem de cada pagina, decide a que questao pertencem pela
posicao do cabecalho QUESTAO N na mesma pagina, e recorta so as questoes cujo
enunciado realmente depende da imagem.

Entrada : fontes_inep/2026_1_caderno_1_ampliada.pdf, dados/bruto_2026_1.json
Saida   : dados/figuras_2026_1.json (mesmo formato de dados/figuras.json)

Uso: python3 scripts/14_figuras_2026_1.py
"""
import os, sys, io, re, json, base64, collections

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DADOS, FONTES

try:
    import fitz  # PyMuPDF
    from PIL import Image
except ImportError:
    raise SystemExit("faltam dependencias: python3 -m pip install pymupdf pillow")

CADERNO = os.environ.get("REVALIDA_CADERNO_2026",
                         os.path.join(FONTES, "2026_1_caderno_1_ampliada.pdf"))
SAIDA = os.path.join(DADOS, "figuras_2026_1.json")
EDICAO = "2026/1"

LARGURA_MAX = 820
AREA_MINIMA = 12000        # ignora selo, filete e sujeira de diagramacao
RE_QUESTAO = re.compile(r"QUEST[ÃA]O\s+(\d+)")


def main():
    if not os.path.exists(CADERNO):
        raise SystemExit(f"nao encontrei o caderno em {CADERNO}")

    bruto = json.load(open(os.path.join(DADOS, "bruto_2026_1.json"), encoding="utf-8"))
    enunciados = {q["numero"]: q["enunciado"] for q in bruto}

    doc = fitz.open(CADERNO)
    # Para cada pagina, de qual questao e o ultimo cabecalho antes de cada imagem.
    por_questao = collections.defaultdict(list)
    for p in range(len(doc)):
        pagina = doc[p]
        cabecalhos = []
        for bloco in pagina.get_text("blocks"):
            m = RE_QUESTAO.search(bloco[4] or "")
            if m:
                cabecalhos.append((bloco[1], int(m.group(1))))   # (y, numero)
        cabecalhos.sort()
        if not cabecalhos:
            continue
        for info in pagina.get_image_info():
            x0, y0, x1, y1 = info["bbox"]
            if (x1 - x0) * (y1 - y0) < AREA_MINIMA:
                continue
            dono = None
            for y, numero in cabecalhos:
                if y <= y0:
                    dono = numero
            if dono is None:
                dono = cabecalhos[0][1]
            if 1 <= dono <= 100:
                por_questao[dono].append((p, (x0, y0, x1, y1)))

    saida = {}
    for numero in sorted(por_questao):
        # uma questao pode ter varias imagens (ECG em duas derivacoes, por exemplo):
        # recorta a pagina onde estao as maiores, unindo os blocos daquela pagina.
        por_pagina = collections.defaultdict(list)
        for p, bb in por_questao[numero]:
            por_pagina[p].append(bb)
        p = max(por_pagina,
                key=lambda k: sum((b[2] - b[0]) * (b[3] - b[1]) for b in por_pagina[k]))
        bbs = por_pagina[p]
        rect = fitz.Rect(min(b[0] for b in bbs) - 4, min(b[1] for b in bbs) - 4,
                         max(b[2] for b in bbs) + 4, max(b[3] for b in bbs) + 4)
        pix = doc[p].get_pixmap(matrix=fitz.Matrix(3.2, 3.2), clip=rect)
        im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        if im.width > LARGURA_MAX:
            r = LARGURA_MAX / im.width
            im = im.resize((LARGURA_MAX, int(im.height * r)), Image.LANCZOS)
        buf = io.BytesIO()
        im.convert("RGB").save(buf, "JPEG", quality=72, optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode()
        saida[f"{EDICAO}|{numero}"] = {"b64": b64, "w": im.width, "h": im.height,
                                       "kb": round(len(b64) / 1024, 1)}

    json.dump(saida, open(SAIDA, "w", encoding="utf-8"), ensure_ascii=False)
    total = sum(v["kb"] for v in saida.values())
    print(f"figuras extraidas: {len(saida)} -> {SAIDA} ({total:.0f} KB)")
    for k, v in sorted(saida.items(), key=lambda kv: -kv[1]["kb"])[:12]:
        n = int(k.split("|")[1])
        trecho = enunciados.get(n, "")[:70]
        print(f"  {k}  {v['w']}x{v['h']}  {v['kb']} KB  | {trecho}…")
    return 0


if __name__ == "__main__":
    sys.exit(main())
