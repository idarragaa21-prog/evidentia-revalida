# -*- coding: utf-8 -*-
"""Extrai as figuras que ficaram de fora do banco na primeira passagem.

O script 07 escolhia as questoes com figura cruzando duas listas: as que tinham
imagem embutida e as cujo texto anunciava a imagem. Em 2024/2 o texto estava
cifrado, entao o cruzamento descartou questoes que dependem da imagem para serem
respondidas; em 2023/2 uma questao escapou pelo mesmo motivo.

Sao quatro casos, conferidos um a um contra o caderno impresso:

  2023/2 n 63  tres radiografias de torax (1 h, 12 h e 24 h de vida)
  2024/2 n 11  monitor multiparametrico (FC 161, PA 67/0, FR 26)
  2024/2 n 46  eletrocardiograma de 12 derivacoes, mais o ECG apos 30 minutos
  2024/2 n 60  radiografia de torax em duas incidencias

As regioes abaixo saem da inspecao visual das paginas e incluem as legendas.
O recorte usa a mesma receita do script 07 (3,2x, largura maxima de 820 px,
JPEG de qualidade 72) para que as figuras novas fiquem iguais as antigas.

Uso: python3 scripts/11_figuras_faltantes.py
"""
import base64
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DADOS, FONTES

CADERNOS = {
    "2023/2": "2023_2_PV_objetiva_regular.pdf",
    "2024/2": "2024_2_PV_objetiva_regular.pdf",
}

# (edicao, numero) -> lista de recortes [(pagina, x0, y0, x1, y1)]
# mais de um recorte na lista significa figuras empilhadas verticalmente
RECORTES = {
    ("2023/2", 63): [(17, 28, 452, 292, 542)],
    ("2024/2", 11): [(3, 305, 306, 570, 444)],
    ("2024/2", 46): [(12, 74, 271, 520, 788), (13, 74, 93, 522, 614)],
    ("2024/2", 60): [(17, 27, 497, 296, 658)],
}

LARGURA_MAX = 820
ESCALA = 3.2
QUALIDADE = 72


def recortar(documento, pagina, caixa):
    import fitz
    from PIL import Image
    pix = documento[pagina].get_pixmap(matrix=fitz.Matrix(ESCALA, ESCALA),
                                       clip=fitz.Rect(*caixa))
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def empilhar(imagens):
    from PIL import Image
    if len(imagens) == 1:
        return imagens[0]
    largura = max(i.width for i in imagens)
    folga = 16
    altura = sum(i.height for i in imagens) + folga * (len(imagens) - 1)
    tela = Image.new("RGB", (largura, altura), "white")
    y = 0
    for img in imagens:
        tela.paste(img, ((largura - img.width) // 2, y))
        y += img.height + folga
    return tela


def main():
    import fitz  # noqa: F401  (validacao antecipada da dependencia)
    from PIL import Image

    caminho_figuras = os.path.join(DADOS, "figuras.json")
    caminho_banco = os.path.join(DADOS, "banco_400_questoes.json")
    figuras = json.load(open(caminho_figuras, encoding="utf-8"))
    banco = json.load(open(caminho_banco, encoding="utf-8"))

    documentos = {}
    novas = 0
    for (edicao, numero), caixas in RECORTES.items():
        chave = f"{edicao}|{numero}"
        if chave in figuras:
            print(f"  {chave}: ja existe, mantido")
            continue
        if edicao not in documentos:
            documentos[edicao] = fitz.open(os.path.join(FONTES, CADERNOS[edicao]))
        doc = documentos[edicao]
        imagem = empilhar([recortar(doc, p, c) for p, *c in
                           [(caixa[0], caixa[1], caixa[2], caixa[3], caixa[4]) for caixa in caixas]])
        if imagem.width > LARGURA_MAX:
            proporcao = LARGURA_MAX / imagem.width
            imagem = imagem.resize((LARGURA_MAX, int(imagem.height * proporcao)), Image.LANCZOS)
        buffer = io.BytesIO()
        imagem.convert("RGB").save(buffer, "JPEG", quality=QUALIDADE, optimize=True)
        b64 = base64.b64encode(buffer.getvalue()).decode()
        figuras[chave] = {"b64": b64, "w": imagem.width, "h": imagem.height,
                          "kb": round(len(b64) / 1024, 1)}
        questao = next(q for q in banco
                       if q["edicao"] == edicao and q["numero"] == numero)
        questao["figura"] = chave
        novas += 1
        print(f"  {chave}: {imagem.width}x{imagem.height}  {figuras[chave]['kb']} KB")

    if novas:
        json.dump(figuras, open(caminho_figuras, "w", encoding="utf-8"), ensure_ascii=False)
        json.dump(banco, open(caminho_banco, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=2)
        print(f"\ngravado: {novas} figura(s) nova(s); total agora {len(figuras)}")
    else:
        print("\nnada a fazer")


if __name__ == "__main__":
    main()
