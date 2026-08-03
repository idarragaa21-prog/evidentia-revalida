<div align="center">

# Evidentia · Revalida

**Banco de questões objetivas do Revalida com simulados, correção detalhada e justificativa questão a questão.**

Aplicativo web de arquivo único, que funciona sem internet, no celular e no computador.

`400 questões` · `4 edições` · `22 figuras originais` · `gabarito oficial verificado`

</div>

---

## O que é

Um aplicativo para estudar para o Exame Nacional de Revalidação de Diplomas Médicos Expedidos por Instituição de Educação Superior Estrangeira (Revalida), do Instituto Nacional de Estudos e Pesquisas Educacionais Anísio Teixeira (INEP).

Você monta o simulado como quiser — aleatório, por especialidade ou por edição —, responde, e recebe uma análise de desempenho com a revisão de cada questão, o gabarito oficial e um comentário de estudo.

O aplicativo inteiro é **um único arquivo HTML**. Não precisa de instalação, servidor, cadastro nem conexão. Basta abrir `aplicativo/Revalida_Evidentia.html` no navegador. O progresso fica salvo apenas no seu aparelho.

## Conteúdo

| Edição | Questões | Anuladas | Válidas |
|:--|--:|--:|--:|
| 2023/1 | 100 | 7 | 93 |
| 2023/2 | 100 | 9 | 91 |
| 2024/1 | 100 | 5 | 95 |
| 2024/2 | 100 | 6 | 94 |
| **Total** | **400** | **27** | **373** |

Distribuição por área: Clínica Médica (99), Ginecologia e Obstetrícia (87), Pediatria (86), Cirurgia (68) e Medicina da Família, Comunidade e Saúde Coletiva (60).

As 22 questões que dependem de figura — radiografias, eletrocardiogramas, fotografias e gráficos — trazem a imagem original recortada do caderno oficial, para que possam ser respondidas por inteiro.

## Recursos

**Montagem do simulado.** Modo aleatório, por especialidade ou por edição; número de questões livre; embaralhamento de alternativas; cronômetro; inclusão opcional das questões anuladas; e um resumo em tempo real do que será aplicado, com estimativa de duração.

**Durante a prova.** Modo estudo (correção imediata a cada resposta), avanço automático, mapa de questões, marcação para revisão e atalhos de teclado (`A`–`D` para responder, setas para navegar, `F` para marcar, `Enter` para avançar).

**Depois da prova.** Percentual de acerto, acertos, erros, questões em branco, tempo total e tempo médio por questão; aproveitamento por área e por edição; revisão questão a questão com filtros; e a opção de refazer somente as erradas.

**Fora da prova.** Histórico com desempenho acumulado por área, tema claro e escuro, exportação e importação do progresso em arquivo, e impressão do caderno de erros.

> As questões anuladas nunca entram na pontuação. O alvo de 60% exibido é apenas orientativo para estudo: o critério oficial de aprovação é definido a cada edição pelo INEP.

## Como usar

Baixe o arquivo `aplicativo/Revalida_Evidentia.html` e abra-o no navegador. No celular, dá para adicioná-lo à tela de início e usá-lo como um aplicativo comum.

## Aplicativo para o celular

Além do arquivo único, o projeto traz duas formas de instalar a app no telefone, ambas com todo o conteúdo embutido e funcionamento offline:

- **App web instalável (PWA)** — em [`app-web/`](app-web/). Funciona no iPhone e no Android: publica-se a pasta num endereço `https://` (Netlify Drop ou GitHub Pages) e instala-se pela tela de início do navegador, com ícone próprio e tela cheia.
- **App Android (APK)** — em [`app-android/`](app-android/). O arquivo `Evidentia-Revalida.apk` instala como um aplicativo Android comum (versão de teste, assinada em modo debug). O projeto Capacitor que o gera acompanha, com instruções em [`app-android/COMO_COMPILAR.md`](app-android/COMO_COMPILAR.md).

O passo a passo de instalação para iPhone e Android está em [`COMO_INSTALAR.md`](COMO_INSTALAR.md).

## Integridade dos dados

Este é o ponto central do projeto, então vale ser explícito sobre o que é oficial e o que não é.

**É oficial, extraído dos cadernos e gabaritos do INEP:** o texto das questões, as alternativas, a letra do gabarito, as questões anuladas e as figuras.

**Não é oficial, é material de estudo:** a classificação por especialidade e tema, e as justificativas de cada questão, redigidas com apoio de inteligência artificial a partir de diretrizes clínicas. Elas podem conter imprecisões — confira sempre em fonte confiável antes de considerá-las definitivas. O próprio aplicativo marca essas justificativas como não oficiais.

