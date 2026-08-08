# Relatório auditável — correções objetivas no acervo

Data: 8 de agosto de 2026. Escopo: diferenças objetivas entre o banco e o texto extraído dos
cadernos oficiais; nenhuma resposta, conduta clínica ou gabarito foi reescrito.

As 20 correções de separação foram aplicadas ao banco canônico
(`dados/banco_400_questoes.json`) e à fonte intermediária de 2025/1
(`dados/bruto_2025_1.json`). Uma segunda auditoria dos limites dos campos encontrou três
truncamentos objetivos em 2024/2; eles foram corrigidos no banco canônico e na fonte da edição
(`dados/banco_2024_2.json`). Isso impede que uma futura reincorporação restaure os erros.

## Evidência

- Fontes: seis PDFs do INEP, aceitos somente pelos SHA-256 declarados em
  `scripts/10_conferir_textos_oficiais.py`.
- Primeira passagem: cobertura 600/600 e 3.000 campos, com **21 campos que só coincidiam ao
  eliminar todos os espaços**. O gate os reprovou em vez de normalizá-los silenciosamente.
- Auditoria de limites: mais **3 campos truncados** ainda eram substrings do PDF. O novo gate
  exige o texto completo entre os marcadores A/B/C/D e também os reprovou.
- Depois: cobertura 600/600, 3.000/3.000 campos, zero formatação suspeita, zero limite suspeito,
  zero divergência e cinco exceções editoriais documentadas.

## Alterações objetivas

| Edição · questão · campo | Antes (fragmento) | Depois, conforme PDF |
|:--|:--|:--|
| 2025/1 · 2 · enunciado | `36,5 o C` | `36,5 oC` |
| 2025/1 · 6 · enunciado | `C13 .` | `C13.` |
| 2025/1 · 9 · C | `Suspenderlosartana;indicar...` | `Suspender losartana; indicar...` |
| 2025/1 · 9 · D | `Manterlosartana;realizar...` | `Manter losartana; realizar...` |
| 2025/1 · 10 · A | `entregavoluntáriadacriança...` | `entrega voluntária da criança...` |
| 2025/1 · 10 · B | `perfuraçãouterina,infertilidadeemorte` | `perfuração uterina, infertilidade e morte` |
| 2025/1 · 10 · D | `julgamento,einformá-laquetem...` | `julgamento, e informá-la que tem...` |
| 2025/1 · 19 · enunciado | `para afase ativa` | `para a fase ativa` |
| 2025/1 · 21 · enunciado | `de acordo comsexo` | `de acordo com sexo` |
| 2025/1 · 25 · D | `famíliasciganas/Romanipreferiremresidênciasfixas` | `famílias ciganas/Romani preferirem residências fixas` |
| 2025/1 · 32 · C | `negligentequantoàestabilizaçãopré-transportedapaciente` | `negligente quanto à estabilização pré-transporte da paciente` |
| 2025/1 · 33 · D | `materno,pode-seofereceremmamadeiraoleiteordenhado` | `materno, pode-se oferecer em mamadeira o leite ordenhado` |
| 2025/1 · 40 · B | `paracetamol;encaminhar` | `paracetamol; encaminhar` |
| 2025/1 · 42 · A | `Iníciodedietalíquidaviaoral...` | `Início de dieta líquida via oral...` |
| 2025/1 · 42 · B | `Inícioimediatodedietaviaoral...` | `Início imediato de dieta via oral...` |
| 2025/1 · 43 · enunciado | `Considerandooquadroclínicoapresentado,aabordageminicialé` | `Considerando o quadro clínico apresentado, a abordagem inicial é` |
| 2025/1 · 46 · enunciado | `VR:<6mg/dL);efatorreumatoidenegativo...` | `VR: < 6 mg/dL); e fator reumatoide negativo...` |
| 2025/1 · 48 · B | `eutrofiaeacrodermatite;encaminhar...` | `eutrofia e acrodermatite; encaminhar...` |
| 2025/1 · 51 · D | `internaçãoemunidadedeterapiaintensiva...` | `internação em unidade de terapia intensiva...` |
| 2025/1 · 58 · D | `crises,alémdebrometodeipratrópioduranteasexacerbações` | `crises, além de brometo de ipratrópio durante as exacerbações` |
| 2024/2 · 8 · C | `...menor ou igual 60` | `...menor ou igual 60 mg/dL.` |
| 2024/2 · 80 · A | `morte da gestante...` | `A morte da gestante...` |
| 2024/2 · 93 · A | `...muito sugestivas da síndrome` | `...muito sugestivas da síndrome, especialmente se a mãe tiver 35 anos ou mais, visto ser um exame dispendioso e que não acrescentará novas informações.` |

O 21º caso, 2024/2 questão 23, não era perda: o banco usa barras verticais para preservar as
colunas de uma tabela laboratorial. Foi mantido e transformado em exceção explícita, junto das
quatro adaptações editoriais que já existiam. Cada exceção é mostrada no relatório e vinculada
ao SHA-256 do texto aprovado; mudar seu conteúdo sem revisar o manifesto reprova o gate.
