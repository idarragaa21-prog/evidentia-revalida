# -*- coding: utf-8 -*-
"""Monta o aplicativo final (arquivo HTML unico) a partir do modelo e dos dados.

Entrada : modelo/app_template.html, dados/banco_400_questoes.json, dados/figuras.json,
          dados/logo_b64.txt, dados/favicon_b64.txt
          dados/referencias.json e dados/justificativas/<edicao>.json (opcionais)
Saida   : aplicativo/Revalida_Evidentia.html

O banco permanece como fonte da verdade do conteudo INEP; as justificativas com
referencias vivem em arquivos proprios e sao unidas aqui, na montagem. O formato esta
em docs/ESQUEMA_JUSTIFICATIVAS.md e a porta de qualidade em 12_validar_justificativas.py.

Varios canais saem do mesmo modelo:

  completo  600 questoes, exige licenca valida (produto web pago)
  livre     recorte gratuito, sem conta nem licenca (funil)
  ios       produto completo com StoreKit e sem direcionamento externo
  android   produto completo com Play Billing e sem direcionamento externo

Uso: python3 scripts/08_montar_aplicativo.py [--edicao completo|livre|ios|android|ambas]
"""
import os, sys, json, base64
from urllib.parse import urlparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DADOS, MODELO, APLICATIVO

RAIZ = os.path.dirname(DADOS)
DESTINOS_NATIVOS = {
    "android": [
        os.path.join(RAIZ, "app-android", "www", "index.html"),
        os.path.join(RAIZ, "app-android", "android", "app", "src", "main", "assets", "public", "index.html"),
    ],
    "ios": [
        os.path.join(RAIZ, "app-android", "www", "index.html"),
        os.path.join(RAIZ, "app-android", "ios", "App", "App", "public", "index.html"),
    ],
}

# Quantas questoes por area entram na edicao livre.
GRATUITAS_POR_AREA = 8


def ano(edicao):
    return int(edicao.split("/")[0])


def carregar_justificativas(edicoes):
    """Devolve {(edicao, numero): registro} lendo dados/justificativas/<edicao>.json."""
    pasta = os.path.join(DADOS, "justificativas")
    just = {}
    for ed in edicoes:
        caminho = os.path.join(pasta, ed.replace("/", "-") + ".json")
        if not os.path.exists(caminho):
            continue
        for reg in json.load(open(caminho, encoding="utf-8")):
            just[(ed, reg["numero"])] = reg
    return just


def recorte_livre(questoes):
    """Amostra estavel para a edicao gratuita: as N primeiras de cada area, rodando
    as edicoes para que nenhuma prova fique de fora e o recorte nao mude entre builds."""
    por_area = {}
    for q in sorted(questoes, key=lambda q: (q["numero"], q["edicao"])):
        if q["anulada"]:
            continue
        por_area.setdefault(q["area"], []).append(q)
    escolhidas = []
    for area in sorted(por_area):
        escolhidas.extend(por_area[area][:GRATUITAS_POR_AREA])
    ids = {q["id"] for q in escolhidas}
    return [q for q in questoes if q["id"] in ids]


def config_nuvem():
    """Le nuvem/supabase/client_config.local.json se existir. A edicao web completa
    pode ser montada sem ele para diagnostico local; builds de loja falham fechadas."""
    caminho = os.path.join(os.path.dirname(DADOS), "nuvem", "supabase", "client_config.local.json")
    if not os.path.exists(caminho):
        return {}
    c = json.load(open(caminho, encoding="utf-8"))
    return {"url": c.get("url", ""), "chave": c.get("chave_publicavel", c.get("anon_key", ""))}


def chave_licenca():
    caminho = os.path.join(os.path.dirname(DADOS), "nuvem", "chaves", "licenca_publica.txt")
    return open(caminho, encoding="utf-8").read().strip() if os.path.exists(caminho) else ""


