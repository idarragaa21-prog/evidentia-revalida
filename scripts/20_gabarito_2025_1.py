# -*- coding: utf-8 -*-
"""Le o gabarito DEFINITIVO de 2025/1 do PDF oficial do Inep.

O definitivo ja incorpora as anulacoes: onde o item caiu, o PDF traz «-» em vez de
letra. Aqui isso vira `gabarito: null` + `anulada: true`, que e como o banco
representa questao anulada nas outras edicoes.

Nao ha nenhuma resposta escrita a mao neste arquivo: tudo sai do PDF.

Entrada : fontes_inep/2025_1_GB_objetiva_definitivo.pdf
Saida   : dados/gabarito_2025_1.json

Uso: python3 scripts/20_gabarito_2025_1.py
"""
import os, sys, re, json, subprocess

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DADOS, FONTES

PDF = os.path.join(FONTES, "2025_1_GB_objetiva_definitivo.pdf")
SAIDA = os.path.join(DADOS, "gabarito_2025_1.json")


def main():
    if not os.path.exists(PDF):
        raise SystemExit(f"nao encontrei o gabarito em {PDF}")

    r = subprocess.run(["pdftotext", "-layout", PDF, "-"], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"pdftotext falhou: {r.stderr[:300]}")
    linhas = r.stdout.splitlines()

    # O PDF alterna uma linha «Questão 1 2 3 ...» e a seguinte «Gabarito B A A ...».
    # Ler o par mantem o alinhamento por posicao, que e o que evita trocar respostas.
    gabarito = {}
    for i, linha in enumerate(linhas):
        if not re.match(r"^\s*Quest[ãa]o\s", linha):
            continue
        numeros = re.findall(r"\b\d{1,3}\b", linha)
        resposta = None
        for j in range(i + 1, min(i + 4, len(linhas))):
            if re.match(r"^\s*Gabarito\s", linhas[j]):
                resposta = re.findall(r"(?<![A-Za-z])([A-E]|-)(?![A-Za-z])",
                                      linhas[j].split("Gabarito", 1)[1])
                break
        if resposta is None:
            raise SystemExit(f"linha «Questão» sem «Gabarito» logo abaixo: {linha[:60]!r}")
        if len(numeros) != len(resposta):
            raise SystemExit(
                f"desalinhamento: {len(numeros)} numeros e {len(resposta)} respostas\n"
                f"  {linha.strip()[:80]}\n  {linhas[j].strip()[:80]}")
        for n, g in zip(numeros, resposta):
            gabarito[int(n)] = None if g == "-" else g

    faltando = sorted(set(range(1, 101)) - set(gabarito))
    if faltando:
        raise SystemExit(f"gabarito incompleto; faltam as questoes {faltando}")
    extras = sorted(n for n in gabarito if not 1 <= n <= 100)
    if extras:
        raise SystemExit(f"gabarito trouxe numeros fora de 1-100: {extras}")

    anuladas = sorted(n for n, g in gabarito.items() if g is None)
    saida = {str(n): gabarito[n] for n in sorted(gabarito)}
    json.dump(saida, open(SAIDA, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"gabarito 2025/1 lido -> {SAIDA}")
    print(f"  100 questoes; {len(anuladas)} anuladas: {anuladas}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
