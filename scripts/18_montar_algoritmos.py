# -*- coding: utf-8 -*-
"""Desenha os algoritmos clinicos de dados/algoritmos.json como SVG.

Por que SVG e nao imagem: o produto inteiro e um arquivo unico que precisa caber
no celular e funcionar offline. Um fluxograma em SVG pesa poucos quilobytes, fica
nitido em qualquer tela, e usa variaveis de cor — entao acompanha o tema claro e o
escuro sem uma segunda versao.

Por que carris indentados e nao caixas lado a lado com setas: um fluxograma de
verdade abre em colunas, e cinco colunas de 280 px viram 1.400 px de largura. Num
celular de 360 px isso encolhe o texto a tres pixels — ilegivel justamente para
quem mais usa o aplicativo. Aqui cada decisao mostra os seus ramos indentados
abaixo dela, com um carril vertical rotulado. Le-se de cima para baixo, numa
coluna so, e nenhuma seta cruza a figura.

O desenho e nosso, a partir dos criterios da fonte citada. A arte do documento
original nunca e copiada (ver docs/ESQUEMA_ALGORITMOS.md).

Escreve: dados/algoritmos_svg.json  (id -> SVG)
Uso: python3 scripts/18_montar_algoritmos.py
"""
import json
import os
import sys
from html import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import RAIZ

DADOS = os.path.join(RAIZ, "dados")

LARGURA = 660
MARGEM = 14
INDENT = 22             # deslocamento de cada nivel de ramo
PAD = 12
LINHA_TITULO = 19
LINHA_ITEM = 16
ESPACO = 12             # vao entre caixas irmas
ESPACO_RAMO = 26        # vao antes de um ramo rotulado
CHAR_TITULO = 0.545     # largura media de caractere, em fracao do tamanho da fonte
CHAR_ITEM = 0.515

CORES = {
    "inicio": ("var(--sky-100,#e2ede7)", "var(--sky,#2f6047)"),
    "decisao": ("var(--gold-100,#f3ead2)", "var(--gold-ink,#6a5410)"),
    "grupo": ("var(--card,#fff)", "var(--sky,#2f6047)"),
    "conduta": ("var(--card,#fff)", "var(--ink-3,#69756b)"),
    "fim": ("var(--good-100,#e3f3ec)", "var(--good,#0f6b45)"),
}


def quebrar(texto, largura_px, tamanho, fator):
    por_linha = max(10, int(largura_px / (tamanho * fator)))
    linhas, atual = [], ""
    for palavra in str(texto).split():
        tentativa = (atual + " " + palavra).strip()
        if len(tentativa) <= por_linha:
            atual = tentativa
        else:
            if atual:
                linhas.append(atual)
            atual = palavra
    if atual:
        linhas.append(atual)
    return linhas or [""]


