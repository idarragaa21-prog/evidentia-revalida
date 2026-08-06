# -*- coding: utf-8 -*-
"""Porta de qualidade das justificativas com referencias.

Confere o catalogo de fontes e as justificativas por edicao contra o banco oficial.
Falha (codigo 1) se encontrar qualquer inconsistencia.

Entrada : dados/banco_400_questoes.json, dados/referencias.json,
          dados/justificativas/<edicao>.json
Uso     : python3 scripts/12_validar_justificativas.py [--parcial]

--parcial permite que faltem justificativas (util enquanto o banco esta sendo escrito);
sem essa opcao, toda questao precisa da sua.
"""
import os, sys, json, re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DADOS

JUST_DIR = os.path.join(DADOS, "justificativas")
CATALOGO = os.path.join(DADOS, "referencias.json")
ALGORITMOS = os.path.join(DADOS, "algoritmos.json")

CAMPOS_ALGORITMO = ("titulo", "fonte_id", "detalhe", "verificado_em", "verificacao",
                    "no_inicial", "nos")
TIPOS_NO = {"inicio", "decisao", "grupo", "conduta", "fim"}

TIPOS = {
    "protocolo_ms", "diretriz_oficial_br", "lei_norma", "diretriz_sociedade",
    "diretriz_internacional", "artigo_cientifico", "livro_texto",
}
CAMPOS_FONTE = ("tipo", "titulo", "autor", "ano", "url", "doi", "verificado_em", "verificacao")

# Citacao solta na prosa: o respaldo tem que estar em `referencias`, nao embutido no texto.
CITACAO_SOLTA = re.compile(r"\bet al\b|\bdoi:|https?://|\bPMID\b", re.IGNORECASE)


def arquivo_da_edicao(edicao):
    return os.path.join(JUST_DIR, edicao.replace("/", "-") + ".json")


def carregar_justificativas(edicoes):
    just = {}
    for ed in edicoes:
        caminho = arquivo_da_edicao(ed)
        if not os.path.exists(caminho):
            continue
        for reg in json.load(open(caminho, encoding="utf-8")):
            just[(ed, reg["numero"])] = reg
    return just


