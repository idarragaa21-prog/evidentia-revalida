# -*- coding: utf-8 -*-
"""Extrai as 100 questoes objetivas do caderno 2025/1 do Revalida.

Diferenca em relacao ao 13_extrair_2026_1.py: o caderno de 2025/1 so existe na
versao REGULAR, diagramada em DUAS COLUNAS. Com `pdftotext -layout` as duas colunas
saem lado a lado na mesma linha — a questao 1 misturada com a questao 3 —, o que
produziria enunciados corrompidos sem nenhum erro visivel. Por isso aqui se usa o
modo `-raw`, que segue a ordem de leitura do PDF e devolve a numeracao crescente.

O gabarito nao entra aqui: vem do PDF oficial em 20_gabarito_2025_1.py.

Entrada : fontes_inep/2025_1_PV_objetiva_regular.pdf
Saida   : dados/bruto_2025_1.json

Uso: python3 scripts/19_extrair_2025_1.py
"""
import os, sys, re, json, subprocess

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DADOS, FONTES

CADERNO = os.path.join(FONTES, "2025_1_PV_objetiva_regular.pdf")
SAIDA = os.path.join(DADOS, "bruto_2025_1.json")

RE_QUESTAO = re.compile(r"^\s*QUEST[ÃA]O\s+(\d+)\s*$", re.MULTILINE)
# No caderno regular a letra vem solta antes do texto: "A conceder alta medica..."
RE_ALT = re.compile(r"^(?P<letra>[A-E])\s+(?P<texto>\S.*)$")


def texto_do_pdf(caminho):
    r = subprocess.run(["pdftotext", "-raw", caminho, "-"], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"pdftotext falhou: {r.stderr[:300]}")
    return r.stdout


def blocos(texto):
    marcas = list(RE_QUESTAO.finditer(texto))
    saida = []
    for i, m in enumerate(marcas):
        fim = marcas[i + 1].start() if i + 1 < len(marcas) else len(texto)
        saida.append((int(m.group(1)), texto[m.end():fim]))
    return saida


RE_FIM_PROVA = re.compile(r"QUESTION[ÁA]RIO\s+DE\s+PERCEP[ÇC][ÃA]O", re.IGNORECASE)


def separar(corpo):
    """Enunciado e alternativas.

    A letra vem solta no inicio da linha ("A conceder alta medica..."), e em
    portugues muita frase comeca por «A» — «A medica de uma penitenciaria avalia...»
    e o enunciado da questao 5, nao a alternativa A. Marcar a primeira linha que
    casa com o padrao engoliria o enunciado inteiro.

    Por isso as alternativas se procuram de tras para frente: interessa a ULTIMA
    sequencia A<B<C<D em linhas crescentes, que e sempre o bloco de respostas no
    fim da questao. O que vem antes dela e enunciado, comece pela letra que comecar.
    """
    # A questao 100 e seguida do questionario de percepcao, que tem alternativas A-E.
    corte = RE_FIM_PROVA.search(corpo)
    if corte:
        corpo = corpo[:corte.start()]

    linhas = [l.strip() for l in corpo.splitlines()]
    candidatos = {}
    for i, l in enumerate(linhas):
        m = RE_ALT.match(l)
        if m:
            candidatos.setdefault(m.group("letra"), []).append(i)

    inicio = None
    for iA in reversed(candidatos.get("A", [])):
        seq, anterior = {"A": iA}, iA
        for letra in ("B", "C", "D"):
            seguinte = next((i for i in candidatos.get(letra, []) if i > anterior), None)
            if seguinte is None:
                break
            seq[letra] = seguinte
            anterior = seguinte
        if len(seq) == 4:
            inicio = seq
            break

    if inicio is None:
        return "\n".join(linhas).strip(), {}

    enunciado = "\n".join(linhas[:inicio["A"]]).strip()
    alternativas, atual = {}, None
    for i in range(inicio["A"], len(linhas)):
        letra = next((k for k, v in inicio.items() if v == i), None)
        if letra:
            atual = letra
            alternativas[atual] = RE_ALT.match(linhas[i]).group("texto").strip()
        elif atual and linhas[i]:
            alternativas[atual] = (alternativas[atual] + " " + linhas[i]).strip()
    return enunciado, alternativas


RE_SUJEIRA = re.compile(
    r"\s*(?:[ÁA]REA\s+LIVRE|QUESTION[ÁA]RIO\s+DE\s+PERCEP[ÇC][ÃA]O.*|PRIMEIRA\s+EDI[ÇC][ÃA]O"
    r"|REVALIDA\s*20\d\d.*?|CADERNO\s+\d+)\s*",
    re.IGNORECASE,
)


def limpar(texto):
    linhas = [l.strip() for l in texto.splitlines()]
    linhas = [l for l in linhas
              if l and not re.fullmatch(r"\d{1,3}", l)
              and not re.fullmatch(r"(?i)caderno\s+\d+|revalida\s*20\d\d.*|primeira\s+edi[çc][ãa]o", l)]
    junto = re.sub(r"\s+", " ", " ".join(linhas)).strip()
    junto = RE_SUJEIRA.sub(" ", junto)
    return re.sub(r"\s+", " ", junto).strip()


def main():
    if not os.path.exists(CADERNO):
        raise SystemExit(f"nao encontrei o caderno em {CADERNO}")

    todos = blocos(texto_do_pdf(CADERNO))

    questoes, ultimo = [], 0
    for numero, corpo in todos:
        if numero <= ultimo or numero > 100:
            break                      # numeracao reiniciou: comecou o questionario
        enun, alts = separar(corpo)
        questoes.append({"numero": numero,
                         "enunciado": limpar(enun),
                         "alternativas": {k: limpar(v) for k, v in alts.items()}})
        ultimo = numero

    # Validacao dura: qualquer surpresa aborta em vez de gerar banco silenciosamente torto.
    erros = []
    if len(questoes) != 100:
        erros.append(f"esperava 100 questoes, achei {len(questoes)}")
    vistos = [q["numero"] for q in questoes]
    if vistos != list(range(1, len(questoes) + 1)):
        faltando = sorted(set(range(1, 101)) - set(vistos))
        erros.append(f"numeracao com buracos; faltam {faltando[:12]}")
    for q in questoes:
        letras = set(q["alternativas"])
        if letras != {"A", "B", "C", "D"}:
            erros.append(f"q{q['numero']}: alternativas {sorted(letras)} (esperava A-D)")
        for k, v in q["alternativas"].items():
            if len(v) < 2:
                erros.append(f"q{q['numero']}: alternativa {k} vazia ou curta demais")
        if len(q["enunciado"]) < 60:
            erros.append(f"q{q['numero']}: enunciado curto demais ({len(q['enunciado'])} chars)")

    if erros:
        print(f"{len(erros)} PROBLEMA(S) na extracao:")
        for e in erros[:30]:
            print(f"  - {e}")
        if len(erros) > 30:
            print(f"  ... e mais {len(erros) - 30}")
        return 1

    json.dump(questoes, open(SAIDA, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    tam = [len(q["enunciado"]) for q in questoes]
    print(f"extraidas {len(questoes)} questoes -> {SAIDA}")
    print(f"  enunciado: min {min(tam)} / mediana {sorted(tam)[len(tam)//2]} / max {max(tam)} chars")
    return 0


if __name__ == "__main__":
    sys.exit(main())
