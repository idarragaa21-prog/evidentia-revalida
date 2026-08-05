# -*- coding: utf-8 -*-
"""Incorpora a edicao 2026/1 ao banco, juntando questoes, gabarito e figuras.

Entrada : dados/bruto_2026_1.json      (13_extrair_2026_1.py)
          dados/gabarito_2026_1.json   (16_gabarito_2026_1.py)
          dados/figuras_2026_1.json    (14_figuras_2026_1.py)
          dados/classificacao_2026_1.json  (area e tema por questao, opcional)
Saida   : dados/banco_400_questoes.json e dados/figuras.json, atualizados

O nome do arquivo do banco continua o mesmo por compatibilidade com os scripts que
ja o leem; o numero no nome deixou de valer quando a quarta edicao entrou.

Uso: python3 scripts/17_incorporar_2026_1.py [--aplicar]
"""
import os, sys, json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DADOS

EDICAO = "2026/1"
BANCO = os.path.join(DADOS, "banco_400_questoes.json")
FIGURAS = os.path.join(DADOS, "figuras.json")


def carregar(nome, obrigatorio=True):
    caminho = os.path.join(DADOS, nome)
    if not os.path.exists(caminho):
        if obrigatorio:
            raise SystemExit(f"falta {caminho}")
        return None
    return json.load(open(caminho, encoding="utf-8"))


def main():
    aplicar = "--aplicar" in sys.argv
    bruto = carregar("bruto_2026_1.json")
    gab = carregar("gabarito_2026_1.json")
    figs_novas = carregar("figuras_2026_1.json", obrigatorio=False) or {}
    classif = carregar("classificacao_2026_1.json", obrigatorio=False) or {}

    banco = json.load(open(BANCO, encoding="utf-8"))
    if any(q["edicao"] == EDICAO for q in banco):
        print(f"a edicao {EDICAO} ja esta no banco; nada a fazer")
        return 0

    respostas = gab["gabarito"]
    anuladas = set(gab.get("anuladas") or [])

    novas, sem_classificacao = [], []
    for q in sorted(bruto, key=lambda q: q["numero"]):
        n = q["numero"]
        c = classif.get(str(n)) or {}
        if not c.get("area") or not c.get("tema"):
            sem_classificacao.append(n)
        novas.append({
            "edicao": EDICAO,
            "numero": n,
            "anulada": n in anuladas,
            "gabarito": None if n in anuladas else respostas[str(n)],
            "enunciado": q["enunciado"],
            "alternativas": q["alternativas"],
            "area": c.get("area"),
            "tema": c.get("tema"),
            # a explicacao em prosa das edicoes antigas nao existe aqui: esta edicao
            # ja nasce com justificativa estruturada, em dados/justificativas/2026-1.json
            "explicacao": "",
            "figura": f"{EDICAO}|{n}" if f"{EDICAO}|{n}" in figs_novas else None,
        })

    erros = []
    if len(novas) != 100:
        erros.append(f"esperava 100 questoes, tenho {len(novas)}")
    for q in novas:
        if not q["anulada"] and q["gabarito"] not in ("A", "B", "C", "D"):
            erros.append(f"q{q['numero']}: gabarito invalido {q['gabarito']!r}")
        if set(q["alternativas"]) != {"A", "B", "C", "D"}:
            erros.append(f"q{q['numero']}: alternativas {sorted(q['alternativas'])}")
    if erros:
        print(f"{len(erros)} PROBLEMA(S):")
        for e in erros[:20]:
            print(f"  - {e}")
        return 1

    print(f"edicao {EDICAO}: {len(novas)} questoes, {len(anuladas)} anuladas, "
          f"{sum(1 for q in novas if q['figura'])} com figura")
    if sem_classificacao:
        print(f"  sem area/tema: {len(sem_classificacao)} questoes "
              f"(rode a classificacao antes de publicar)")

    if not aplicar:
        print("\n(simulacao; rode com --aplicar para gravar)")
        return 0

    banco.extend(novas)
    banco.sort(key=lambda q: (q["edicao"], q["numero"]))
    json.dump(banco, open(BANCO, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    figuras = json.load(open(FIGURAS, encoding="utf-8"))
    figuras.update(figs_novas)
    json.dump(figuras, open(FIGURAS, "w", encoding="utf-8"), ensure_ascii=False)

    print(f"gravado: banco com {len(banco)} questoes, {len(figuras)} figuras")
    return 0


if __name__ == "__main__":
    sys.exit(main())
