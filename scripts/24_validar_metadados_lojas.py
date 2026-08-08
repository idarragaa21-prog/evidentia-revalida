# -*- coding: utf-8 -*-
"""Valida limites e claims do arquivo produto/metadados_lojas.json."""
from __future__ import annotations

import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ARQUIVO = RAIZ / "produto" / "metadados_lojas.json"

PROIBIDOS = {
    r"fonte citada em cada": "cobertura de referências não é total",
    r"palavra por palavra": "usar o resultado mensurável do gate, não claim absoluto",
    r"aplicativo oficial": "pode sugerir vínculo institucional",
    r"(?<!nem )(?<!não )garantia de aprova": "não prometer resultado no exame",
    r"melhor|n[úu]mero\s*1|#1": "ranking ou superioridade sem evidência",
    r"avisamos por e-mail": "lembrete ainda não implementado",
}


def tamanho(texto):
    return len(str(texto))


def main():
    erros = []
    try:
        dados = json.loads(ARQUIVO.read_text(encoding="utf-8"))
        apple = dados["app_store"]
        play = dados["google_play"]
        capturas = dados["capturas_lojas"]
    except (OSError, json.JSONDecodeError, KeyError) as erro:
        print(f"metadados inválidos: {erro}")
        return 1

    limites = [
        ("App Store nome", apple["nome"], 30, "caracteres"),
        ("App Store subtítulo", apple["subtitulo"], 30, "caracteres"),
        ("App Store texto promocional", apple["texto_promocional"], 170, "caracteres"),
        ("App Store descrição", apple["descricao"], 4000, "caracteres"),
        ("Google Play nome", play["nome"], 30, "caracteres"),
        ("Google Play descrição curta", play["descricao_curta"], 80, "caracteres"),
        ("Google Play descrição completa", play["descricao_completa"], 4000, "caracteres"),
    ]
    for nome, texto, limite, unidade in limites:
        usado = tamanho(texto)
        print(f"  {nome}: {usado}/{limite} {unidade}")
        if usado > limite:
            erros.append(f"{nome}: {usado} > {limite}")

    bytes_keywords = len(apple["palavras_chave"].encode("utf-8"))
    print(f"  App Store palavras-chave: {bytes_keywords}/100 bytes")
    if bytes_keywords > 100:
        erros.append(f"App Store palavras-chave: {bytes_keywords} > 100 bytes")

    texto_publico = "\n".join([
        apple["nome"], apple["subtitulo"], apple["texto_promocional"],
        apple["palavras_chave"], apple["descricao"], play["nome"],
        play["descricao_curta"], play["descricao_completa"],
        play["feature_graphic"]["titulo"], play["feature_graphic"]["subtitulo"],
        *[f"{item['titulo']} {item['subtitulo']}" for item in capturas],
    ])
    for padrao, motivo in PROIBIDOS.items():
        if re.search(padrao, texto_publico, re.IGNORECASE):
            erros.append(f"claim proibido /{padrao}/: {motivo}")

    for rotulo, texto in (("App Store descrição", apple["descricao"]),
                          ("Google Play descrição", play["descricao_completa"])):
        for necessario in ("600", "seis edições", "526", "74", "sem vínculo"):
            if necessario.casefold() not in texto.casefold():
                erros.append(f"{rotulo}: falta o fato obrigatório {necessario!r}")

    for campo in ("url_privacidade", "url_suporte", "url_marketing"):
        if not str(apple[campo]).startswith("https://"):
            erros.append(f"App Store {campo}: deve usar HTTPS")
    if not str(play["url_privacidade"]).startswith("https://"):
        erros.append("Google Play url_privacidade: deve usar HTTPS")
    if not str(play.get("url_exclusao_conta", "")).startswith("https://") \
            or not str(play.get("url_exclusao_conta", "")).endswith("/excluir-conta/"):
        erros.append("Google Play url_exclusao_conta: URL HTTPS dedicada ausente ou inválida")
    feature = play.get("feature_graphic") or {}
    for campo in ("titulo", "subtitulo", "alt_text"):
        if not str(feature.get(campo, "")).strip():
            erros.append(f"Google Play feature_graphic: falta {campo}")
    if len(str(feature.get("alt_text", ""))) > 140:
        erros.append("Google Play feature_graphic: alt_text ultrapassa 140 caracteres")

    if len(capturas) != 6 or [item.get("ordem") for item in capturas] != list(range(1, 7)):
        erros.append("capturas_lojas: exige seis itens ordenados de 1 a 6")
    telas = [item.get("tela") for item in capturas]
    if len(set(telas)) != len(telas):
        erros.append("capturas_lojas: telas repetidas")
    for item in capturas:
        onde = f"captura {item.get('ordem', '?')}"
        for campo in ("tela", "titulo", "subtitulo", "alt_text", "precondicao"):
            if not str(item.get(campo, "")).strip():
                erros.append(f"{onde}: falta {campo}")
        if len(str(item.get("titulo", ""))) > 40:
            erros.append(f"{onde}: título longo demais para leitura na imagem")
        if len(str(item.get("subtitulo", ""))) > 80:
            erros.append(f"{onde}: subtítulo longo demais para leitura na imagem")
        if len(str(item.get("alt_text", ""))) > 140:
            erros.append(f"{onde}: alt_text ultrapassa 140 caracteres")

    if erros:
        print(f"\n{len(erros)} ERRO(S):")
        for erro in erros:
            print(f"  - {erro}")
        return 1
    print("\nmetadados dentro dos limites e sem claims proibidos.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
