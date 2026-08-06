# Esquema dos algoritmos clínicos

Este documento define a camada de **algoritmos e figuras didáticas** das justificativas.
Ela existe porque muita conduta de prova é uma árvore de decisão, e uma árvore de decisão
se entende olhando, não lendo três parágrafos.

## As duas regras que governam esta camada

**1. Nada é desenhado de memória.** Cada algoritmo aponta para uma fonte do catálogo
(`dados/referencias.json`), já verificada, e diz *onde* dentro dela está cada ramo. O campo
`verificacao` registra como se conferiu — é a mesma prova de trabalho das referências. Um
algoritmo sem fonte não entra: a porta de qualidade falha.

**2. Nada é copiado.** O que se reproduz é a **lógica de decisão publicada** — que é fato
clínico, não obra —, redesenhada por nós a partir dos critérios da fonte. A arte original
da diretriz não é copiada, recortada nem redistribuída. Isso mantém a mesma disciplina
jurídica do resto do produto: conteúdo oficial sem modificação de um lado (as questões do
INEP, verbatim), obra própria do outro (o que a Evidentia acrescenta).

> A exceção conhecida são as **figuras das próprias questões** (eletrocardiogramas, imagens),
> que vêm do caderno do INEP sob CC BY-ND 3.0 e continuam sendo tratadas como hoje: recorte
> fiel, atribuídas por item, em camada visualmente separada.

## `dados/algoritmos.json`

Dicionário `id` → algoritmo. O `id` segue a convenção das referências: `INSTITUICAO-TEMA-ANO`.

```json
{
  "MS-DENGUE-ESTADIAMENTO-2024": {
    "titulo": "Estadiamento e conduta na dengue (grupos A a D)",
    "fonte_id": "MS-FLUXOGRAMA-DENGUE-2024",
    "detalhe": "ramos de estadiamento, critérios de alarme e gravidade, e conduta por grupo",
    "verificado_em": "2026-08-06",
    "verificacao": "PDF oficial lido integralmente; cada ramo transcrito do original.",
    "no_inicial": "suspeita",
    "nos": {
      "suspeita": { "tipo": "inicio", "texto": "Suspeita de dengue", "vai": "alarme" },
      "alarme":   { "tipo": "decisao", "texto": "Sinal de alarme ou gravidade?",
                    "opcoes": [ { "rotulo": "NÃO", "vai": "grupo_a" },
                                { "rotulo": "SIM", "vai": "grupo_c" } ] },
      "grupo_a":  { "tipo": "conduta", "texto": "Grupo A", "itens": ["Hidratação oral…"] }
    }
  }
}
```

Campos obrigatórios do algoritmo: `titulo`, `fonte_id`, `detalhe`, `verificado_em`,
`verificacao`, `no_inicial`, `nos`.

Campos de um nó:

| Campo | Obrigatório | Significado |
|:--|:--|:--|
| `tipo` | sim | `inicio` · `decisao` · `grupo` · `conduta` · `fim` |
| `texto` | sim | o rótulo do nó, curto |
| `itens` | não | lista de linhas de detalhe (critérios, condutas, volumes) |
| `vai` | em nós não-decisão | id do próximo nó |
| `opcoes` | em `decisao` | lista de `{ rotulo, vai }` — os ramos |
| `nota` | não | observação curta que a fonte faz naquele ponto |

## Ligação com as justificativas

Um registro de `dados/justificativas/<edicao>.json` pode ganhar o campo opcional:

```json
"algoritmo": "MS-DENGUE-ESTADIAMENTO-2024"
```

O algoritmo aparece **depois** da justificativa em prosa, nunca no lugar dela, e sempre com
a linha de origem visível: *«Redesenho da Evidentia a partir de \<fonte\>»*.

## Renderização

`scripts/18_montar_algoritmos.py` transforma a estrutura em **SVG** e grava
`dados/algoritmos_svg.json` (id → SVG). O montador do aplicativo embute só os algoritmos
que a edição usa, como já faz com figuras e fontes.

SVG e não imagem porque: pesa poucos quilobytes (o produto inteiro é um arquivo único que
precisa caber no celular), é nítido em qualquer tela, funciona offline, e usa
`currentColor` — então acompanha o tema claro e escuro sem uma segunda versão.

## Validação

`scripts/12_validar_justificativas.py` falha se:

1. um algoritmo não tem `fonte_id`, ou a fonte não existe no catálogo;
2. falta `verificado_em` ou `verificacao` — sem prova de trabalho não entra;
3. `no_inicial` não existe em `nos`;
4. um `vai` ou uma `opcao` aponta para um nó inexistente;
5. há nó órfão (inalcançável a partir de `no_inicial`) — sinal de estrutura mal transcrita;
6. um nó `decisao` tem menos de dois ramos;
7. uma justificativa cita um `algoritmo` que não existe.
