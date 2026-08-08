# -*- coding: utf-8 -*-
"""Regressões dos gates de conteúdo que já produziram falsos verdes."""
from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]


def carregar_modulo(nome, caminho):
    spec = importlib.util.spec_from_file_location(nome, caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


METRICAS = carregar_modulo("metricas_produto", RAIZ / "scripts" / "22_validar_metricas_produto.py")
OFICIAL = carregar_modulo("conferencia_oficial", RAIZ / "scripts" / "10_conferir_textos_oficiais.py")


class GatesConteudoTest(unittest.TestCase):
    def test_metricas_reais_coincidem_com_baseline(self):
        resultado = METRICAS.validar()
        self.assertTrue(resultado["ok"], resultado.get("erros"))
        self.assertEqual(resultado["atual"]["questoes"], 600)
        self.assertEqual(resultado["atual"]["questoes_com_referencias"], 526)

    def test_fontes_ausentes_reprovam_em_vez_de_ser_puladas(self):
        with tempfile.TemporaryDirectory() as vazio:
            resultado = OFICIAL.conferir(False, vazio, False)
        self.assertFalse(resultado["ok"])
        self.assertEqual(resultado["localizadas"], 0)
        self.assertEqual(len(resultado["erros_fontes"]), 6)

    def test_questionario_final_nao_sobrescreve_prova(self):
        prova = " ".join(f"QUESTÃO {n} texto-real-{n}" for n in range(1, 101))
        questionario = " ".join(f"QUESTÃO {n} pesquisa-{n}" for n in range(1, 10))
        blocos = OFICIAL.blocos_por_questao(prova + " " + questionario, range(1, 101))
        self.assertIn("texto-real-1", blocos[1])
        self.assertNotIn("pesquisa-1", blocos[1])
        self.assertIn("texto-real-100", blocos[100])
        self.assertNotIn("pesquisa-1", blocos[100])

    def test_remover_todos_os_espacos_nao_aprova_campo(self):
        banco = "Suspenderlosartana;indicaravaliação"
        oficial = "Suspender losartana; indicar avaliação"
        self.assertFalse(OFICIAL.campo_confere(banco, oficial))
        self.assertTrue(OFICIAL.campo_confere_apenas_sem_espacos(banco, oficial))

    def test_prefixo_truncado_nao_aprova_alternativa(self):
        questao = {
            "enunciado": "Qual é a conduta correta?",
            "alternativas": {
                "A": "Primeira parte",
                "B": "Alternativa B completa.",
                "C": "Alternativa C completa.",
                "D": "Alternativa D completa.",
            },
        }
        oficial = (
            "Qual é a conduta correta? A Primeira parte que faltava no banco. "
            "B Alternativa B completa. C Alternativa C completa. D Alternativa D completa."
        )
        self.assertTrue(OFICIAL.campo_confere(questao["alternativas"]["A"], oficial))
        self.assertEqual(
            OFICIAL.limites_campos(questao, oficial, "2025/1"),
            [("alternativas/A→alternativas/B", "que faltava no banco. b")],
        )

    def test_excecoes_editoriais_estao_presas_ao_texto_aprovado(self):
        banco = json.loads((RAIZ / "dados" / "banco_400_questoes.json").read_text(encoding="utf-8"))
        por_chave = {(questao["edicao"], questao["numero"]): questao for questao in banco}
        for (edicao, numero, campo), excecao in OFICIAL.EXCECOES.items():
            questao = por_chave[(edicao, numero)]
            texto = (
                questao["alternativas"][campo.split("/", 1)[1]]
                if campo.startswith("alternativas/") else questao[campo]
            )
            self.assertEqual(
                OFICIAL.hash_texto(texto), excecao["sha256"],
                f"{edicao} n. {numero} [{campo}]",
            )

    def test_fontes_intermediarias_nao_reintroduzem_erros(self):
        banco = json.loads((RAIZ / "dados" / "banco_400_questoes.json").read_text(encoding="utf-8"))
        fontes = {
            "2024/2": RAIZ / "dados" / "banco_2024_2.json",
            "2025/1": RAIZ / "dados" / "bruto_2025_1.json",
        }
        for edicao, caminho in fontes.items():
            fonte = json.loads(caminho.read_text(encoding="utf-8"))
            fonte_por_numero = {questao["numero"]: questao for questao in fonte}
            questoes_edicao = [questao for questao in banco if questao["edicao"] == edicao]
            self.assertEqual(len(fonte_por_numero), 100, edicao)
            self.assertEqual(len(questoes_edicao), 100, edicao)
            for questao in questoes_edicao:
                original = fonte_por_numero[questao["numero"]]
                self.assertEqual(
                    original["enunciado"], questao["enunciado"],
                    f"{edicao} n. {questao['numero']}",
                )
                self.assertEqual(
                    original["alternativas"], questao["alternativas"],
                    f"{edicao} n. {questao['numero']}",
                )


if __name__ == "__main__":
    unittest.main()
