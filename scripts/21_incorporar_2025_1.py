# -*- coding: utf-8 -*-
"""Incorpora a edicao 2025/1 ao banco: questoes, gabarito e classificacao.

Entrada : dados/bruto_2025_1.json          (19_extrair_2025_1.py)
          dados/gabarito_2025_1.json       (20_gabarito_2025_1.py)
          dados/classificacao_2025_1.json  (area e tema por questao)
Saida   : dados/banco_400_questoes.json atualizado

O nome do arquivo do banco continua o mesmo por compatibilidade com os scripts que
ja o leem; o numero no nome deixou de valer quando a quinta edicao entrou.

Sem --aplicar, so mostra o que faria.

Uso: python3 scripts/21_incorporar_2025_1.py [--aplicar]
"""
import os, sys, json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DADOS

EDICAO = "2025/1"
BANCO = os.path.join(DADOS, "banco_400_questoes.json")


def carregar(nome):
    caminho = os.path.join(DADOS, nome)
    if not os.path.exists(caminho):
        raise SystemExit(f"falta {caminho}")
    return json.load(open(caminho, encoding="utf-8"))


def main():
    aplicar = "--aplicar" in sys.argv
    bruto = carregar("bruto_2025_1.json")
    gabarito = carregar("gabarito_2025_1.json")
    classif = carregar("classificacao_2025_1.json")
    banco = json.load(open(BANCO, encoding="utf-8"))

    if any(q["edicao"] == EDICAO for q in banco):
        raise SystemExit(f"{EDICAO} ja esta no banco; nada a fazer")

    erros = []
    if len(bruto) != 100:
        erros.append(f"bruto tem {len(bruto)} questoes, esperava 100")
    for q in bruto:
        n = str(q["numero"])
        if n not in gabarito:
            erros.append(f"q{n}: sem gabarito")
        if n not in classif:
            erros.append(f"q{n}: sem area/tema")
    if erros:
        print(f"{len(erros)} PROBLEMA(S):")
        for e in erros[:20]:
            print(f"  - {e}")
        return 1

    novas = []
    for q in bruto:
        n = str(q["numero"])
        resposta = gabarito[n]
        novas.append({
            "edicao": EDICAO,
            # INTEIRO, como no resto do banco. Gravar como texto faz o validador
            # nao casar a questao com a sua justificativa — e as 100 apareceriam
            # como «sem justificativa» sem que nada estivesse de fato faltando.
            "numero": int(n),
            "anulada": resposta is None,
            "gabarito": resposta,
            "enunciado": q["enunciado"],
            "alternativas": q["alternativas"],
            "area": classif[n]["area"],
            "tema": classif[n]["tema"],
            # Campo herdado do formato antigo: a explicacao viva mora em
            # dados/justificativas/, que e o que o aplicativo monta.
            "explicacao": "",
            "figura": None,
        })

    anuladas = [q["numero"] for q in novas if q["anulada"]]
    print(f"{EDICAO}: {len(novas)} questoes, {len(anuladas)} anuladas "
          f"({', '.join(str(n) for n in anuladas)})")
    areas = {}
    for q in novas:
        areas[q["area"]] = areas.get(q["area"], 0) + 1
    for a, c in sorted(areas.items()):
        print(f"  {a}: {c}")

    if not aplicar:
        print("\n(simulacao — rode com --aplicar para gravar)")
        return 0

    # A ordem do banco e por edicao e numero, para que o arquivo continue legivel.
    banco.extend(novas)
    banco.sort(key=lambda q: (q["edicao"], int(q["numero"])))
    json.dump(banco, open(BANCO, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\nbanco atualizado: {len(banco)} questoes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
