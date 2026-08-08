# -*- coding: utf-8 -*-
"""Impede que superfícies públicas voltem a prometer mais que o acervo entrega."""
from __future__ import annotations

import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
CANONICO = json.loads((Path(__file__).with_name("metricas_produto.json")).read_text(encoding="utf-8"))["acervo"]

SUPERFICIES = {
    "README": RAIZ / "README.md",
    "checkout": RAIZ / "app-web" / "assinar" / "index.html",
    "termos": RAIZ / "app-web" / "assinar" / "termos.html",
    "metadados": RAIZ / "produto" / "metadados_lojas.json",
}

PROIBIDOS = {
    r"\b500\s+(?:questões|perguntas)\b": "inventário antigo",
    r"\b5\s+edições\b": "inventário antigo",
    r"fonte citada em cada questão": "somente 526/600 têm referências",
    r"justificad[ao]s? com (?:a )?fonte citada": "cobertura de referências não é total",
    r"conferid[ao] palavra por palavra": "usar cobertura mensurável do gate",
    r"cada enunciado e alternativa (?:é|foi) comparado": "claim absoluto sem relatório",
    r"avisamos por e-mail": "lembrete de vencimento não implementado",
    r"perto do vencimento[^.]{0,80}e-mail": "lembrete de vencimento não implementado",
    r"preços? dos concorrentes": "comparação externa fica obsoleta",
    r"(?<!ou )(?<!nem )(?<!não )garantia de aprovação": "resultado de exame não pode ser prometido",
}


def main():
    erros = []
    textos = {}
    for nome, caminho in SUPERFICIES.items():
        try:
            textos[nome] = caminho.read_text(encoding="utf-8")
        except OSError as erro:
            erros.append(f"{nome}: não foi possível ler {caminho}: {erro}")

    for nome, texto in textos.items():
        for padrao, motivo in PROIBIDOS.items():
            if re.search(padrao, texto, re.IGNORECASE | re.DOTALL):
                erros.append(f"{nome}: /{padrao}/ — {motivo}")

    fatos = {
        "600": CANONICO["questoes"],
        "526": CANONICO["questoes_com_referencias"],
        "74": CANONICO["questoes_sem_referencias"],
    }
    for nome in ("README", "checkout", "metadados"):
        texto = textos.get(nome, "")
        for literal, valor in fatos.items():
            if str(valor) != literal or literal not in texto:
                erros.append(f"{nome}: não declara a cifra canônica {valor}")

    checkout = textos.get("checkout", "")
    for esperado in ('href="termos.html"', 'href="../privacidade/"', "mailto:idarragaa21@gmail.com"):
        if esperado not in checkout:
            erros.append(f"checkout: falta link obrigatório {esperado}")
    termos = textos.get("termos", "")
    for esperado in ("id=\"reembolso\"", "7 dias", "renovação automática", "mailto:idarragaa21@gmail.com"):
        if esperado.casefold() not in termos.casefold():
            erros.append(f"termos: falta informação obrigatória {esperado}")

    if erros:
        print(f"{len(erros)} ERRO(S) DE CLAIMS:")
        for erro in erros:
            print(f"  - {erro}")
        return 1
    print(
        "claims comerciais coerentes: "
        f"{CANONICO['questoes']} questões · {len(CANONICO['edicoes'])} edições · "
        f"{CANONICO['questoes_com_referencias']} com referências · "
        f"{CANONICO['questoes_sem_referencias']} sem referência catalogada."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
