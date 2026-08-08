# -*- coding: utf-8 -*-
"""Compara o banco inteiro com os cadernos oficiais do INEP, sem falsos verdes.

O gate é *fail-closed*: uma fonte ausente, alterada, uma questão não localizada ou
um campo que não possa ser reconciliado faz o comando terminar com código 1. A
cobertura esperada vem de ``scripts/metricas_produto.json`` e hoje é 600/600.

Por padrão os PDFs são lidos de ``fontes_inep/`` (ou ``REVALIDA_FONTES``). Para
CI, as fontes públicas podem ser baixadas para um cache isolado e são aceitas
somente se o SHA-256 for o auditado neste arquivo:

    python3 scripts/10_conferir_textos_oficiais.py
    python3 scripts/10_conferir_textos_oficiais.py \
      --fontes /tmp/evidentia-fontes --baixar-fontes
    python3 scripts/10_conferir_textos_oficiais.py --json

``--corrigir`` preserva o fluxo histórico de correção assistida, mas nunca é
usado pelo CI. Gabarito, área, tema, explicação e figura não são alterados.
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DADOS, FONTES

BASE_URL = "https://download.inep.gov.br/revalida/provas_e_gabaritos"
FONTES_OFICIAIS = {
    "2023/1": {
        "arquivo": "2023_1_PV_objetiva_regular.pdf",
        "sha256": "a9a0e8be987b62d812c0a52bd342b86a368f96cb6358048515ab164e9ff3367e",
    },
    "2023/2": {
        "arquivo": "2023_2_PV_objetiva_regular.pdf",
        "sha256": "a4253d579ead136f7d2e99cb3dd65c50225ec1d494a6ea550daa5feb5bd14860",
    },
    "2024/1": {
        "arquivo": "2024_1_PV_objetiva_regular.pdf",
        "sha256": "00303164cbe00d3a0b854bd423d8217ed4f0f334cec0042d7d1ef9c06b81b9ae",
    },
    "2024/2": {
        "arquivo": "2024_2_PV_objetiva_regular.pdf",
        "sha256": "c444458f95b34e2431757b050417eb2d09536bbcfc557ae992895bf171975781",
    },
    "2025/1": {
        "arquivo": "2025_1_PV_objetiva_regular.pdf",
        "sha256": "8f7466dec1b175a3d5e23ec237c7b0f9319244607f5c8b784a3f5eec4a9b7b29",
    },
    "2026/1": {
        "arquivo": "2026_1_caderno_1_ampliada.pdf",
        "sha256": "697586fbc3aa0784731e71ddd3cf15bf1f68d3e5ba656fcc51f1fc3a617e860a",
    },
}
for dados_fonte in FONTES_OFICIAIS.values():
    dados_fonte["url"] = f"{BASE_URL}/{dados_fonte['arquivo']}"

# Ruído de paginação que aparece no meio das frases ao concatenar páginas.
RODAPES = [
    r"\b2023\s+PRIMEIRA EDIÇÃO\b", r"\b2023\s+SEGUNDA EDIÇÃO\b",
    r"\b2024\s+PRIMEIRA EDIÇÃO\b", r"\b2024\s+SEGUNDA EDIÇÃO\b",
    r"\bÁREA LIVRE\b",
]

# Divergências editoriais deliberadas e documentadas. Não são escondidas: entram
# no relatório como exceções verificadas, com o motivo abaixo.
EXCECOES = {
    ("2024/2", 23, "enunciado"): {
        "motivo": "tabela laboratorial remontada com barras verticais para preservar colunas na tela",
        "sha256": "fd7d3edd916e0b63808b5073bf49dec65f6c1ca4eac1264aa44fa82991366d5b",
    },
    ("2024/2", 66, "enunciado"): {
        "motivo": "o caderno traz 'CKP - EPI'; o banco usa a sigla correta CKD-EPI",
        "sha256": "15c360770ccfc03802d40629d8b0a170a450da986287c4851d270e35b1856a92",
    },
    ("2024/2", 79, "alternativas/D"): {
        "motivo": "o caderno traz 'vaginallis'; o banco usa Trichomonas vaginalis",
        "sha256": "6dd53dcdca234a44b3962aa21ea19af70d3dbbc5805aa8e942ae8cba2d17ea80",
    },
    ("2024/2", 73, "enunciado"): {
        "motivo": "tabela de fototerapia remontada; os cabeçalhos expandem a sigla RN IG",
        "sha256": "ab762a30c46d364dd874567f2136b0cf77f44d3cd284827e9da2b150e9ddc110",
    },
    ("2024/2", 60, "enunciado"): {
        "motivo": "a tabela ganhou 'ver imagem', pois o resultado é a própria figura",
        "sha256": "57af5b78b8275f28b0e005d4b88aecceb2a7a52d25544c143b86c0424acb1894",
    },
}


def normalizar(texto):
    texto = unicodedata.normalize("NFKC", str(texto))
    for de, para in [("­", ""), ("‐", "-"), ("‑", "-"),
                     ("“", '"'), ("”", '"'), ("‘", "'"), ("’", "'"),
                     (" ", " ")]:
        texto = texto.replace(de, para)
    return re.sub(r"\s+", " ", texto).strip()


def sem_formatacao(texto):
    """Ignora somente decisões visuais de tabela, caixa e traçado de hífen."""
    texto = normalizar(texto).replace("|", " ")
    texto = texto.replace("\u2013", "-").replace("\u2014", "-")
    return re.sub(r"\s+", " ", texto).strip().lower()


def hash_texto(texto):
    return hashlib.sha256(normalizar(texto).encode("utf-8")).hexdigest()


def sha256(caminho: Path):
    resumo = hashlib.sha256()
    with caminho.open("rb") as arquivo:
        for bloco in iter(lambda: arquivo.read(1024 * 1024), b""):
            resumo.update(bloco)
    return resumo.hexdigest()


def baixar_fonte(destino: Path, url: str, hash_esperado: str):
    destino.parent.mkdir(parents=True, exist_ok=True)
    parcial = destino.with_suffix(destino.suffix + ".part")
    requisicao = urllib.request.Request(url, headers={"User-Agent": "EvidentiaQualityGate/1.0"})
    try:
        with urllib.request.urlopen(requisicao, timeout=60) as resposta, parcial.open("wb") as arquivo:
            while bloco := resposta.read(1024 * 1024):
                arquivo.write(bloco)
        obtido = sha256(parcial)
        if obtido != hash_esperado:
            raise ValueError(f"SHA-256 recebido {obtido}; esperado {hash_esperado}")
        parcial.replace(destino)
    except Exception:
        parcial.unlink(missing_ok=True)
        raise


def conferir_fontes(pasta: Path, baixar=False):
    erros = []
    for edicao, fonte in FONTES_OFICIAIS.items():
        caminho = pasta / fonte["arquivo"]
        if baixar and (not caminho.exists() or sha256(caminho) != fonte["sha256"]):
            try:
                baixar_fonte(caminho, fonte["url"], fonte["sha256"])
            except (OSError, ValueError, urllib.error.URLError) as erro:
                erros.append(f"{edicao}: falha ao baixar {fonte['url']}: {erro}")
                continue
        if not caminho.exists():
            erros.append(f"{edicao}: fonte ausente: {caminho}")
            continue
        obtido = sha256(caminho)
        if obtido != fonte["sha256"]:
            erros.append(
                f"{edicao}: SHA-256 inesperado em {caminho.name}: {obtido}; "
                f"esperado {fonte['sha256']}"
            )
    return erros


def texto_do_caderno(caminho):
    try:
        import fitz
    except ImportError as erro:
        raise RuntimeError("falta PyMuPDF: python3 -m pip install pymupdf") from erro
    with fitz.open(caminho) as documento:
        bruto = " ".join(pagina.get_text() for pagina in documento)
    for padrao in RODAPES:
        bruto = re.sub(padrao, " ", bruto)
    return normalizar(bruto)


def blocos_por_questao(texto, numeros_esperados=None):
    """Recorta a primeira sequência completa da prova.

    O caderno ampliado de 2026/1 contém, após a prova, um questionário de nove
    itens também chamado ``QUESTÃO 1``…``QUESTÃO 9``. Procurar a sequência exata
    1–100 impede que esse apêndice sobrescreva as questões reais.
    """
    marcas = [(int(m.group(1)), m.start(), m.end())
              for m in re.finditer(r"QUESTÃO\s+(\d{1,3})\b", texto)]
    if not numeros_esperados:
        blocos = {}
        for i, (numero, _, fim) in enumerate(marcas):
            prox = marcas[i + 1][1] if i + 1 < len(marcas) else len(texto)
            blocos.setdefault(numero, texto[fim:prox].strip())
        return blocos

    esperados = list(numeros_esperados)
    numeros = [m[0] for m in marcas]
    inicio = next(
        (i for i in range(len(marcas) - len(esperados) + 1)
         if numeros[i:i + len(esperados)] == esperados),
        None,
    )
    if inicio is None:
        return {}
    blocos = {}
    for deslocamento, numero in enumerate(esperados):
        indice = inicio + deslocamento
        fim = marcas[indice][2]
        prox = marcas[indice + 1][1] if indice + 1 < len(marcas) else len(texto)
        blocos[numero] = texto[fim:prox].strip()
    return blocos


def maior_prefixo(agulha, palheiro):
    baixo, alto = 0, len(agulha)
    while baixo < alto:
        meio = (baixo + alto + 1) // 2
        if agulha[:meio] in palheiro:
            baixo = meio
        else:
            alto = meio - 1
    return baixo


def maior_sufixo(agulha, palheiro):
    baixo, alto = 0, len(agulha)
    while baixo < alto:
        meio = (baixo + alto + 1) // 2
        if agulha[len(agulha) - meio:] in palheiro:
            baixo = meio
        else:
            alto = meio - 1
    return baixo


def por_alinhamento(alvo, bloco):
    casador = difflib.SequenceMatcher(None, alvo, bloco, autojunk=False)
    comuns = [b for b in casador.get_matching_blocks() if b.size >= 12]
    if len(comuns) < 2:
        return None
    inicio = comuns[0].b
    fim = comuns[-1].b + comuns[-1].size
    candidato = bloco[inicio:fim].strip()
    if len(candidato) < len(alvo) or len(candidato) > len(alvo) + 150:
        return None
    if difflib.SequenceMatcher(None, alvo, candidato, autojunk=False).ratio() < 0.90:
        return None
    return candidato


def trecho_oficial(texto_banco, bloco):
    """Devolve o trecho oficial divergente, ou ``None`` sem âncora segura."""
    alvo = normalizar(texto_banco)
    if not alvo or alvo in bloco:
        return None
    n_pre = maior_prefixo(alvo, bloco)
    n_suf = maior_sufixo(alvo, bloco)
    if n_pre < 25 or n_suf < 12:
        return por_alinhamento(alvo, bloco)
    prefixo, sufixo = alvo[:n_pre], alvo[len(alvo) - n_suf:]
    if bloco.count(prefixo) != 1:
        return por_alinhamento(alvo, bloco)
    inicio = bloco.find(prefixo)
    fim = bloco.find(sufixo, inicio + n_pre - n_suf if n_pre > n_suf else inicio)
    if fim < 0:
        return por_alinhamento(alvo, bloco)
    candidato = bloco[inicio:fim + n_suf].strip()
    if len(candidato) < len(alvo) or len(candidato) > len(alvo) + 120:
        return por_alinhamento(alvo, bloco)
    return candidato


def campo_confere(atual, bloco):
    normalizado = normalizar(atual)
    if normalizado in bloco:
        return True
    visual = sem_formatacao(atual)
    return visual in sem_formatacao(bloco)


def campo_confere_apenas_sem_espacos(atual, bloco):
    """Detecta provável perda de espaços, mas não a aprova silenciosamente."""
    visual = sem_formatacao(atual)
    visual_bloco = sem_formatacao(bloco)
    compacto = re.sub(r"\s+", "", visual)
    return bool(compacto and compacto in re.sub(r"\s+", "", visual_bloco))


def limites_campos(questao, bloco, edicao):
    """Detecta campos truncados que ainda seriam substrings válidas do PDF.

    Conferir apenas ``campo in bloco`` encontra alterações internas, mas aceitaria
    silenciosamente um enunciado sem o começo ou uma alternativa sem o final. Esta
    segunda camada exige que os cinco campos ocupem, em ordem, todo o texto útil da
    questão e que entre eles exista somente o marcador A/B/C/D do caderno.
    """
    campos = [("enunciado", questao["enunciado"])] + [
        (f"alternativas/{letra}", questao["alternativas"][letra]) for letra in "ABCD"
    ]
    bloco_visual = sem_formatacao(bloco)
    posicao = 0
    intervalos = []
    for nome, texto in campos:
        alvo = sem_formatacao(texto)
        inicio = bloco_visual.find(alvo, posicao)
        if inicio < 0:
            # A camada campo-a-campo relata a divergência ou a exceção. Ainda
            # assim, as fronteiras dos demais campos continuam sendo auditadas.
            intervalos.append((nome, None, None))
            continue
        fim = inicio + len(alvo)
        intervalos.append((nome, inicio, fim))
        posicao = fim

    problemas = []
    if intervalos[0][1] is not None and bloco_visual[:intervalos[0][1]].strip():
        problemas.append(
            ("início→enunciado", bloco_visual[:intervalos[0][1]].strip())
        )

    marcadores = [f"({letra.lower()})" for letra in "ABCD"] if edicao == "2026/1" else list("abcd")
    for indice, marcador in enumerate(marcadores):
        anterior = intervalos[indice]
        seguinte = intervalos[indice + 1]
        if anterior[2] is None or seguinte[1] is None:
            continue
        intervalo = bloco_visual[anterior[2]:seguinte[1]].strip()
        if intervalo != marcador:
            problemas.append(
                (f"{anterior[0]}→{seguinte[0]}", intervalo or "<vazio>")
            )

    sufixo = (
        bloco_visual[intervalos[-1][2]:].strip()
        if intervalos[-1][2] is not None else ""
    )
    sufixo_conhecido = (
        not sufixo
        or bool(re.fullmatch(r"(?:primeira|segunda) edição", sufixo))
        or bool(re.fullmatch(r"\d{1,2} caderno 0?1", sufixo))
        or bool(re.match(
            r"^(?:(?:primeira|segunda) edição |\d{1,2} )?"
            r"questionário de percepção (?:sobre a|da) prova\b",
            sufixo,
        ))
        or bool(re.match(
            r"^\d{1,2} caderno 0?1 questionário de percepção da prova\b",
            sufixo,
        ))
    )
    if intervalos[-1][2] is not None and not sufixo_conhecido:
        problemas.append(("alternativas/D→fim", sufixo))
    return problemas


def carregar_baseline():
    caminho = Path(__file__).with_name("metricas_produto.json")
    with caminho.open(encoding="utf-8") as arquivo:
        return json.load(arquivo)["acervo"]


def conferir(corrigir=False, pasta_fontes=FONTES, baixar=False):
    caminho_banco = Path(DADOS) / "banco_400_questoes.json"
    with caminho_banco.open(encoding="utf-8") as arquivo:
        banco = json.load(arquivo)
    baseline = carregar_baseline()
    pasta = Path(pasta_fontes)

    erros_fontes = conferir_fontes(pasta, baixar=baixar)
    edicoes_banco = sorted({q.get("edicao") for q in banco})
    erros_estrutura = []
    if len(banco) != baseline["questoes"]:
        erros_estrutura.append(
            f"banco tem {len(banco)} questões; baseline exige {baseline['questoes']}"
        )
    if edicoes_banco != baseline["edicoes"]:
        erros_estrutura.append(
            f"edições do banco {edicoes_banco}; baseline exige {baseline['edicoes']}"
        )
    if sorted(FONTES_OFICIAIS) != baseline["edicoes"]:
        erros_estrutura.append("mapa de fontes oficiais não cobre exatamente as edições canônicas")

    divergencias, sem_ancora, formatacao_suspeita, limites_suspeitos, excecoes = [], [], [], [], []
    cobertura = {}
    for edicao in baseline["edicoes"]:
        questoes = sorted(
            (q for q in banco if q.get("edicao") == edicao),
            key=lambda q: q.get("numero", 0),
        )
        numeros = [q.get("numero") for q in questoes]
        stats = {
            "esperadas": len(questoes), "localizadas": 0,
            "campos_esperados": len(questoes) * 5, "campos_conferidos": 0,
            "divergencias": 0, "formatacao_suspeita": 0,
            "limites_suspeitos": 0, "sem_ancora": 0, "excecoes": 0,
        }
        cobertura[edicao] = stats
        fonte = FONTES_OFICIAIS[edicao]
        caminho = pasta / fonte["arquivo"]
        if any(erro.startswith(f"{edicao}:") for erro in erros_fontes):
            continue
        try:
            blocos = blocos_por_questao(texto_do_caderno(caminho), numeros)
        except (OSError, RuntimeError, ValueError) as erro:
            erros_estrutura.append(f"{edicao}: não foi possível ler {caminho.name}: {erro}")
            continue
        if not blocos:
            erros_estrutura.append(
                f"{edicao}: não foi encontrada a sequência completa de {len(numeros)} questões"
            )
            continue

        for questao in questoes:
            numero = questao["numero"]
            bloco = blocos.get(numero)
            if bloco is None:
                sem_ancora.append((edicao, numero, "questão não localizada no caderno"))
                stats["sem_ancora"] += 1
                continue
            stats["localizadas"] += 1
            campos = [("enunciado", None)] + [("alternativas", letra) for letra in "ABCD"]
            for campo, letra in campos:
                stats["campos_conferidos"] += 1
                atual = questao[campo][letra] if letra else questao[campo]
                nome_campo = f"{campo}{'/' + letra if letra else ''}"
                if campo_confere(atual, bloco):
                    continue
                chave = (edicao, numero, nome_campo)
                if chave in EXCECOES:
                    excecao = EXCECOES[chave]
                    obtido = hash_texto(atual)
                    if obtido != excecao["sha256"]:
                        sem_ancora.append((
                            edicao, numero,
                            f"{nome_campo}: exceção editorial alterada; SHA-256 {obtido}",
                        ))
                        stats["sem_ancora"] += 1
                    else:
                        excecoes.append((*chave, excecao["motivo"]))
                        stats["excecoes"] += 1
                    continue
                if campo_confere_apenas_sem_espacos(atual, bloco):
                    formatacao_suspeita.append(
                        (edicao, numero, nome_campo,
                         "só coincide quando todos os espaços são removidos")
                    )
                    stats["formatacao_suspeita"] += 1
                    continue
                oficial = trecho_oficial(atual, bloco)
                if oficial is None:
                    sem_ancora.append((edicao, numero, f"{nome_campo} diverge, sem âncora segura"))
                    stats["sem_ancora"] += 1
                    continue
                divergencias.append((edicao, numero, nome_campo, normalizar(atual), oficial))
                stats["divergencias"] += 1
                if corrigir:
                    if letra:
                        questao[campo][letra] = oficial
                    else:
                        questao[campo] = oficial

            # Esta camada impede o falso verde de aceitar um prefixo truncado
            # apenas porque ele ainda aparece dentro do texto oficial.
            for fronteira, trecho in limites_campos(questao, bloco, edicao):
                limites_suspeitos.append((edicao, numero, fronteira, trecho))
                stats["limites_suspeitos"] += 1

    total_localizadas = sum(s["localizadas"] for s in cobertura.values())
    total_campos = sum(s["campos_conferidos"] for s in cobertura.values())
    if total_localizadas != baseline["questoes"]:
        erros_estrutura.append(
            f"cobertura incompleta: {total_localizadas}/{baseline['questoes']} questões localizadas"
        )

    if corrigir and divergencias and not (
        erros_fontes or erros_estrutura or formatacao_suspeita or limites_suspeitos or sem_ancora
    ):
        with caminho_banco.open("w", encoding="utf-8") as arquivo:
            json.dump(banco, arquivo, ensure_ascii=False, indent=2)

    ok = not (
        erros_fontes or erros_estrutura or divergencias or formatacao_suspeita
        or limites_suspeitos or sem_ancora
    )
    return {
        "ok": ok,
        "esperadas": baseline["questoes"],
        "localizadas": total_localizadas,
        "campos_conferidos": total_campos,
        "cobertura_por_edicao": cobertura,
        "erros_fontes": erros_fontes,
        "erros_estrutura": erros_estrutura,
        "divergencias": divergencias,
        "formatacao_suspeita": formatacao_suspeita,
        "limites_suspeitos": limites_suspeitos,
        "sem_ancora": sem_ancora,
        "excecoes_verificadas": excecoes,
        "corrigidos": len(divergencias) if corrigir and not (
            erros_fontes or erros_estrutura or formatacao_suspeita or limites_suspeitos or sem_ancora
        ) else 0,
    }


def imprimir_relatorio(relatorio):
    print("CONFERÊNCIA CONTRA CADERNOS OFICIAIS DO INEP")
    print(
        f"  cobertura: {relatorio['localizadas']}/{relatorio['esperadas']} questões · "
        f"{relatorio['campos_conferidos']} campos comparados"
    )
    for edicao, stats in relatorio["cobertura_por_edicao"].items():
        print(
            f"  {edicao}: {stats['localizadas']}/{stats['esperadas']} questões · "
            f"{stats['campos_conferidos']}/{stats['campos_esperados']} campos · "
            f"{stats['divergencias']} divergência(s) · "
            f"{stats['formatacao_suspeita']} formatação suspeita · "
            f"{stats['limites_suspeitos']} limite(s) suspeito(s) · {stats['sem_ancora']} sem âncora"
        )
    for titulo, chave in (
        ("FONTES AUSENTES OU ALTERADAS", "erros_fontes"),
        ("ERROS DE ESTRUTURA/COBERTURA", "erros_estrutura"),
    ):
        if relatorio[chave]:
            print(f"\n{titulo}:")
            for item in relatorio[chave]:
                print(f"  - {item}")
    if relatorio["divergencias"]:
        print(f"\nDIVERGÊNCIAS ANCORADAS: {len(relatorio['divergencias'])}")
        for edicao, numero, campo, antes, depois in relatorio["divergencias"]:
            print(f"  - {edicao} n. {numero} [{campo}]")
            print(f"      banco:   {antes[:180]}")
            print(f"      oficial: {depois[:180]}")
    if relatorio["formatacao_suspeita"]:
        print(f"\nFORMATAÇÃO SUSPEITA: {len(relatorio['formatacao_suspeita'])}")
        print("  Estes campos só coincidem ao remover todos os espaços; exigem revisão humana.")
        for item in relatorio["formatacao_suspeita"]:
            print(f"  - {item}")
    if relatorio["limites_suspeitos"]:
        print(f"\nLIMITES DE CAMPO SUSPEITOS: {len(relatorio['limites_suspeitos'])}")
        print("  O texto existe no PDF, mas não ocupa o campo completo entre os marcadores.")
        for edicao, numero, fronteira, trecho in relatorio["limites_suspeitos"]:
            print(f"  - {edicao} n. {numero} [{fronteira}]: {trecho[:180]}")
    if relatorio["sem_ancora"]:
        print(f"\nDIVERGÊNCIAS SEM ÂNCORA: {len(relatorio['sem_ancora'])}")
        for item in relatorio["sem_ancora"]:
            print(f"  - {item}")
    if relatorio["excecoes_verificadas"]:
        print(f"\nEXCEÇÕES EDITORIAIS DOCUMENTADAS: {len(relatorio['excecoes_verificadas'])}")
        for edicao, numero, campo, motivo in relatorio["excecoes_verificadas"]:
            print(f"  - {edicao} n. {numero} [{campo}]: {motivo}")
    print("\nRESULTADO: " + ("APROVADO — cobertura completa, sem divergências" if relatorio["ok"] else "REPROVADO — não publicar até resolver os itens acima"))


def argumentos(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fontes", default=FONTES, help="pasta dos cadernos oficiais")
    parser.add_argument("--baixar-fontes", action="store_true", help="baixar fontes ausentes e validar SHA-256")
    parser.add_argument("--corrigir", action="store_true", help="aplicar divergências ancoradas ao banco (nunca usado em CI)")
    parser.add_argument("--json", action="store_true", help="emitir relatório JSON")
    return parser.parse_args(argv)


def main(argv=None):
    args = argumentos(argv)
    relatorio = conferir(args.corrigir, args.fontes, args.baixar_fontes)
    if args.json:
        print(json.dumps(relatorio, ensure_ascii=False, indent=2))
    else:
        imprimir_relatorio(relatorio)
    return 0 if relatorio["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
