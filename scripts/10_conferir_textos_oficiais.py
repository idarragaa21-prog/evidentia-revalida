# -*- coding: utf-8 -*-
"""Confere (e opcionalmente corrige) os textos do banco contra os cadernos do INEP.

Motivo: a extracao original perdeu trechos curtos dentro das frases -- unidades
("130 x 80" sem mmHg), cifras ("duracao de horas" no lugar de "duracao de 8 horas"),
letras iniciais e simbolos (oC no lugar de °C). Sao perdas silenciosas: o texto
continua legivel, mas o dado clinico muda. O caderno de 2024/2 concentra o problema
porque suas fontes vinham com as tabelas de caracteres corrompidas.

Os PDF publicados hoje pelo INEP ja tem texto extraivel, entao a fonte oficial volta
a ser conferivel maquina a maquina.

Metodo, por campo (enunciado e cada alternativa):
  1. localiza o bloco da questao no caderno pelo cabecalho "QUESTAO n";
  2. se o texto do banco aparece inteiro no bloco, nada a fazer;
  3. senao, ancora o maior prefixo e o maior sufixo do texto do banco dentro do
     bloco e adota o trecho oficial entre as duas ancoras -- e o texto do INEP,
     nao uma reconstrucao.

O gabarito, a area, o tema, a explicacao e a figura nunca sao tocados.

Uso:
    python3 scripts/10_conferir_textos_oficiais.py            # so confere
    python3 scripts/10_conferir_textos_oficiais.py --corrigir # grava as correcoes

Requer PyMuPDF e os cadernos em fontes_inep/ (nomes em fontes_inep/FONTES.md).
"""
import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DADOS, FONTES

CADERNOS = {
    "2023/1": "2023_1_PV_objetiva_regular.pdf",
    "2023/2": "2023_2_PV_objetiva_regular.pdf",
    "2024/1": "2024_1_PV_objetiva_regular.pdf",
    "2024/2": "2024_2_PV_objetiva_regular.pdf",
}

# ruido de paginacao que aparece no meio das frases ao concatenar paginas
RODAPES = [
    r"\b2023\s+PRIMEIRA EDIÇÃO\b", r"\b2023\s+SEGUNDA EDIÇÃO\b",
    r"\b2024\s+PRIMEIRA EDIÇÃO\b", r"\b2024\s+SEGUNDA EDIÇÃO\b",
    r"\bÁREA LIVRE\b",
]


def normalizar(texto):
    texto = unicodedata.normalize("NFKC", texto)
    for de, para in [("­", ""), ("‐", "-"), ("‑", "-"),
                     ("“", '"'), ("”", '"'), ("‘", "'"), ("’", "'"),
                     (" ", " ")]:
        texto = texto.replace(de, para)
    return re.sub(r"\s+", " ", texto).strip()


def sem_formatacao(texto):
    """Ignora o que e decisao de apresentacao do banco, nao conteudo do INEP:
    a barra vertical que separa colunas nas tabelas de exames, a capitalizacao
    dos rotulos dessas tabelas e o tracado dos hifens."""
    texto = normalizar(texto).replace("|", " ")
    texto = texto.replace("\u2013", "-").replace("\u2014", "-")
    return re.sub(r"\s+", " ", texto).strip().lower()


# Divergencias conferidas uma a uma e mantidas de proposito: nelas o banco esta
# certo e o caderno e que tem erro de digitacao.
EXCECOES = {
    ("2024/2", 66, "enunciado"): "o caderno traz 'CKP - EPI'; o banco usa a sigla correta CKD-EPI",
    ("2024/2", 79, "alternativas/D"): "o caderno traz 'vaginallis'; o banco usa Trichomonas vaginalis",
    ("2024/2", 73, "enunciado"): "tabela de fototerapia remontada: 'RN IG' expandido para 'recem-nascido com idade gestacional' nos cabecalhos",
    ("2024/2", 60, "enunciado"): "a linha 'Radiografia de torax' ganhou a coluna 'ver imagem', ja que no caderno o resultado e a propria figura",
}


def texto_do_caderno(caminho):
    import fitz
    doc = fitz.open(caminho)
    bruto = " ".join(pagina.get_text() for pagina in doc)
    for padrao in RODAPES:
        bruto = re.sub(padrao, " ", bruto)
    return normalizar(bruto)


def blocos_por_questao(texto):
    """Recorta o caderno em {numero: texto da questao}."""
    marcas = [(int(m.group(1)), m.start(), m.end())
              for m in re.finditer(r"QUESTÃO\s+(\d{1,3})\b", texto)]
    blocos = {}
    for i, (numero, _, fim) in enumerate(marcas):
        prox = marcas[i + 1][1] if i + 1 < len(marcas) else len(texto)
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
    """Quando o texto perdeu trechos no inicio ou em varios pontos, o par
    prefixo/sufixo nao ancora. Aqui o alinhamento de sequencias encontra os
    maiores pedacos em comum e delimita o trecho oficial entre o primeiro e o
    ultimo deles."""
    import difflib
    casador = difflib.SequenceMatcher(None, alvo, bloco, autojunk=False)
    comuns = [b for b in casador.get_matching_blocks() if b.size >= 12]
    if len(comuns) < 2:
        return None
    ini = comuns[0].b
    fim = comuns[-1].b + comuns[-1].size
    candidato = bloco[ini:fim].strip()
    if len(candidato) < len(alvo) or len(candidato) > len(alvo) + 150:
        return None
    if difflib.SequenceMatcher(None, alvo, candidato, autojunk=False).ratio() < 0.90:
        return None
    return candidato


