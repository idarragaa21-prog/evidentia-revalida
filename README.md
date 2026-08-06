<div align="center">

# Evidentia · Revalida

**Banco de questões objetivas do Revalida com simulados, correção detalhada e justificativa questão a questão.**

Aplicativo web de arquivo único, que funciona sem internet, no celular e no computador.

`500 questões` · `5 edições` · `30 figuras originais` · `justificativa com fontes citadas em cada questão`

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
| 2026/1 | 100 | 0 | 100 |
| **Total** | **500** | **27** | **473** |

Distribuição por área: Clínica Médica (120), Ginecologia e Obstetrícia (107), Pediatria (104), Medicina da Família, Comunidade e Saúde Coletiva (87) e Cirurgia (82).

As 30 questões que dependem de figura — radiografias, eletrocardiogramas, monitores, fotografias, partogramas e gráficos — trazem a imagem original recortada do caderno oficial, para que possam ser respondidas por inteiro.

As 500 questões têm justificativa estruturada; 455 delas citam ao menos uma das 318 fontes verificadas do catálogo.

## Recursos

**Montagem do simulado.** Modo aleatório, por especialidade ou por edição; número de questões livre; embaralhamento de alternativas; cronômetro; inclusão opcional das questões anuladas; e um resumo em tempo real do que será aplicado, com estimativa de duração.

**Durante a prova.** Modo estudo (correção imediata a cada resposta), avanço automático, mapa de questões, marcação para revisão e atalhos de teclado (`A`–`D` para responder, setas para navegar, `F` para marcar, `Enter` para avançar).

**Depois da prova.** Percentual de acerto, acertos, erros, questões em branco, tempo total e tempo médio por questão; aproveitamento por área e por edição; revisão questão a questão com filtros; e a opção de refazer somente as erradas.

**A justificativa de cada questão.** É onde está o trabalho. Cada questão traz o conceito que
ela cobra, por que o gabarito é o gabarito, por que **cada** distrator falha naquele caso, os
pontos para levar à prova e as **referências**: o documento, o autor, o ano, o endereço e a
indicação de onde dentro dele está o respaldo. As fontes vêm de um catálogo que foi conferido
documento por documento — protocolos do Ministério da Saúde, PCDT, diretrizes das sociedades
brasileiras e guias internacionais. Quando o catálogo não cobre o ponto, a questão aparece
com o selo *estudo* em vez de referências, porque citar uma fonte que não sustenta a
afirmação seria pior do que não citar.

**Fora da prova.** Histórico com desempenho acumulado por área, tema claro e escuro, exportação e importação do progresso em arquivo, e impressão do caderno de erros.

> As questões anuladas nunca entram na pontuação. O alvo de 60% exibido é apenas orientativo para estudo: o critério oficial de aprovação é definido a cada edição pelo INEP.

## Como instalar

O aplicativo se instala no computador, no iPhone e no Android, sempre com todo o conteúdo embutido e funcionamento offline:

| Aparelho | Como instalar |
|:--|:--|
| Computador (Windows, macOS, Linux) | Abrir o endereço no Chrome ou Edge e clicar em **Instalar** |
| iPhone e iPad | Abrir no **Safari** e usar *Compartilhar → Adicionar à Tela de Início* |
| Android | Abrir no Chrome e escolher **Instalar aplicativo**, ou instalar o APK |

Endereço do aplicativo: **<https://idarragaa21-prog.github.io/evidentia-revalida/>** — publicado a partir de [`app-web/`](app-web/) pela rotina em [`.github/workflows/publicar-app-web.yml`](.github/workflows/publicar-app-web.yml) a cada envio para `main`. Para ligar a publicação, basta escolher *Settings → Pages → Source: GitHub Actions* uma única vez.

Sem instalar nada, também dá para baixar [`aplicativo/Revalida_Evidentia.html`](aplicativo/Revalida_Evidentia.html) e abrir o arquivo no navegador — é um único arquivo, sem servidor nem conexão.

