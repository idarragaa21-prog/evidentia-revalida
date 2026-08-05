# -*- coding: utf-8 -*-
"""Unifica fontes repetidas no catalogo e corrige as citacoes que apontam para elas.

O catalogo foi montado por varios revisores em paralelo, e o mesmo documento as vezes
entrou com dois ids ("MS-GVS-2024-V1" e "MS-GVS-6ED-VOL1-2024"). Duas entradas para o
mesmo documento fazem a mesma fonte aparecer duas vezes na tela de uma questao.

Criterio de identidade, do mais forte para o mais fraco:
  1. mesmo DOI (identificador do proprio documento);
  2. mesma URL exata.
Titulo parecido NAO conta: "guia de abscesso anorretal" e "guia de fissura anal" da mesma
sociedade e do mesmo ano tem titulos quase iguais nos primeiros caracteres e sao documentos
diferentes.

Vence o id mais citado nas justificativas; havendo empate, o mais curto (costuma ser o mais
legivel). A verificacao que sobrevive e a mais detalhada das duas.

Uso: python3 scripts/15_unificar_referencias.py [--aplicar]
Sem --aplicar, so mostra o que faria.
"""
import os, sys, json, glob, collections

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DADOS

CATALOGO = os.path.join(DADOS, "referencias.json")
JUST = os.path.join(DADOS, "justificativas")
MAPA_TEMAS = os.path.join(DADOS, "fontes_por_tema.json")


def main():
    aplicar = "--aplicar" in sys.argv
    catalogo = json.load(open(CATALOGO, encoding="utf-8"))

    arquivos = sorted(glob.glob(os.path.join(JUST, "*.json")))
    justificativas = {a: json.load(open(a, encoding="utf-8")) for a in arquivos}

    citacoes = collections.Counter()
    for regs in justificativas.values():
        for r in regs:
            for ref in r.get("referencias") or []:
                citacoes[ref["id"]] += 1

    # agrupa por identidade forte
    grupos = collections.defaultdict(list)
    for fid, f in catalogo.items():
        doi = (f.get("doi") or "").strip().lower()
        url = (f.get("url") or "").strip().rstrip("/").lower()
        chave = ("doi", doi) if doi else (("url", url) if url else ("id", fid))
        grupos[chave].append(fid)

    renomear, descartar = {}, []
    for chave, ids in grupos.items():
        if len(ids) < 2:
            continue
        vencedor = sorted(ids, key=lambda i: (-citacoes[i], len(i), i))[0]
        melhor_verif = max((catalogo[i].get("verificacao", "") for i in ids), key=len)
        catalogo[vencedor]["verificacao"] = melhor_verif
        for perdedor in ids:
            if perdedor != vencedor:
                renomear[perdedor] = vencedor
                descartar.append(perdedor)
        print(f"{chave[0]}: {ids} -> {vencedor}"
              f"   (citacoes: {[citacoes[i] for i in ids]})")

    if not renomear:
        print("nenhuma fonte repetida.")
        return 0

    # aplica nas justificativas, sem deixar a mesma fonte duas vezes na mesma questao
    trocadas, colapsadas = 0, 0
    for caminho, regs in justificativas.items():
        for r in regs:
            refs, vistos = [], set()
            for ref in r.get("referencias") or []:
                novo = renomear.get(ref["id"], ref["id"])
                if novo != ref["id"]:
                    trocadas += 1
                if novo in vistos:
                    colapsadas += 1
                    continue
                vistos.add(novo)
                refs.append({**ref, "id": novo})
            r["referencias"] = refs

    for fid in descartar:
        catalogo.pop(fid, None)

    mapa = {}
    if os.path.exists(MAPA_TEMAS):
        bruto = json.load(open(MAPA_TEMAS, encoding="utf-8"))
        for tema, ids in bruto.items():
            novos = []
            for i in ids:
                n = renomear.get(i, i)
                if n in catalogo and n not in novos:
                    novos.append(n)
            mapa[tema] = novos

    print(f"\n{len(descartar)} fontes repetidas removidas · {trocadas} citacoes reapontadas"
          f" · {colapsadas} citacoes duplicadas colapsadas")
    print(f"catalogo: {len(catalogo) + len(descartar)} -> {len(catalogo)} fontes")

    if not aplicar:
        print("\n(simulacao; rode com --aplicar para gravar)")
        return 0

    json.dump(dict(sorted(catalogo.items())), open(CATALOGO, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    for caminho, regs in justificativas.items():
        json.dump(regs, open(caminho, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if mapa:
        json.dump(mapa, open(MAPA_TEMAS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("gravado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
