# -*- coding: utf-8 -*-
"""Monta o aplicativo final (arquivo HTML unico) a partir do modelo e dos dados.

Entrada : modelo/app_template.html, dados/banco_400_questoes.json, dados/figuras.json,
          dados/logo_b64.txt, dados/favicon_b64.txt
Saida   : aplicativo/Revalida_Evidentia.html

Uso: python3 scripts/08_montar_aplicativo.py
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DADOS, MODELO, APLICATIVO


def ano(edicao):
    return int(edicao.split("/")[0])


def main():
    banco = json.load(open(os.path.join(DADOS, "banco_400_questoes.json"), encoding="utf-8"))
    figuras = json.load(open(os.path.join(DADOS, "figuras.json"), encoding="utf-8"))

    questoes = [{
        "id": f'{r["edicao"].replace("/", ".")}-Q{r["numero"]:03d}',
        "edicao": r["edicao"],
        "ano": ano(r["edicao"]),
        "numero": r["numero"],
        "area": r.get("area"),
        "tema": r.get("tema", ""),
        "anulada": bool(r["anulada"]),
        "enunciado": r["enunciado"],
        "alternativas": r["alternativas"],
        "gabarito": r["gabarito"],
        "explicacao": r.get("explicacao", ""),
        "figura": r.get("figura"),
    } for r in banco]

    meta = {
        "edicoes": sorted({r["edicao"] for r in banco}),
        "total": len(questoes),
        "validas": sum(1 for q in questoes if not q["anulada"]),
        "fonte": "INEP — Revalida",
    }
    figs = {k: v["b64"] for k, v in figuras.items()}

    modelo = open(os.path.join(MODELO, "app_template.html"), encoding="utf-8").read()
    logo = open(os.path.join(DADOS, "logo_b64.txt"), encoding="utf-8").read().strip()
    favicon = open(os.path.join(DADOS, "favicon_b64.txt"), encoding="utf-8").read().strip()

    saida = (modelo
             .replace("/*__DATA__*/ []", json.dumps(questoes, ensure_ascii=False), 1)
             .replace("/*__META__*/ {}", json.dumps(meta, ensure_ascii=False), 1)
             .replace("/*__FIGS__*/ {}", json.dumps(figs), 1)
             .replace("__FAVICON__", favicon)
             .replace("__LOGO__", logo))

    for marcador in ["/*__DATA__*/", "/*__META__*/", "/*__FIGS__*/", "__LOGO__", "__FAVICON__"]:
        assert marcador not in saida, f"marcador nao substituido: {marcador}"

    os.makedirs(APLICATIVO, exist_ok=True)
    destino = os.path.join(APLICATIVO, "Revalida_Evidentia.html")
    open(destino, "w", encoding="utf-8").write(saida)
    print(f"gerado: {destino}")
    print(f"  {round(len(saida)/1024/1024, 2)} MB - {len(questoes)} questoes - {len(figs)} figuras")


if __name__ == "__main__":
    main()