O APK está em [`app-android/Evidentia-Revalida.apk`](app-android/) (versão de teste, assinada em modo debug); o projeto Capacitor que o gera acompanha, com instruções em [`app-android/COMO_COMPILAR.md`](app-android/COMO_COMPILAR.md). **Esse APK ainda é o anterior à conferência contra o caderno oficial** — o conteúdo a empacotar (`app-android/www/`) já está corrigido, mas gerar o arquivo novo exige Android Studio. Até lá, no Android prefira a instalação pelo navegador.

O passo a passo detalhado, aparelho por aparelho, está em [`COMO_INSTALAR.md`](COMO_INSTALAR.md).

## Integridade dos dados

Este é o ponto central do projeto, então vale ser explícito sobre o que é oficial e o que não é.

**É oficial, extraído dos cadernos e gabaritos do INEP:** o texto das questões, as alternativas, a letra do gabarito, as questões anuladas e as figuras.

**Não é oficial, é material de estudo:** a classificação por especialidade e tema, e as justificativas de cada questão, redigidas com apoio de inteligência artificial a partir de diretrizes clínicas. Elas podem conter imprecisões — confira sempre em fonte confiável antes de considerá-las definitivas. O próprio aplicativo marca essas justificativas como não oficiais.

**Verificações realizadas:**

- **Cada palavra de cada questão foi conferida contra o caderno oficial.** O INEP passou a publicar os cadernos com texto extraível, então `scripts/10_conferir_textos_oficiais.py` compara enunciado e alternativas, campo a campo, com o PDF de cada edição. A conferência hoje termina sem nenhuma divergência.
- Essa conferência encontrou e corrigiu perdas silenciosas da primeira extração: unidades que sumiram (`130 × 80` sem o mmHg, `3.850 mm3` virando `mmy`), cifras que sumiram no meio da frase (`duração de 8 horas` virando `duração de horas`, `homem com 65 anos` virando `homem com anos`), letras iniciais comidas e 187 caracteres não decifrados grudados na alternativa correta da questão 100 de 2024/2. Ao todo, 47 campos foram restaurados a partir do original.
- Também apareceram **quatro questões cuja imagem havia ficado de fora** — sem ela não dava para respondê-las: as radiografias seriadas da 63 de 2023/2, o monitor multiparamétrico da 11 de 2024/2, os dois eletrocardiogramas da 46 e a radiografia de tórax da 60. Foram extraídas do caderno por `scripts/11_figuras_faltantes.py`.
- Nos dois casos em que o banco diverge do caderno de propósito, o motivo está registrado no próprio script: o caderno de 2024/2 traz `CKP - EPI` (a sigla correta é CKD-EPI) e `Trichomonas vaginallis` (o correto é *vaginalis*).
- Cada gabarito foi conferido por dupla verificação: leitura automática do arquivo e leitura visual da imagem oficial do gabarito definitivo, comparadas item a item.
- As tabelas de exames laboratoriais foram transcritas a partir da imagem oficial e conferidas valor a valor, e não por leitura automática, porque um erro em resultado, unidade ou valor de referência seria especialmente danoso.
- Cada justificativa foi cruzada automaticamente contra a letra do gabarito oficial. Esse cruzamento encontrou duas justificativas erradas (questões 85 e 89 de 2024/2), que foram revistas no original e corrigidas.
- O aplicativo passa por 121 verificações automatizadas: pontuação (tudo certo, tudo errado, metade em branco, anuladas fora da conta), correspondência entre a alternativa exibida e a registrada com o embaralhamento ligado, recusa de backups malformados, atalhos de teclado, cronômetro, contraste de cores nos dois temas e ausência de transbordo em tela de 375 px.

## O caderno cifrado de 2024/2

O caderno da edição 2024/2 **não tinha** texto legível quando este projeto começou: o arquivo usava onze fontes com tabelas de caracteres deliberadamente corrompidas, de modo que copiar o texto produzia apenas ruído. A extração exigiu reconstruir a codificação de cada fonte.

