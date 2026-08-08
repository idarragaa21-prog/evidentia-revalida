#!/usr/bin/env python3
"""Impede que bundles completos ou fontes premium voltem ao indice Git.

O gate trabalha sobre ``git ls-files``: em CI isso representa exatamente os
arquivos que o commit publicaria. A verificacao por conteudo dos HTML tambem
detecta um bundle completo renomeado, sem depender apenas do caminho.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Callable, Iterable


RAIZ = Path(__file__).resolve().parents[1]
LIMITE_AMOSTRA_PUBLICA = 40
ATIVOS_PUBLICOS_EM_DADOS = {
    "dados/favicon_b64.txt",
    "dados/logo_b64.txt",
}

CAMINHOS_PROIBIDOS = {
    "aplicativo/Revalida_Evidentia.html",
    "aplicativo/Revalida_Evidentia_android.html",
    "aplicativo/Revalida_Evidentia_ios.html",
    "aplicativo/Revalida_Evidentia_teste.html",
    "app-android/www/index.html",
    "app-android/android/app/src/main/assets/public/index.html",
    "scripts/verificar_gabaritos.py",
}


def motivo_caminho_proibido(caminho: str) -> str | None:
    """Retorna o motivo de bloqueio para fontes conhecidas como privadas."""
    if caminho in CAMINHOS_PROIBIDOS:
        if caminho == "scripts/verificar_gabaritos.py":
            return "fonte que incorpora 400 respostas oficiais"
        return "artefato gerado completo ou de teste"
    if caminho.startswith("aplicativo/") and caminho.endswith(".html"):
        if caminho != "aplicativo/Revalida_Evidentia_livre.html":
            return "bundle gerado fora da amostra publica autorizada"
    if caminho.startswith("app-android/www/"):
        return "bundle Android gerado"
    if caminho.startswith("app-android/android/app/src/main/assets/public/"):
        return "bundle Android empacotado"
    if caminho.startswith("dados/") and caminho not in ATIVOS_PUBLICOS_EM_DADOS:
        return "fonte de dados nao autorizada no repositorio publico"
    if caminho.startswith("scripts/justificativas_"):
        return "fonte editorial de justificativas"
    if caminho.startswith("scripts/tabelas_") and caminho.endswith(".py"):
        return "transcricao de conteudo de prova"
    if caminho.startswith("fontes_inep/") and caminho.endswith(".pdf"):
        return "caderno oficial de terceiro"
    return None


def extrair_json_depois(texto: str, marcador: str):
    """Decodifica o primeiro valor JSON apos um marcador JavaScript."""
    posicao = texto.find(marcador)
    if posicao < 0:
        return None
    trecho = texto[posicao + len(marcador) :].lstrip()
    try:
        valor, _ = json.JSONDecoder().raw_decode(trecho)
    except (json.JSONDecodeError, TypeError):
        return None
    return valor


def auditar_html(caminho: str, texto: str) -> list[str]:
    """Detecta um bundle premium mesmo se tiver sido renomeado."""
    violacoes: list[str] = []
    questoes = extrair_json_depois(texto, "const QUESTOES =")
    if isinstance(questoes, list) and len(questoes) > LIMITE_AMOSTRA_PUBLICA:
        violacoes.append(
            f"{caminho}: incorpora {len(questoes)} questoes "
            f"(maximo publico: {LIMITE_AMOSTRA_PUBLICA})"
        )

    meta = extrair_json_depois(texto, "const META =")
    if isinstance(meta, dict):
        total = meta.get("total")
        if isinstance(total, int) and total > LIMITE_AMOSTRA_PUBLICA:
            violacoes.append(
                f"{caminho}: META.total={total} "
                f"(maximo publico: {LIMITE_AMOSTRA_PUBLICA})"
            )
    return violacoes


def encontrar_violacoes(
    caminhos: Iterable[str], leitor: Callable[[str], str]
) -> list[str]:
    violacoes: list[str] = []
    for caminho in sorted(set(caminhos)):
        motivo = motivo_caminho_proibido(caminho)
        if motivo:
            violacoes.append(f"{caminho}: {motivo}")
            continue
        if caminho.endswith(".html"):
            try:
                texto = leitor(caminho)
            except (OSError, UnicodeError):
                continue
            violacoes.extend(auditar_html(caminho, texto))
    return violacoes


def caminhos_rastreados() -> list[str]:
    bruto = subprocess.check_output(
        ["git", "ls-files", "-z"], cwd=RAIZ
    )
    return [item.decode("utf-8") for item in bruto.split(b"\0") if item]


def ler_indice(caminho: str) -> str:
    """Le o blob do indice, e nao uma copia de trabalho possivelmente diferente."""
    bruto = subprocess.check_output(
        ["git", "show", f":{caminho}"], cwd=RAIZ
    )
    return bruto.decode("utf-8")


def verificar_documentos_de_licenca() -> list[str]:
    exigidos = (
        "LICENSE",
        "LICENSE-CODE",
        "CONTENT_LICENSE.md",
        "AVISO_DE_CONTEUDO.md",
    )
    return [
        f"{nome}: documento de licenca ausente"
        for nome in exigidos
        if not (RAIZ / nome).is_file()
    ]


def auto_teste() -> int:
    arquivos = {
        "publico/amostra.html": (
            'const QUESTOES = [{"id": 1}];\n'
            'const META = {"total": 1, "edicao_app": "livre"};\n'
        ),
        "publico/bundle-renomeado.html": (
            "const QUESTOES = " + json.dumps([{"id": i} for i in range(41)]) + ";\n"
        ),
        "publico/meta-renomeado.html": 'const META = {"total": 600};\n',
        "dados/vazamento.json": "[]",
    }
    violacoes = encontrar_violacoes(arquivos, arquivos.__getitem__)
    falhas = []
    if any("amostra.html" in item for item in violacoes):
        falhas.append("a amostra livre gerou falso positivo")
    if not any("bundle-renomeado.html" in item for item in violacoes):
        falhas.append("o array de 41 questoes nao foi bloqueado")
    if not any("meta-renomeado.html" in item for item in violacoes):
        falhas.append("META.total=600 nao foi bloqueado")
    if not any("dados/vazamento.json" in item for item in violacoes):
        falhas.append("um novo arquivo em dados/ nao foi bloqueado")
    if falhas:
        for falha in falhas:
            print(f"auto-teste: {falha}", file=sys.stderr)
        return 1
    print("auto-teste do gate de conteudo: OK")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    argumentos = parser.parse_args()
    if argumentos.self_test:
        return auto_teste()

    try:
        violacoes = verificar_documentos_de_licenca()
        violacoes.extend(encontrar_violacoes(caminhos_rastreados(), ler_indice))
    except (OSError, subprocess.CalledProcessError) as erro:
        print(f"nao foi possivel auditar o indice Git: {erro}", file=sys.stderr)
        return 2

    if violacoes:
        print("CONTEUDO PROIBIDO NO REPOSITORIO PUBLICO:", file=sys.stderr)
        for violacao in violacoes:
            print(f"- {violacao}", file=sys.stderr)
        print(
            "Remova apenas do indice com `git rm --cached -- <arquivo>`; "
            "nao apague a fonte privada local.",
            file=sys.stderr,
        )
        return 1

    print(
        f"gate de conteudo publico: OK "
        f"(amostra maxima: {LIMITE_AMOSTRA_PUBLICA} questoes)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
