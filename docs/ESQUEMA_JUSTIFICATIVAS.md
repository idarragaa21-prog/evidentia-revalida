# Esquema das justificativas com referências

Este documento define o formato dos dados que sustentam a explicação de cada questão.
Ele existe porque a promessa central do produto pago é: **toda afirmação clínica tem uma
fonte identificável, e a fonte foi verificada**.

## Princípio

O texto das questões é do INEP e já foi conferido palavra por palavra contra o caderno
oficial. As justificativas são material de estudo da Evidentia. A diferença entre um
comentário de internet e o que este produto entrega é que aqui **cada justificativa aponta
para um documento concreto que existe, com autor, ano e endereço**.

Nenhuma referência entra no catálogo sem ter sido aberta e conferida. Uma referência
inventada — mesmo uma só — destrói a credibilidade do produto inteiro.

## Arquivos

| Arquivo | Conteúdo |
|:--|:--|
| `dados/banco_400_questoes.json` | Fonte da verdade do conteúdo INEP. **Não se altera** para adicionar justificativas. |
| `dados/referencias.json` | Catálogo mestre de fontes verificadas, indexado por `id`. |
| `dados/justificativas/<edicao>.json` | Justificativa estruturada de cada questão da edição (`2023-1.json`, `2023-2.json`, `2024-1.json`, `2024-2.json`). |

A junção acontece em tempo de montagem (`scripts/08_montar_aplicativo.py`). O banco
permanece intacto e auditável; as justificativas evoluem em arquivos próprios.

## `dados/referencias.json`

Dicionário `id` → registro. O `id` é estável e legível: `INSTITUICAO-TEMA-ANO`.

```json
{
  "SBC-DIRETRIZ-FA-2022": {
    "tipo": "diretriz_sociedade",
    "titulo": "Diretriz Brasileira de Fibrilação Atrial – 2022",
    "autor": "Sociedade Brasileira de Cardiologia",
    "ano": 2022,
    "url": "https://abccardiol.org/article/...",
    "doi": "10.36660/abc.20210873",
    "verificado_em": "2026-08-05",
    "verificacao": "WebFetch confirmou título, sociedade e ano na página do artigo; DOI conferido com verifyCitation (matched)."
  }
}
```

Campos obrigatórios: `tipo`, `titulo`, `autor`, `ano`, `url`, `doi`, `verificado_em`,
`verificacao`. `doi` pode ser string vazia (guias oficiais brasileiras costumam não ter DOI),
mas **`url` e `doi` não podem estar ambos vazios**.

`tipo` ∈ `protocolo_ms` · `diretriz_oficial_br` · `lei_norma` · `diretriz_sociedade` ·
`diretriz_internacional` · `artigo_cientifico` · `livro_texto`.

O campo `verificacao` registra *como* se confirmou a fonte. É a prova de trabalho: quem
auditar o produto lê esse campo e sabe que ninguém escreveu a referência de memória.

## `dados/justificativas/<edicao>.json`

Lista de registros, um por questão da edição.

```json
[
  {
    "numero": 1,
    "conceito": "Fibrilação atrial com instabilidade hemodinâmica exige cardioversão elétrica imediata.",
    "correta": "O paciente tem hipotensão, sudorese e congestão pulmonar — critérios de instabilidade. Nessa situação a conduta é a cardioversão elétrica sincronizada, sem esperar controle farmacológico da frequência.",
    "distratores": {
      "A": "A cineangiocoronariografia investiga a doença de base, mas não trata a arritmia que está causando o choque agora.",
      "B": "O estudo eletrofisiológico é eletivo e não tem papel na emergência.",
      "C": "O marca-passo provisório trata bradiarritmias, não taquiarritmias."
    },
    "pontos_chave": [
      "Instabilidade em taquiarritmia = cardioversão elétrica sincronizada.",
      "Hipotensão, alteração do nível de consciência, dor isquêmica e congestão são os sinais de instabilidade."
    ],
    "referencias": [
      { "id": "SBC-DIRETRIZ-FA-2022", "detalhe": "capítulo de reversão do ritmo, indicação de cardioversão elétrica na instabilidade hemodinâmica" }
    ]
  }
]
```

Regras:

- `numero` casa com `numero` da questão dentro daquela edição.
- `distratores` tem exatamente as letras **diferentes** do gabarito. Em questão anulada
  (`gabarito: null`), `distratores` fica vazio e `correta` explica o motivo da anulação.
- `referencias` tem no mínimo **uma** entrada para questão válida, e todo `id` citado
  precisa existir em `dados/referencias.json`.
- `detalhe` diz *onde* dentro da fonte está o respaldo (capítulo, seção, tabela). Sem isso a
  referência é decorativa.
- Nada de linguagem que finja autoridade oficial: a justificativa é da Evidentia, apoiada
  nas fontes citadas. O gabarito é que é do INEP.

## Validação

`scripts/12_validar_justificativas.py` roda como porta de qualidade e falha se:

1. alguma questão do banco não tem justificativa;
2. alguma justificativa cita um `id` ausente do catálogo;
3. alguma referência do catálogo não tem `url` nem `doi`, ou não tem `verificado_em`;
4. as letras de `distratores` não são exatamente as alternativas erradas daquela questão;
5. uma questão válida ficou sem nenhuma referência;
6. o texto da justificativa contém marcas de citação solta (`et al.`, `doi:`, `http`) que não
   passaram pelo catálogo — citação tem que estar em `referencias`, não embutida na prosa.

A regra 6 existe porque citação embutida na prosa é exatamente o formato que ninguém
consegue auditar depois.