> O INEP passou a publicar esse caderno com o texto extraível. Por isso a decodificação deixou de ser a única fonte: hoje ela serve de registro do método, e o texto do banco é conferido diretamente contra o PDF oficial (veja *Integridade dos dados*). Foi essa segunda conferência que revelou o que a decodificação havia perdido.

O método está descrito em [`docs/METODO_DECODIFICACAO.md`](docs/METODO_DECODIFICACAO.md). Em resumo: os glifos foram recortados do documento pelas suas coordenadas e reconhecidos individualmente, com votação entre várias ocorrências; o resultado foi arbitrado por alinhamento com o reconhecimento óptico das páginas; e os códigos que escondiam mais de um caractere — o mesmo código servia ao sinal de mais das cruzes clínicas e ao dígito sete — foram separados por agrupamento da forma dos glifos, com conferência visual no original.

Ao final, as cem questões ficaram sem um único caractere ilegível.

## Estrutura do repositório

```
aplicativo/          aplicativo montado (edições completa, livre e de teste)
app-web/             app web instalável (PWA) — publica a edição livre
app-android/         projeto Android (Capacitor) e APK pronto para instalar
app-desktop/         aplicativo de computador (Electron) e instaladores
modelo/              modelo HTML sem os dados, usado na montagem
dados/               banco de questões, figuras, catálogo de fontes e justificativas
nuvem/               assinaturas: esquema, funções de borda, provas e painel do dono
fontes_inep/         cadernos de prova e gabaritos oficiais (PDF)
produto/             plano do produto e runbook de ativação
scripts/             processo completo de extração, verificação e montagem
testes/              testes automatizados do aplicativo
docs/                método de decodificação, esquema das justificativas, interface
.github/workflows/   publicação automática da app web no GitHub Pages
```

## Reproduzir

Requer Python 3 com `PyMuPDF` e `Pillow`. Para regenerar o aplicativo a partir dos dados:

```bash
pip install pymupdf pillow
python3 scripts/08_montar_aplicativo.py
```

O comando acima monta duas edições a partir do mesmo modelo: a **completa**, que pede
assinatura, e a **livre**, com um recorte gratuito e sem conta. Para gerar também a app web
instalável (que publica a edição livre) e sincronizar o projeto Android com a completa:

```bash
python3 scripts/09_montar_pwa.py
```

As justificativas com referências vivem fora do banco, em `dados/justificativas/`, e o
catálogo de fontes em `dados/referencias.json`. A porta de qualidade confere as duas coisas
contra o banco e falha se alguma referência citada não existir no catálogo:

```bash
python3 scripts/12_validar_justificativas.py
```

Para refazer o processo desde os PDF originais, os scripts estão numerados na ordem de execução, de `01_extrair_provas_legiveis.py` a `08_montar_aplicativo.py`. Eles leem os arquivos de `fontes_inep/`; para apontar para outra pasta, defina a variável de ambiente `REVALIDA_FONTES`.

Os dois scripts de conferência contra a fonte oficial exigem `PyMuPDF` e os cadernos em `fontes_inep/`:

```bash
python3 scripts/10_conferir_textos_oficiais.py   # confere; --corrigir grava as correções
python3 scripts/11_figuras_faltantes.py          # extrai as figuras que faltarem
```

> Os cadernos e gabaritos oficiais em PDF **não são versionados por padrão**, por ocuparem cerca de 27 MB. Baixe-os do portal do INEP e coloque-os em `fontes_inep/` com os nomes indicados em [`fontes_inep/FONTES.md`](fontes_inep/FONTES.md). Para versioná-los mesmo assim, remova a última regra do `.gitignore` e rode `git add -f fontes_inep/*.pdf`.

Os testes usam Node com Playwright:

```bash
npm install && npm run preparar && npm test
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