def trecho_oficial(texto_banco, bloco):
    """Texto do caderno correspondente ao campo, ou None se nao for seguro."""
    alvo = normalizar(texto_banco)
    if not alvo:
        return None
    if alvo in bloco:
        return None  # ja confere

    n_pre = maior_prefixo(alvo, bloco)
    n_suf = maior_sufixo(alvo, bloco)
    if n_pre < 25 or n_suf < 12:
        return por_alinhamento(alvo, bloco)

    prefixo, sufixo = alvo[:n_pre], alvo[len(alvo) - n_suf:]
    if bloco.count(prefixo) != 1:
        return por_alinhamento(alvo, bloco)
    ini = bloco.find(prefixo)
    fim = bloco.find(sufixo, ini + n_pre - n_suf if n_pre > n_suf else ini)
    if fim < 0:
        return por_alinhamento(alvo, bloco)
    candidato = bloco[ini:fim + n_suf].strip()

    # o oficial recupera o que se perdeu: nunca deve encurtar nem inchar o texto
    if len(candidato) < len(alvo) or len(candidato) > len(alvo) + 120:
        return por_alinhamento(alvo, bloco)
    return candidato


def conferir(corrigir=False):
    caminho_banco = os.path.join(DADOS, "banco_400_questoes.json")
    banco = json.load(open(caminho_banco, encoding="utf-8"))

    divergencias, corrigidos, sem_ancora = [], 0, []
    for edicao, arquivo in CADERNOS.items():
        caminho = os.path.join(FONTES, arquivo)
        if not os.path.exists(caminho):
            print(f"  {edicao}: caderno ausente em fontes_inep/ ({arquivo}) - pulado")
            continue
        blocos = blocos_por_questao(texto_do_caderno(caminho))
        for questao in banco:
            if questao["edicao"] != edicao:
                continue
            bloco = blocos.get(questao["numero"])
            if bloco is None:
                sem_ancora.append((edicao, questao["numero"], "questao nao localizada no caderno"))
                continue
            campos = [("enunciado", None)] + [("alternativas", L) for L in "ABCD"]
            for campo, letra in campos:
                atual = questao[campo][letra] if letra else questao[campo]
                nome_campo = f"{campo}{'/' + letra if letra else ''}"
                oficial = trecho_oficial(atual, bloco)
                if oficial is None:
                    if normalizar(atual) in bloco:
                        continue
                    # o texto pode diferir so na formatacao de tabela do banco; nas
                    # colunas o PDF ora junta ora separa os espacos, entao a
                    # ultima comparacao ignora o espacamento por completo
                    if sem_formatacao(atual) in sem_formatacao(bloco):
                        continue
                    compacto = re.sub(r"\s+", "", sem_formatacao(atual))
                    if compacto and compacto in re.sub(r"\s+", "", sem_formatacao(bloco)):
                        continue
                    chave = (edicao, questao["numero"], nome_campo)
                    if chave in EXCECOES:
                        continue
                    sem_ancora.append((edicao, questao["numero"],
                                       f"{nome_campo} diverge, sem ancora segura"))
                    continue
                divergencias.append((edicao, questao["numero"],
                                     f"{campo}{'/' + letra if letra else ''}",
                                     normalizar(atual), oficial))
                if corrigir:
                    if letra:
                        questao[campo][letra] = oficial
                    else:
                        questao[campo] = oficial
                    corrigidos += 1

    print(f"campos divergentes do caderno oficial: {len(divergencias)}")
    for edicao, numero, campo, antes, depois in divergencias:
        print(f"\n  {edicao} n {numero} [{campo}]")
        print(f"    banco  : {antes[:150]}")
        print(f"    oficial: {depois[:150]}")
    if sem_ancora:
        print(f"\ncampos que divergem mas nao puderam ser ancorados com seguranca: {len(sem_ancora)}")
        for item in sem_ancora:
            print("   ", item)

    if corrigir and corrigidos:
        json.dump(banco, open(caminho_banco, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=2)
        print(f"\ngravado: {caminho_banco} ({corrigidos} campos atualizados pelo texto oficial)")
    elif corrigir:
        print("\nnada a corrigir")
    return len(divergencias) + len(sem_ancora)


if __name__ == "__main__":
    sys.exit(1 if conferir("--corrigir" in sys.argv) and "--corrigir" not in sys.argv else 0)
