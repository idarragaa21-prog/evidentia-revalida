# -*- coding: utf-8 -*-
"""Configuração de caminhos do projeto.

Por padrão os scripts leem os cadernos e gabaritos oficiais do INEP a partir da
pasta `fontes_inep/` deste repositório. Para apontar para outra pasta, defina a
variável de ambiente REVALIDA_FONTES.
"""
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTES = os.environ.get("REVALIDA_FONTES", os.path.join(RAIZ, "fontes_inep"))
DADOS = os.path.join(RAIZ, "dados")
MODELO = os.path.join(RAIZ, "modelo")
APLICATIVO = os.path.join(RAIZ, "aplicativo")
