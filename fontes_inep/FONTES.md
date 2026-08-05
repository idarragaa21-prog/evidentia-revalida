# Fontes oficiais

Os cadernos e gabaritos usados neste projeto foram obtidos do portal do Instituto Nacional de
Estudos e Pesquisas Educacionais Anisio Teixeira (INEP), na secao de provas e
gabaritos do Revalida:

<http://inep.gov.br/provas-e-gabaritos2>

| Arquivo | Conteudo |
|:--|:--|
| `2023_1_PV_objetiva_regular.pdf` | Caderno da prova objetiva — edicao 2023/1 |
| `2023_1_GB_objetiva_definitivo.pdf` | Gabarito definitivo — edicao 2023/1 |
| `2023_2_PV_objetiva_regular.pdf` | Caderno da prova objetiva — edicao 2023/2 |
| `2023_2_GB_objetiva.pdf` | Gabarito — edicao 2023/2 |
| `2024_1_PV_objetiva_regular.pdf` | Caderno da prova objetiva — edicao 2024/1 |
| `2024_1_GB_objetiva.pdf` | Gabarito — edicao 2024/1 |
| `2024_2_PV_objetiva_regular.pdf` | Caderno da prova objetiva — edicao 2024/2 |
| `2024_2_GB_objetiva.pdf` | Gabarito — edicao 2024/2 |

Enderecos de download diretos usados pelo INEP seguem o padrao:

```
https://download.inep.gov.br/revalida/provas_e_gabaritos/<arquivo>.pdf
```

Por exemplo:

- <https://download.inep.gov.br/revalida/provas_e_gabaritos/2024_2_PV_objetiva_regular.pdf>
- <https://download.inep.gov.br/revalida/provas_e_gabaritos/2024_2_GB_objetiva.pdf>

Os arquivos PDF **nao sao versionados** neste repositorio, por ocuparem cerca
de 27 MB. Para rodar o processo de extracao, baixe-os do portal do INEP e
coloque-os nesta pasta com exatamente os nomes da tabela acima — os scripts
localizam cada arquivo por esse padrao de nome.

Para versiona-los mesmo assim, remova a ultima regra do `.gitignore` na raiz e
rode `git add -f fontes_inep/*.pdf`.

O conteudo pertence ao INEP; consulte `../AVISO_DE_CONTEUDO.md`.

## Edicao 2026/1

| Arquivo | Conteudo |
|:--|:--|
| `2026_1_caderno_1_ampliada.pdf` | Caderno 01 da prova objetiva — edicao 2026/1 (versao ampliada; mesmo conteudo da regular) |
| `gab2026.pdf` | Gabarito **definitivo** do Caderno 01 — edicao 2026/1 |

Enderecos diretos:

- <https://download.inep.gov.br/revalida/provas_e_gabaritos/2026_1_caderno_1_ampliada.pdf>
- <https://download.inep.gov.br/revalida/provas_e_gabaritos/2026_1_gabarito_definitivo_caderno1.pdf>

O gabarito de 2026/1 traz o mesmo defeito de codificacao ja descrito em
`docs/METODO_DECODIFICACAO.md`: a fonte nao expoe mapa ToUnicode utilizavel e a coluna das
respostas sai vazia no `pdftotext`. As letras chegam como indices de glifo, e foram
reconhecidas pela forma, uma a uma, em `scripts/16_gabarito_2026_1.py`:

    0x04 -> A     0x11 -> B     0x12 -> C     0x18 -> D

A leitura foi conferida contra a imagem do proprio PDF nas duas pontas da tabela (questoes
1 a 13 e 70 a 100) e a distribuicao resultante e exatamente 25 A, 25 B, 25 C e 25 D.
