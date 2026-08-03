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
