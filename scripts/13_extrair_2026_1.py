# -*- coding: utf-8 -*-
"""Extrai as 100 questoes objetivas do caderno 2026/1 do Revalida.

O caderno de 2026/1 ja vem com texto extraivel, entao aqui nao ha decodificacao de
glifos como em 2024/2: e leitura direta, com validacao dura.

Cuidado principal: depois da questao 100 vem o "questionario de percepcao da prova",
que reinicia a numeracao em 1 e tem cinco alternativas (A-E). Essas nao sao questoes
do exame e ficam de fora.

Entrada : fontes_inep/2026_1_caderno_1_ampliada.pdf (ou REVALIDA_CADERNO_2026)
Saida   : dados/bruto_2026_1.json

Uso: python3 scripts/13_extrair_2026_1.py
"""
import os, sys, re, json, subprocess

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DADOS, FONTES

PADRAO = os.path.join(FONTES, "2026_1_caderno_1_ampliada.pdf")
CADERNO = os.environ.get("REVALIDA_CADERNO_2026", PADRAO)
SAIDA = os.path.join(DADOS, "bruto_2026_1.json")

RE_QUESTAO = re.compile(r"^QUEST[ÃA]O\s+(\d+)\s*$", re.MULTILINE)
RE_ALT = re.compile(r"^\((?P<letra>[A-E])\)\s*(?P<texto>.*)$")


def texto_do_pdf(caminho):
    r = subprocess.run(["pdftotext", "-layout", caminho, "-"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"pdftotext falhou: {r.stderr[:300]}")
    return r.stdout


def blocos(texto):
    """Corta o texto em (numero, corpo) por cabecalho QUESTAO N, na ordem do caderno."""
    marcas = list(RE_QUESTAO.finditer(texto))
    saida = []
    for i, m in enumerate(marcas):
        fim = marcas[i + 1].start() if i + 1 < len(marcas) else len(texto)
        saida.append((int(m.group(1)), texto[m.end():fim]))
    return saida


def separar(corpo):
    """Divide o bloco em enunciado e alternativas. Uma alternativa pode ocupar
    varias linhas; a continuacao pertence a ultima letra aberta."""
    enunciado, alternativas, atual = [], {}, None
    for linha in corpo.splitlines():
        crua = linha.rstrip()
        m = RE_ALT.match(crua.strip())
        if m:
            atual = m.group("letra")
            alternativas[atual] = m.group("texto").strip()
        elif atual:
            if crua.strip():
                alternativas[atual] = (alternativas[atual] + " " + crua.strip()).strip()
        else:
            enunciado.append(crua)
    return "\n".join(enunciado).strip(), alternativas


# Sujeira de diagramacao que o pdftotext traz junto: marcador de pagina em branco,
# rodape com numero da pagina e nome do caderno, e o inicio do questionario de percepcao.
RE_SUJEIRA = re.compile(
    r"\s*(?:[ÁA]REA\s+LIVRE|QUESTION[ÁA]RIO\s+DE\s+PERCEP[ÇC][ÃA]O.*|\d{1,3}\s+CADERNO\s+\d+|CADERNO\s+\d+)\s*",
    re.IGNORECASE,
)


def limpar(texto):
    """Junta as quebras de linha do PDF em paragrafos e tira o mobiliario da pagina."""
    linhas = [l.strip() for l in texto.splitlines()]
    linhas = [l for l in linhas
              if l and not re.fullmatch(r"\d{1,3}", l)
              and not re.fullmatch(r"(?i)caderno\s+\d+|revalida\s*20\d\d.*", l)]
    junto = re.sub(r"\s+", " ", " ".join(linhas)).strip()
    junto = RE_SUJEIRA.sub(" ", junto)
    return re.sub(r"\s+", " ", junto).strip()


def main():
    if not os.path.exists(CADERNO):
        raise SystemExit(
            f"nao encontrei o caderno em {CADERNO}\n"
            "coloque o PDF em fontes_inep/ ou aponte REVALIDA_CADERNO_2026 para ele"
        )
    texto = texto_do_pdf(CADERNO)
    todos = blocos(texto)

    # O exame vai da questao 1 ate a 100, na primeira passagem crescente.
    # Quando a numeracao volta a cair, comecou o questionario de percepcao.
    questoes, ultimo = [], 0
    for numero, corpo in todos:
        if numero <= ultimo:
            break                      # numeracao reiniciou: acabou o exame
        if numero > 100:
            break
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
