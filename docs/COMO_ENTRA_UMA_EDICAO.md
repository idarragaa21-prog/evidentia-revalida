# Como entra uma edição nova no banco

Escrito ao incorporar 2025/1, para que a próxima edição custe uma tarde e não uma semana.
Cada edição nova do Revalida soma ~100 questões e é a razão para alguém renovar.

## O princípio

**Nada é digitado à mão.** Enunciado, alternativas e gabarito saem dos PDF oficiais do
INEP. Se um passo não puder ser verificado contra o PDF, ele não entra.

## Os passos

### 1. Baixar do servidor oficial

Os PDF vivem em `https://download.inep.gov.br/revalida/provas_e_gabaritos/`. A página que
os lista (`gov.br/inep/.../revalida/provas-e-gabaritos`) carrega os links por JavaScript,
por abas de ano — abrir a aba do ano no navegador é o jeito de descobrir os nomes reais dos
arquivos, que **não seguem um padrão estável**:

| Edição | Prova | Gabarito |
|:--|:--|:--|
| 2025/1 | `2025_1_PV_objetiva_regular.pdf` | `2025_1_GB_objetiva_definitivo.pdf` |
| 2025/2 | `2025_2_caderno_1_preliminar.pdf` (e caderno 2) | `2025_2_gabarito_caderno_1.pdf` |
| 2026/1 | `2026_1_caderno_1_ampliada.pdf` | `gab2026.pdf` |

Guarde tudo em `fontes_inep/` e registre a origem em `fontes_inep/FONTES.md`.

### 2. Extrair as questões

**Confira primeiro se o caderno é de uma ou duas colunas.** É a decisão que mais estraga
dados em silêncio:

- **Uma coluna** (versões «ampliada»): `pdftotext -layout` funciona — ver
  `scripts/13_extrair_2026_1.py`.
- **Duas colunas** (versão «regular»): `-layout` põe as duas colunas na mesma linha e mistura
  a questão 1 com a 3, produzindo enunciados corrompidos sem nenhum erro visível. Use
  `pdftotext -raw`, que segue a ordem de leitura — ver `scripts/19_extrair_2025_1.py`.

Duas armadilhas que já custaram tempo e que os dois extratores tratam:

1. **A letra da alternativa vem solta no início da linha** (`A conceder alta médica…`), e em
   português muita frase começa por «A». *«A médica de uma penitenciária avalia…»* é o
   enunciado da questão 5, não a alternativa A. Por isso as alternativas se procuram **de
   trás para frente**, pela última sequência A<B<C<D em linhas crescentes.
2. **Depois da questão 100 vem o «Questionário de Percepção sobre a Prova»**, que reinicia a
   numeração e tem alternativas A-E. O bloco da questão 100 tem que ser cortado nesse marcador.

O extrator **aborta** se não achar exatamente 100 questões numeradas de 1 a 100, se alguma
não tiver A-D, ou se um enunciado for curto demais. Erro alto é melhor que banco torto.

### 3. Ler o gabarito

Do PDF **definitivo**, nunca do preliminar: o definitivo já traz as anulações, como `-` ou
como a palavra «Anulada». No banco isso vira `gabarito: null` + `anulada: true`.

O layout costuma alternar uma linha `Questão 1 2 3…` e outra `Gabarito B A A…`. Ler o **par**
mantém o alinhamento por posição — é o que evita trocar respostas entre questões. Ver
`scripts/20_gabarito_2025_1.py`.

> **Cuidado com o ENAMED.** Desde 2025/2 a prova teórica do Revalida compartilha questões com
> o ENAMED, mas **os dois exames anulam itens diferentes**. A `nota_gabarito_enamed_revalida_2025.pdf`
> diz que as questões 2 e 40 do caderno 1 e 52 e 90 do caderno 2 foram anuladas **no ENAMED**
> e **mantidas no Revalida**. Este é um banco do Revalida: vale a regra do Revalida.

**Confira sempre com uma releitura independente** antes de incorporar: leia o gabarito por um
segundo caminho e compare 100/100. Foi o que se fez em 2025/1.

### 4. Classificar, ilustrar e justificar

- **Área e tema**: as cinco áreas são strings exatas que o aplicativo usa para filtrar —
  copie-as de `dados/banco_400_questoes.json`, não as escreva de memória.
- **Figuras**: recorte do caderno oficial (`scripts/07` e `14`), com atribuição por item.
- **Justificativas**: o trabalho mais caro e o que sustenta o preço. Vale inteira a norma de
  `docs/ESQUEMA_JUSTIFICATIVAS.md`: só se cita fonte que já exista em `dados/referencias.json`,
  e quando o catálogo não cobre o ponto a questão fica **sem referências**, com o selo
  «estudo». Forçar uma citação é pior do que não citar.

### 5. Incorporar e validar

`scripts/17_incorporar_*.py` junta questões, gabarito e figuras no banco. Depois, sem exceção:

```bash
python3 scripts/12_validar_justificativas.py   # porta de qualidade
python3 scripts/10_conferir_textos_oficiais.py # confere contra o PDF oficial
npm test                                        # interface e CORS
```

## O que falta hoje

| Edição | Questões | Gabarito | Classificação | Figuras | Justificativas | No banco |
|:--|:--|:--|:--|:--|:--|:--|
| 2023/1 · 2023/2 · 2024/1 · 2024/2 · 2026/1 | ✓ | ✓ | ✓ | ✓ | ✓ | **sim** |
| **2025/1** | ✓ extraídas e validadas | ✓ 3 anuladas (7, 23, 34) | em curso | pendente | em curso | ainda não |
| **2025/2** | PDF baixado (2 cadernos) | PDF baixado | — | — | — | não |

### 2025/2: as duas perguntas já foram respondidas

**Os dois cadernos são a MESMA prova embaralhada — entra só um.** Comparados os 100 enunciados
de cada um pelos primeiros 90 caracteres, 96 coincidem, e um exemplo serve de prova: a questão
que no caderno 1 é a 89 é a 12 no caderno 2. Incorporar os dois daria ao banco 100 questões
duplicadas com números diferentes. **Use o caderno 1** e o seu gabarito.

**Não extraia 2025/2 com `-raw`.** Ao comparar com trechos mais longos as coincidências caem
(92 com 200 caracteres, 87 com 400) — não porque as provas difiram, mas porque nesses PDF o
modo `-raw` **come espaços**: sai `trabalho departopor8horaseevoluiuparapartovaginal`. Um
enunciado assim é ilegível e romperia a promessa de conferência palavra por palavra.

A saída está no próprio INEP: existe `2025_2_caderno_1_ampliado_preliminar.pdf`, a versão de
**uma coluna** — o mesmo formato que tornou 2026/1 fácil. Baixe-a e use o caminho de
`13_extrair_2026_1.py` (`pdftotext -layout`), não o de 2025/1.

> Regra geral que sai daqui: **prefira sempre a versão «ampliada»** quando ela existir. Uma
> coluna extrai limpo; duas colunas obrigam a `-raw`, e `-raw` nem sempre preserva os espaços.
> Antes de aceitar qualquer extração, leia três enunciados inteiros com os próprios olhos.