def validar(parcial=False):
    banco = json.load(open(os.path.join(DADOS, "banco_400_questoes.json"), encoding="utf-8"))
    catalogo = json.load(open(CATALOGO, encoding="utf-8")) if os.path.exists(CATALOGO) else {}
    edicoes = sorted({q["edicao"] for q in banco})
    just = carregar_justificativas(edicoes)

    erros, avisos, sem_fonte = [], [], []
    citadas = set()

    # 1. Catalogo de fontes
    for fid, f in sorted(catalogo.items()):
        onde = f"referencias.json[{fid}]"
        faltando = [c for c in CAMPOS_FONTE if c not in f]
        if faltando:
            erros.append(f"{onde}: campos ausentes {faltando}")
            continue
        if not str(f["url"]).strip() and not str(f["doi"]).strip():
            erros.append(f"{onde}: sem url e sem doi — fonte nao localizavel")
        if f["tipo"] not in TIPOS:
            erros.append(f"{onde}: tipo invalido {f['tipo']!r}")
        if not str(f.get("verificado_em", "")).strip():
            erros.append(f"{onde}: sem verificado_em")
        if len(str(f.get("verificacao", "")).strip()) < 20:
            erros.append(f"{onde}: campo verificacao vazio ou generico demais")
        if not isinstance(f["ano"], int) or not (1980 <= f["ano"] <= 2027):
            erros.append(f"{onde}: ano implausivel {f['ano']!r}")

    # 1b. Algoritmos clinicos. A regra e a mesma das referencias: nada desenhado de
    #     memoria. Sem fonte verificada no catalogo, o algoritmo nao entra no produto.
    algoritmos = json.load(open(ALGORITMOS, encoding="utf-8")) if os.path.exists(ALGORITMOS) else {}
    for aid, alg in sorted(algoritmos.items()):
        onde = f"algoritmos.json[{aid}]"
        faltando = [c for c in CAMPOS_ALGORITMO if c not in alg]
        if faltando:
            erros.append(f"{onde}: campos ausentes {faltando}")
            continue
        if alg["fonte_id"] not in catalogo:
            erros.append(f"{onde}: fonte_id {alg['fonte_id']!r} nao existe no catalogo")
        else:
            citadas.add(alg["fonte_id"])
        if len(str(alg.get("verificacao", "")).strip()) < 20:
            erros.append(f"{onde}: campo verificacao vazio ou generico demais")
        if not str(alg.get("detalhe", "")).strip():
            erros.append(f"{onde}: sem detalhe — a fonte precisa dizer ONDE esta cada ramo")

        nos = alg.get("nos") or {}
        if alg.get("no_inicial") not in nos:
            erros.append(f"{onde}: no_inicial {alg.get('no_inicial')!r} nao existe em nos")
            continue

        for chave, no in sorted(nos.items()):
            if no.get("tipo") not in TIPOS_NO:
                erros.append(f"{onde}.{chave}: tipo invalido {no.get('tipo')!r}")
            if not str(no.get("texto", "")).strip():
                erros.append(f"{onde}.{chave}: sem texto")
            destinos = [o.get("vai") for o in (no.get("opcoes") or [])]
            if no.get("vai"):
                destinos.append(no["vai"])
            for destino in destinos:
                if destino not in nos:
                    erros.append(f"{onde}.{chave}: aponta para no inexistente {destino!r}")
            if no.get("tipo") == "decisao" and len(no.get("opcoes") or []) < 2:
                erros.append(f"{onde}.{chave}: decisao com menos de dois ramos")

        # No orfao e sinal de estrutura mal transcrita: um ramo da fonte que se perdeu.
        alcancados, fila = set(), [alg["no_inicial"]]
        while fila:
            atual = fila.pop()
            if atual in alcancados or atual not in nos:
                continue
            alcancados.add(atual)
            no = nos[atual]
            fila.extend(o["vai"] for o in (no.get("opcoes") or []) if o.get("vai"))
            if no.get("vai"):
                fila.append(no["vai"])
        orfaos = sorted(set(nos) - alcancados)
        if orfaos:
            erros.append(f"{onde}: nos inalcancaveis a partir de no_inicial: {orfaos}")


    # 2. Justificativas
    for q in banco:
        chave = (q["edicao"], q["numero"])
        onde = f"{q['edicao']} n. {q['numero']}"
        reg = just.get(chave)
        if reg is None:
            (avisos if parcial else erros).append(f"{onde}: sem justificativa")
            continue

        for campo in ("conceito", "correta"):
            if len(str(reg.get(campo, "")).strip()) < 20:
                erros.append(f"{onde}: campo {campo!r} vazio ou curto demais")

        letras_erradas = set(q["alternativas"]) - ({q["gabarito"]} if q["gabarito"] else set())
        distratores = reg.get("distratores") or {}
        if q["anulada"]:
            if distratores:
                erros.append(f"{onde}: questao anulada nao deve ter distratores")
        elif set(distratores) != letras_erradas:
            erros.append(
                f"{onde}: distratores {sorted(distratores)} != alternativas erradas {sorted(letras_erradas)}"
            )
        else:
            for letra, texto in distratores.items():
                if len(str(texto).strip()) < 15:
                    erros.append(f"{onde}: distrator {letra} vazio ou curto demais")

        # O algoritmo e opcional, mas se citado tem que existir — e ele ja carrega a
        # propria fonte verificada, conferida no bloco 1b.
        alg_id = reg.get("algoritmo")
        if alg_id and alg_id not in algoritmos:
            erros.append(f"{onde}: algoritmo {alg_id!r} nao existe em algoritmos.json")

        refs = reg.get("referencias") or []
        # Ficar sem fonte e aceitavel e ate desejavel quando o catalogo nao cobre o ponto:
        # o aplicativo mostra o selo "estudo" em vez de "N referencias" e ninguem e
        # enganado. O que nao se admite e citar uma fonte que nao sustenta a afirmacao.
        if not refs and not q["anulada"]:
            sem_fonte.append(onde)
        for r in refs:
            rid = r.get("id", "")
            citadas.add(rid)
            if rid not in catalogo:
                erros.append(f"{onde}: referencia {rid!r} nao existe no catalogo")
            if len(str(r.get("detalhe", "")).strip()) < 8:
                erros.append(f"{onde}: referencia {rid!r} sem 'detalhe' (onde na fonte)")

        prosa = " ".join([
            str(reg.get("conceito", "")), str(reg.get("correta", "")),
            " ".join(str(v) for v in distratores.values()),
            " ".join(str(p) for p in reg.get("pontos_chave") or []),
        ])
        achado = CITACAO_SOLTA.search(prosa)
        if achado:
            erros.append(
                f"{onde}: citacao solta na prosa ({achado.group(0)!r}) — use o campo referencias"
            )

    if sem_fonte:
        avisos.append(
            f"{len(sem_fonte)} questoes com justificativa estruturada mas sem fonte no catalogo "
            f"(mostram o selo 'estudo'): {sem_fonte[:6]}{' ...' if len(sem_fonte) > 6 else ''}"
        )

    orfas = sorted(set(catalogo) - citadas)
    if orfas:
        avisos.append(f"{len(orfas)} fontes no catalogo nunca citadas: {orfas[:8]}{' ...' if len(orfas) > 8 else ''}")

    total_just = len(just)
    print(f"banco: {len(banco)} questoes | catalogo: {len(catalogo)} fontes | justificativas: {total_just}")
    if catalogo:
        cobertura = len(citadas & set(catalogo))
        print(f"fontes efetivamente citadas: {cobertura}/{len(catalogo)}")
    for a in avisos:
        print(f"  aviso: {a}")
    if erros:
        print(f"\n{len(erros)} ERRO(S):")
        for e in erros[:60]:
            print(f"  - {e}")
        if len(erros) > 60:
            print(f"  ... e mais {len(erros) - 60}")
        return 1
    print("\nsem erros.")
    return 0


if __name__ == "__main__":
    sys.exit(validar(parcial="--parcial" in sys.argv))