class Tela:
    """Acumula os elementos e a altura ja ocupada."""

    def __init__(self):
        self.partes = []
        self.y = MARGEM

    def caixa(self, no, x, largura):
        util = largura - 2 * PAD
        titulo = quebrar(no.get("texto", ""), util, 14, CHAR_TITULO)
        itens = [quebrar(i, util - 10, 12, CHAR_ITEM) for i in (no.get("itens") or [])]
        nota = quebrar(no["nota"], util, 12, CHAR_ITEM) if no.get("nota") else []

        altura = PAD + len(titulo) * LINHA_TITULO
        for bloco in itens:
            altura += 4 + len(bloco) * LINHA_ITEM
        if nota:
            altura += 8 + len(nota) * LINHA_ITEM
        altura += PAD

        fundo, borda = CORES.get(no.get("tipo", "conduta"), CORES["conduta"])
        raio = 18 if no.get("tipo") == "decisao" else 10
        topo = self.y
        self.partes.append(
            f'<rect x="{x:.0f}" y="{topo:.0f}" width="{largura:.0f}" height="{altura:.0f}" '
            f'rx="{raio}" fill="{fundo}" stroke="{borda}" stroke-width="1.5"/>')

        cursor = topo + PAD + 13
        for linha in titulo:
            self.partes.append(
                f'<text x="{x + PAD:.0f}" y="{cursor:.0f}" font-size="14" font-weight="700" '
                f'fill="var(--ink,#1a2620)">{escape(linha)}</text>')
            cursor += LINHA_TITULO
        for bloco in itens:
            cursor += 4
            for i, linha in enumerate(bloco):
                marca = "• " if i == 0 else "  "
                self.partes.append(
                    f'<text x="{x + PAD:.0f}" y="{cursor:.0f}" font-size="12" '
                    f'fill="var(--ink-2,#4d5a51)">{escape(marca + linha)}</text>')
                cursor += LINHA_ITEM
        if nota:
            cursor += 8
            for linha in nota:
                self.partes.append(
                    f'<text x="{x + PAD:.0f}" y="{cursor:.0f}" font-size="12" font-style="italic" '
                    f'fill="var(--ink-3,#69756b)">{escape(linha)}</text>')
                cursor += LINHA_ITEM

        self.y = topo + altura

    def rotulo_ramo(self, texto, x, largura):
        """Etiqueta do ramo (SIM/NAO/...), acima do bloco indentado."""
        linhas = quebrar(texto, largura - 24, 12, CHAR_ITEM)
        self.y += ESPACO_RAMO - 12
        for linha in linhas:
            self.partes.append(
                f'<text x="{x:.0f}" y="{self.y:.0f}" font-size="12" font-weight="700" '
                f'letter-spacing="0.04em" fill="var(--sky,#2f6047)">{escape(linha.upper())}</text>')
            self.y += 15
        self.y += 2

    def carril(self, x, y0, y1):
        """Linha vertical que mostra ate onde vai o ramo."""
        self.partes.append(
            f'<line x1="{x:.0f}" y1="{y0:.0f}" x2="{x:.0f}" y2="{y1:.0f}" '
            f'stroke="var(--line,#d3e1d8)" stroke-width="2" stroke-linecap="round"/>')

    def elo(self, texto, x, largura):
        """Ramo que volta a um no ja desenhado: uma remissao, nao um desenho repetido."""
        linhas = quebrar("→ seguir por: " + texto, largura - 2 * PAD, 12, CHAR_ITEM)
        altura = 10 + len(linhas) * LINHA_ITEM + 8
        topo = self.y
        self.partes.append(
            f'<rect x="{x:.0f}" y="{topo:.0f}" width="{largura:.0f}" height="{altura:.0f}" '
            f'rx="9" fill="none" stroke="var(--line,#d3e1d8)" stroke-width="1.5" '
            f'stroke-dasharray="4 3"/>')
        cursor = topo + 10 + 11
        for linha in linhas:
            self.partes.append(
                f'<text x="{x + PAD:.0f}" y="{cursor:.0f}" font-size="12" font-style="italic" '
                f'fill="var(--ink-3,#69756b)">{escape(linha)}</text>')
            cursor += LINHA_ITEM
        self.y = topo + altura


def render(algoritmo):
    nos = algoritmo["nos"]
    tela = Tela()
    desenhados = set()

    def caminho(chave, nivel):
        """Desenha o no e tudo o que vem depois dele, indentado por nivel."""
        while chave:
            no = nos.get(chave)
            if no is None:
                return
            x = MARGEM + nivel * INDENT
            largura = LARGURA - 2 * MARGEM - nivel * INDENT

            if chave in desenhados:
                tela.elo(no.get("texto", chave), x, largura)
                return
            desenhados.add(chave)

            if tela.y > MARGEM:
                tela.y += ESPACO
            tela.caixa(no, x, largura)

            opcoes = no.get("opcoes") or []
            if opcoes:
                for opcao in opcoes:
                    inicio = tela.y
                    tela.rotulo_ramo(opcao.get("rotulo", ""), x + INDENT, largura)
                    caminho(opcao.get("vai"), nivel + 1)
                    tela.carril(x + INDENT / 2, inicio + 6, tela.y)
                return

            chave = no.get("vai")

    caminho(algoritmo["no_inicial"], 0)
    altura = tela.y + MARGEM

    cabecalho = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {LARGURA} {altura:.0f}" '
        f'role="img" aria-label="{escape(algoritmo["titulo"])}" '
        f'style="max-width:100%;height:auto;font-family:system-ui,-apple-system,'
        f'&quot;Segoe UI&quot;,Roboto,sans-serif">')
    return cabecalho + "".join(tela.partes) + "</svg>"


def main():
    caminho_dados = os.path.join(DADOS, "algoritmos.json")
    if not os.path.exists(caminho_dados):
        print("sem dados/algoritmos.json — nada a fazer")
        return 0

    algoritmos = json.load(open(caminho_dados, encoding="utf-8"))
    saida = {}
    for chave, algoritmo in sorted(algoritmos.items()):
        svg = render(algoritmo)
        saida[chave] = svg
        print(f"  {chave}: {len(algoritmo['nos'])} nos, {round(len(svg) / 1024, 1)} kB")

    destino = os.path.join(DADOS, "algoritmos_svg.json")
    json.dump(saida, open(destino, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"gerado: {destino} ({len(saida)} algoritmo(s))")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