def validar_config_ativacao(alvo, origem_nuvem, chave_nuvem, chave_pub):
    """Impede gerar um binario de loja instalavel que jamais conseguiria ativar."""
    faltantes = []
    if not origem_nuvem:
        faltantes.append("URL HTTPS do Supabase")
    if not str(chave_nuvem or "").strip():
        faltantes.append("chave publicavel do Supabase")
    if not str(chave_pub or "").strip():
        faltantes.append("chave publica de licenca")
    if alvo in ("ios", "android") and faltantes:
        raise SystemExit(
            f"build {alvo} bloqueada: configuracao de ativacao ausente: " + ", ".join(faltantes))
    return faltantes


def main():
    banco = json.load(open(os.path.join(DADOS, "banco_400_questoes.json"), encoding="utf-8"))
    figuras = json.load(open(os.path.join(DADOS, "figuras.json"), encoding="utf-8"))

    caminho_refs = os.path.join(DADOS, "referencias.json")
    referencias = json.load(open(caminho_refs, encoding="utf-8")) if os.path.exists(caminho_refs) else {}
    justificativas = carregar_justificativas({r["edicao"] for r in banco})

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
        "just": justificativas.get((r["edicao"], r["numero"])),
        "figura": r.get("figura"),
    } for r in banco]

    modelo = open(os.path.join(MODELO, "app_template.html"), encoding="utf-8").read()
    icone_marca = os.path.join(RAIZ, "design", "brand", "evidentia-icon-1024.png")
    if os.path.exists(icone_marca):
        marca_b64 = base64.b64encode(open(icone_marca, "rb").read()).decode("ascii")
        logo = favicon = marca_b64
    else:
        logo = open(os.path.join(DADOS, "logo_b64.txt"), encoding="utf-8").read().strip()
        favicon = open(os.path.join(DADOS, "favicon_b64.txt"), encoding="utf-8").read().strip()
    nuvem = config_nuvem()
    origem_nuvem = ""
    if nuvem.get("url"):
        u = urlparse(nuvem["url"])
        if u.scheme == "https" and u.netloc:
            origem_nuvem = f"{u.scheme}://{u.netloc}"
    csp_connect = origem_nuvem or "'none'"
    chave_pub = chave_licenca()

    quais = "ambas"
    for i, a in enumerate(sys.argv):
        if a == "--edicao" and i + 1 < len(sys.argv):
            quais = sys.argv[i + 1]
    alvos = ["completo", "livre"] if quais == "ambas" else [quais]

    os.makedirs(APLICATIVO, exist_ok=True)
    for alvo in alvos:
        if alvo not in ("completo", "livre", "teste", "ios", "android"):
            raise SystemExit(f"edicao desconhecida: {alvo}")
        qs = recorte_livre(questoes) if alvo == "livre" else questoes
        # A build de teste tem o banco inteiro e nao pede licenca: e o alvo da suite
        # automatizada, que precisa chegar as telas sem uma assinatura de verdade.
        modo = "livre" if alvo == "teste" else ("completo" if alvo in ("ios", "android") else alvo)

        # Builds de loja vendem exclusivamente pelo mecanismo nativo. A pagina web
        # continua com seu checkout proprio, mas esse direcionamento nao viaja dentro
        # do binario submetido a Apple ou Google.
        nativo = alvo in ("ios", "android")
        vende_aqui = "false" if nativo else "true"
        faltantes_ativacao = validar_config_ativacao(
            alvo, origem_nuvem, nuvem.get("chave"), chave_pub)

        # So viajam para o aplicativo as figuras e as fontes que aquela edicao usa.
        citadas = {
            ref["id"]
            for q in qs if q["just"]
            for ref in (q["just"].get("referencias") or [])
            if ref.get("id") in referencias
        }
        refs_usadas = {k: referencias[k] for k in sorted(citadas)}
        usadas = {q["figura"] for q in qs if q.get("figura")}
        figs = {k: v["b64"] for k, v in figuras.items() if k in usadas}

        meta = {
            "edicoes": sorted({q["edicao"] for q in qs}),
            "total": len(qs),
            "validas": sum(1 for q in qs if not q["anulada"]),
            "fonte": "INEP — Revalida",
            "com_justificativa": sum(1 for q in qs if q["just"]),
            "fontes": len(refs_usadas),
            "edicao_app": alvo,
            "gratuitas": len(recorte_livre(questoes)),
        }

        saida = (modelo
                 .replace("/*__DATA__*/ []", json.dumps(qs, ensure_ascii=False), 1)
                 .replace("/*__META__*/ {}", json.dumps(meta, ensure_ascii=False), 1)
                 .replace("/*__REFS__*/ {}", json.dumps(refs_usadas, ensure_ascii=False), 1)
                 .replace("/*__FIGS__*/ {}", json.dumps(figs), 1)
                 .replace("/*__NUVEM__*/ {}", json.dumps(nuvem, ensure_ascii=False), 1)
                 .replace("__CHAVE_LICENCA__", chave_pub)
                 .replace("__EDICAO__", modo)
                 .replace("__VENDE_AQUI__", vende_aqui)
                 .replace("__CSP_CONNECT__", csp_connect)
                 .replace("__FAVICON__", favicon)
                 .replace("__LOGO__", logo))

        for marcador in ["/*__DATA__*/", "/*__META__*/", "/*__REFS__*/", "/*__FIGS__*/",
                         "/*__NUVEM__*/", "__CHAVE_LICENCA__", "__EDICAO__", "__VENDE_AQUI__",
                         "__CSP_CONNECT__", "__LOGO__", "__FAVICON__"]:
            assert marcador not in saida, f"marcador nao substituido: {marcador}"

        # Um revisor pode inspecionar as cadeias do pacote. Removemos também os textos
        # mortos do funil web e falhamos o build se algum direcionamento voltar.
        if nativo:
            proibidas = [
                ("https://idarragaa21-prog.github.io/evidentia-revalida/assinar/", ""),
                ("600 questões, seis edições e uso offline. Consulte os planos antes de decidir.",
                 "600 questões, seis edições e uso offline para estudar com método."),
                ("Comparar planos", "Conhecer o acervo"),
                ("Na versão web, os planos são contratados pela página segura da Evidentia.",
                 "Escolha um período de acesso na loja deste aparelho."),
                ("A mesma conta reconhece compras na web, App Store e Google Play e mantém seu acesso consistente entre aparelhos.",
                 "Sua conta mantém o acesso consistente entre aparelhos."),
                ("Uma conta, três canais", "Uma conta protegida"),
                ("Compras verificadas pela loja ou pela Evidentia", "Compras verificadas com segurança"),
            ]
            for antes, depois in proibidas:
                if antes not in saida:
                    raise SystemExit(
                        f"build {alvo}: a frase de compra mudou no modelo e este script nao a "
                        f"encontrou mais: {antes[:60]!r}. Atualize a lista antes de publicar.")
                saida = saida.replace(antes, depois)
            vetadas = [URL for URL in (
                "evidentia-revalida/assinar/", "Na versão web, os planos",
                "compras na web", "Comparar planos") if URL in saida]
            if vetadas:
                raise SystemExit(f"build {alvo}: direcionamento externo ainda presente: {vetadas}")

        nome = {"completo": "Revalida_Evidentia.html",
                "livre": "Revalida_Evidentia_livre.html",
                "teste": "Revalida_Evidentia_teste.html",
                "ios": "Revalida_Evidentia_ios.html",
                "android": "Revalida_Evidentia_android.html"}[alvo]
        destino = os.path.join(APLICATIVO, nome)
        open(destino, "w", encoding="utf-8").write(saida)
        print(f"gerado ({alvo}): {destino}")
        for caminho_nativo in DESTINOS_NATIVOS.get(alvo, []):
            os.makedirs(os.path.dirname(caminho_nativo), exist_ok=True)
            open(caminho_nativo, "w", encoding="utf-8").write(saida)
            print(f"  sincronizado: {os.path.relpath(caminho_nativo, RAIZ)}")
        print(f"  {round(len(saida)/1024/1024, 2)} MB - {len(qs)} questoes - {len(figs)} figuras")
        print(f"  {meta['com_justificativa']}/{len(qs)} com justificativa estruturada"
              f" - {meta['fontes']} fontes citadas")
        if alvo == "completo" and faltantes_ativacao:
            print("  aviso: build de diagnostico sem " + ", ".join(faltantes_ativacao) +
                  " — nao consegue ativar assinatura")


if __name__ == "__main__":
    main()