**Verificações realizadas:**

- Cada gabarito foi conferido por dupla verificação: leitura automática do arquivo e leitura visual da imagem oficial do gabarito definitivo, comparadas item a item.
- As tabelas de exames laboratoriais foram transcritas a partir da imagem oficial e conferidas valor a valor, e não por leitura automática, porque um erro em resultado, unidade ou valor de referência seria especialmente danoso.
- Todas as cifras do caderno de 2024/2 foram comparadas com o reconhecimento óptico das páginas originais; as divergências foram inspecionadas uma a uma na imagem.
- Cada justificativa foi cruzada automaticamente contra a letra do gabarito oficial. Esse cruzamento encontrou duas justificativas erradas (questões 85 e 89 de 2024/2), que foram revistas no original e corrigidas.
- O aplicativo passa por testes automatizados de pontuação (tudo certo, tudo errado, metade em branco, anuladas fora da conta) e de correspondência entre a alternativa exibida e a alternativa registrada quando o embaralhamento está ligado.

## O caderno cifrado de 2024/2

O caderno da edição 2024/2 não tem texto legível: o arquivo usa onze fontes com tabelas de caracteres deliberadamente corrompidas, de modo que copiar o texto produz apenas ruído. A extração exigiu reconstruir a codificação de cada fonte.

O método está descrito em [`docs/METODO_DECODIFICACAO.md`](docs/METODO_DECODIFICACAO.md). Em resumo: os glifos foram recortados do documento pelas suas coordenadas e reconhecidos individualmente, com votação entre várias ocorrências; o resultado foi arbitrado por alinhamento com o reconhecimento óptico das páginas; e os códigos que escondiam mais de um caractere — o mesmo código servia ao sinal de mais das cruzes clínicas e ao dígito sete — foram separados por agrupamento da forma dos glifos, com conferência visual no original.

Ao final, as cem questões ficaram sem um único caractere ilegível.

## Estrutura do repositório

```
aplicativo/     aplicativo pronto para uso (arquivo HTML único)
app-web/        app web instalável (PWA) para iPhone e Android
app-android/    projeto Android (Capacitor) e APK pronto para instalar
modelo/         modelo HTML sem os dados, usado na montagem
dados/          banco de questões, figuras e tabelas de decodificação (JSON)
fontes_inep/    cadernos de prova e gabaritos oficiais (PDF)
scripts/        processo completo de extração, verificação e montagem
testes/         testes automatizados do aplicativo
docs/           método de decodificação e plano da interface
```

## Reproduzir

Requer Python 3 com `PyMuPDF` e `Pillow`. Para regenerar o aplicativo a partir dos dados:

```bash
pip install pymupdf pillow
python3 scripts/08_montar_aplicativo.py
```

O comando acima reconstrói `aplicativo/Revalida_Evidentia.html` byte a byte idêntico ao arquivo versionado.

Para refazer o processo desde os PDF originais, os scripts estão numerados na ordem de execução, de `01_extrair_provas_legiveis.py` a `08_montar_aplicativo.py`. Eles leem os arquivos de `fontes_inep/`; para apontar para outra pasta, defina a variável de ambiente `REVALIDA_FONTES`.

> Os cadernos e gabaritos oficiais em PDF **não são versionados por padrão**, por ocuparem cerca de 27 MB. Baixe-os do portal do INEP e coloque-os em `fontes_inep/` com os nomes indicados em [`fontes_inep/FONTES.md`](fontes_inep/FONTES.md). Para versioná-los mesmo assim, remova a última regra do `.gitignore` e rode `git add -f fontes_inep/*.pdf`.

Os testes usam Node com Playwright:

```bash
node testes/teste_funcional.mjs
```

## Fonte

Instituto Nacional de Estudos e Pesquisas Educacionais Anísio Teixeira (INEP) — Revalida, Provas e Gabaritos: <http://inep.gov.br/provas-e-gabaritos2>

Os arquivos originais utilizados estão em [`fontes_inep/`](fontes_inep/), com os endereços de download oficiais registrados em [`fontes_inep/FONTES.md`](fontes_inep/FONTES.md).

## Licença e uso do conteúdo

O código, os scripts e a interface deste repositório são distribuídos sob a licença MIT (veja [`LICENSE`](LICENSE)).

O conteúdo das provas pertence ao INEP e é aqui reunido para fins de estudo. Leia o [`AVISO_DE_CONTEUDO.md`](AVISO_DE_CONTEUDO.md) antes de reutilizar ou redistribuir este material.

---

<div align="center">

**EVIDENTIA** · Estratégia | Solução | Confiança

</div>
