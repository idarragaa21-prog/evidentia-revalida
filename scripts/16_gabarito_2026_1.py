# -*- coding: utf-8 -*-
"""Decodifica o gabarito definitivo da edicao 2026/1.

O PDF do gabarito tem o mesmo defeito de codificacao ja documentado em
docs/METODO_DECODIFICACAO.md: a fonte nao traz mapa ToUnicode utilizavel, entao
`pdftotext` devolve a coluna das respostas vazia. As letras chegam como indices
de glifo (caracteres de controle), nao como texto.

O mapa abaixo foi obtido pelo mesmo metodo do resto do projeto: cada codigo
distinto foi recortado do PDF, ampliado e reconhecido pela forma da letra.

    0x04 -> A     0x11 -> B     0x12 -> C     0x18 -> D

A leitura casa cada letra com o numero da questao pela geometria: a letra fica na
mesma faixa horizontal do numero e na coluna imediatamente a direita dele.

Entrada : fontes_inep/gab2026.pdf
Saida   : dados/gabarito_2026_1.json

Uso: python3 scripts/16_gabarito_2026_1.py
"""
import os, sys, json, collections

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DADOS, FONTES

try:
    import fitz  # PyMuPDF
except ImportError:
    raise SystemExit("falta a dependencia: python3 -m pip install pymupdf")

GABARITO = os.environ.get("REVALIDA_GABARITO_2026",
                          os.path.join(FONTES, "gab2026.pdf"))
SAIDA = os.path.join(DADOS, "gabarito_2026_1.json")

# Reconhecidos pela forma, glifo a glifo (ver docstring).
LETRA_DO_CODIGO = {0x04: "A", 0x11: "B", 0x12: "C", 0x18: "D"}

# Os digitos usam outra fonte, com deslocamento constante a partir de U+03EC.
DIGITO_DO_CODIGO = {0x03EC + i: str(i) for i in range(10)}

TOLERANCIA_LINHA = 6      # pontos: quanto a letra pode estar deslocada do numero
DISTANCIA_MAXIMA = 220    # pontos: largura maxima de uma coluna do gabarito


def coletar(doc):
    """Devolve (digitos, letras) como listas de (pagina, x, y, valor)."""
    digitos, letras = [], []
    for pi in range(len(doc)):
        for b in doc[pi].get_text("rawdict")["blocks"]:
            for l in b.get("lines", []):
                for s in l["spans"]:
                    for c in s["chars"]:
                        o = ord(c["c"])
                        x, y = c["bbox"][0], c["bbox"][1]
                        if o in DIGITO_DO_CODIGO:
                            digitos.append((pi, x, y, DIGITO_DO_CODIGO[o]))
                        elif o in LETRA_DO_CODIGO:
                            letras.append((pi, x, y, LETRA_DO_CODIGO[o]))
    return digitos, letras


def numeros_por_linha(digitos):
    """Agrupa digitos vizinhos em numeros de questao, por pagina e faixa horizontal."""
    porlinha = collections.defaultdict(list)
    for pi, x, y, d in digitos:
        porlinha[(pi, round(y / TOLERANCIA_LINHA))].append((x, d))
    numeros = []
    for (pi, faixa), itens in porlinha.items():
        itens.sort()
        atual, x0 = "", None
        anterior = None
        for x, d in itens:
            if anterior is not None and x - anterior > 14:   # comecou outro numero
                numeros.append((pi, x0, faixa, int(atual)))
                atual, x0 = "", None
            if x0 is None:
                x0 = x
            atual += d
            anterior = x
        if atual:
            numeros.append((pi, x0, faixa, int(atual)))
    return numeros


def main():
    if not os.path.exists(GABARITO):
        raise SystemExit(f"nao encontrei o gabarito em {GABARITO}")

    doc = fitz.open(GABARITO)
    digitos, letras = coletar(doc)
    numeros = numeros_por_linha(digitos)

    # indexa as letras pela mesma faixa horizontal
    letras_por_faixa = collections.defaultdict(list)
    for pi, x, y, L in letras:
        letras_por_faixa[(pi, round(y / TOLERANCIA_LINHA))].append((x, L))
    for k in letras_por_faixa:
        letras_por_faixa[k].sort()

    gabarito, sem_letra = {}, []
    for pi, x0, faixa, numero in numeros:
        if not (1 <= numero <= 100):
            continue                     # numero de pagina ou ruido de cabecalho
        candidatas = []
        # a letra pode estar meio ponto acima ou abaixo da linha do numero
        for delta in (0, -1, 1):
            candidatas += [(x, L) for x, L in letras_por_faixa.get((pi, faixa + delta), [])
                           if x > x0 and x - x0 < DISTANCIA_MAXIMA]
        if not candidatas:
            sem_letra.append(numero)
            continue
        gabarito[numero] = min(candidatas)[1]   # a mais proxima a direita

    erros = []
    if len(gabarito) + len(sem_letra) != 100:
        erros.append(f"encontrei {len(gabarito) + len(sem_letra)} questoes, esperava 100")
    faltando = sorted(set(range(1, 101)) - set(gabarito) - set(sem_letra))
    if faltando:
        erros.append(f"questoes nao localizadas no gabarito: {faltando}")

    if erros:
        print(f"{len(erros)} PROBLEMA(S):")
        for e in erros:
            print(f"  - {e}")
        return 1

    dist = collections.Counter(gabarito.values())
    print(f"gabarito 2026/1: {len(gabarito)} respostas + {len(sem_letra)} anuladas")
    print(f"  distribuicao: {dict(sorted(dist.items()))}")
    if sem_letra:
        print(f"  anuladas (sem letra no gabarito definitivo): {sorted(sem_letra)}")

    # Uma distribuicao muito torta denuncia leitura errada da coluna.
    if dist and max(dist.values()) > 45:
        print("  aviso: uma letra domina o gabarito; confira a leitura da coluna")

    json.dump({"edicao": "2026/1",
               "fonte": "gabarito definitivo do caderno 01, INEP",
               "gabarito": {str(k): v for k, v in sorted(gabarito.items())},
               "anuladas": sorted(sem_letra)},
              open(SAIDA, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"gravado: {SAIDA}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
