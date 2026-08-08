# -*- coding: utf-8 -*-
"""Confere o baseline comercial contra o acervo que realmente entra no produto.

Este arquivo é o único gate para números usados em README, loja e checkout. Ele
falha quando o banco muda sem que ``scripts/metricas_produto.json`` seja revisto.
Não altera nenhum arquivo.

Uso:
    python3 scripts/22_validar_metricas_produto.py
    python3 scripts/22_validar_metricas_produto.py --json
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DADOS, RAIZ

CANONICO = Path(__file__).with_name("metricas_produto.json")
BANCO = Path(DADOS) / "banco_400_questoes.json"
JUSTIFICATIVAS = Path(DADOS) / "justificativas"
REFERENCIAS = Path(DADOS) / "referencias.json"
FIGURAS = Path(DADOS) / "figuras.json"


def carregar_json(caminho: Path):
    try:
        with caminho.open(encoding="utf-8") as arquivo:
            return json.load(arquivo)
    except (OSError, json.JSONDecodeError) as erro:
        raise ValueError(f"{caminho.relative_to(RAIZ)}: não foi possível ler JSON: {erro}") from erro


def edicao_do_arquivo(caminho: Path) -> str:
    partes = caminho.stem.split("-")
    if len(partes) != 2 or not all(p.isdigit() for p in partes):
        raise ValueError(f"nome de justificativa inválido: {caminho.name}")
    return "/".join(partes)


def medir():
    banco = carregar_json(BANCO)
    referencias = carregar_json(REFERENCIAS)
    figuras = carregar_json(FIGURAS)

    chaves_banco = [(q.get("edicao"), q.get("numero")) for q in banco]
    duplicadas_banco = sorted(k for k, n in Counter(chaves_banco).items() if n > 1)

    registros_justificativa = []
    for caminho in sorted(JUSTIFICATIVAS.glob("*.json")):
        edicao = edicao_do_arquivo(caminho)
        for registro in carregar_json(caminho):
            registros_justificativa.append((edicao, registro))

    chaves_just = [(edicao, r.get("numero")) for edicao, r in registros_justificativa]
    duplicadas_just = sorted(k for k, n in Counter(chaves_just).items() if n > 1)
    conjunto_banco, conjunto_just = set(chaves_banco), set(chaves_just)

    com_referencias = sum(bool(r.get("referencias")) for _, r in registros_justificativa)
    sem_referencias = len(registros_justificativa) - com_referencias
    anuladas = {k for k, q in zip(chaves_banco, banco) if q.get("anulada")}
    sem_ref_nao_anuladas = sum(
        not bool(r.get("referencias")) and (edicao, r.get("numero")) not in anuladas
        for edicao, r in registros_justificativa
    )
    por_edicao = Counter(q.get("edicao") for q in banco)

    atual = {
        "questoes": len(banco),
        "edicoes": sorted(por_edicao),
        "questoes_por_edicao": min(por_edicao.values()) if por_edicao and len(set(por_edicao.values())) == 1 else None,
        "justificativas": len(registros_justificativa),
        "questoes_com_referencias": com_referencias,
        "questoes_sem_referencias": sem_referencias,
        "questoes_nao_anuladas_sem_referencias": sem_ref_nao_anuladas,
        "fontes_catalogadas": len(referencias),
        "figuras": len(figuras),
    }
    integridade = {
        "chaves_duplicadas_banco": duplicadas_banco,
        "chaves_duplicadas_justificativas": duplicadas_just,
        "justificativas_ausentes": sorted(conjunto_banco - conjunto_just),
        "justificativas_orfas": sorted(conjunto_just - conjunto_banco),
        "questoes_por_edicao": dict(sorted(por_edicao.items())),
    }
    return atual, integridade


def validar():
    erros = []
    try:
        esperado = carregar_json(CANONICO)["acervo"]
        atual, integridade = medir()
    except (KeyError, TypeError, ValueError) as erro:
        return {"ok": False, "erros": [str(erro)]}

    for chave, valor_esperado in esperado.items():
        valor_atual = atual.get(chave)
        if valor_atual != valor_esperado:
            erros.append(f"{chave}: atual={valor_atual!r}; canônico={valor_esperado!r}")

    for nome in (
        "chaves_duplicadas_banco",
        "chaves_duplicadas_justificativas",
        "justificativas_ausentes",
        "justificativas_orfas",
    ):
        if integridade[nome]:
            erros.append(f"{nome}: {integridade[nome][:12]}")

    return {
        "ok": not erros,
        "esperado": esperado,
        "atual": atual,
        "integridade": integridade,
        "erros": erros,
    }


def main():
    resultado = validar()
    if "--json" in sys.argv:
        print(json.dumps(resultado, ensure_ascii=False, indent=2))
    else:
        atual = resultado.get("atual", {})
        print("MÉTRICAS CANÔNICAS DO PRODUTO")
        print(
            f"  {atual.get('questoes', '?')} questões · "
            f"{len(atual.get('edicoes', []))} edições · "
            f"{atual.get('justificativas', '?')} justificativas"
        )
        print(
            f"  {atual.get('questoes_com_referencias', '?')} com referências · "
            f"{atual.get('questoes_sem_referencias', '?')} sem referência catalogada · "
            f"{atual.get('fontes_catalogadas', '?')} fontes · {atual.get('figuras', '?')} figuras"
        )
        if resultado["ok"]:
            print("\nsem divergências entre o acervo e scripts/metricas_produto.json.")
        else:
            print(f"\n{len(resultado['erros'])} ERRO(S):")
            for erro in resultado["erros"]:
                print(f"  - {erro}")
    return 0 if resultado["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
