# Como o caderno cifrado de 2024/2 foi decodificado

## O problema

Os cadernos de 2023/1, 2023/2 e 2024/1 têm camada de texto legível: extrair enunciados e alternativas é um trabalho de análise sintática comum.

O caderno de 2024/2 não. Copiar qualquer trecho produz ruído. A primeira questão, por exemplo, sai assim:

```
12áà.2E2ájEáêôázú.Aá(z+áz.á/).ú3.5A.°.)).á°.2áC0E+×zájEá
```

quando o que está impresso na página é:

```
Um homem de 46 anos vai ao pronto-socorro com queixa de
```

A causa: o arquivo declara onze fontes cujas tabelas de correspondência entre código e caractere estão corrompidas. O desenho de cada letra está lá — o que se perdeu foi a informação de *qual letra* cada código representa. É uma substituição, e o desafio é reconstruí-la sem inventar nada.

## Por que não bastou o reconhecimento óptico

O caminho óbvio seria rasterizar as páginas e passar um reconhecedor óptico de caracteres. Isso foi feito, mas apenas como instrumento de verificação, não como fonte primária. Motivos:

- O exemplar disponível está anotado à mão (marcas de correção sobre as alternativas), o que polui o reconhecimento.
- O reconhecimento erra justamente onde o erro é mais perigoso: dígitos de doses, valores de laboratório e unidades.
- A leitura em duas colunas embaralha a ordem do texto se não for tratada.

A decisão foi usar a camada de texto — que é exata, uma vez decifrada — e reservar o reconhecimento óptico para conferir o resultado.

## O método, em seis passos

### 1. Inventário por fonte

Cada caractere do documento foi coletado com a fonte que o desenha, sua posição na página e o tamanho do corpo. Isso revelou que uma fonte responde por 98,8% do texto (o corpo das questões) e que as demais aparecem em tabelas, trechos em itálico, títulos e elementos decorativos.

Ponto importante: a substituição é **por fonte**, não global. Um mesmo código significa coisas diferentes em fontes diferentes. Tentar uma tabela única produz texto que parece certo nas letras e erra nos números.

### 2. Reconhecimento glifo a glifo

Para cada par (fonte, código), várias ocorrências foram recortadas da página renderizada em alta resolução, usando as coordenadas exatas de cada caractere, e reunidas lado a lado com espaçamento generoso. Essa tira foi submetida ao reconhecedor óptico, e o caractere foi decidido por votação entre as ocorrências.

O método foi validado antes de ser usado: aplicado a códigos cuja correspondência já era conhecida por outra via, acertou dez de doze. Os dois erros eram formas de contorno ambíguo (o `l` minúsculo lido como barra vertical), e não erros de conceito.

### 3. Arbitragem por alinhamento

O reconhecimento isolado erra em sinais baixos — vírgulas, apóstrofos, acentos — porque a normalização de altura os distorce. Para corrigir isso, o texto decodificado foi alinhado caractere a caractere com o reconhecimento óptico das mesmas páginas, e cada código recebeu o caractere mais votado no contexto real.

Esse alinhamento subiu a semelhança entre o texto decodificado e a leitura óptica das páginas para 95,7% — e o que resta dessa diferença é ruído do reconhecedor, não erro de decodificação.

### 4. O código que escondia dois caracteres

Aqui estava a armadilha. Um código produzia, ao mesmo tempo:

```
(1+/4+)          mucosas desidratadas — sinal de mais, correto
de +8 anos       deveria ser "de 78 anos" — dígito sete
```

O mesmo código, na mesma fonte, em contextos que exigem caracteres diferentes. A explicação: a tabela corrompida mapeia **dois glifos distintos para o mesmo ponto Unicode**. A camada de texto não os distingue.

A largura não separava os dois (o sinal de mais e o dígito sete têm o mesmo avanço nessa fonte). A separação veio da **forma**: cada ocorrência foi recortada, reduzida a um vetor de pixels normalizado e agrupada por semelhança. Surgiram dois grupos nítidos — quinze ocorrências em um, vinte e nove no outro —, e a inspeção visual de cada grupo confirmou: um é o sinal de mais, o outro é o sete.

O mesmo procedimento, aplicado a todos os códigos da fonte principal, encontrou um segundo caso: um código que servia à letra `T` maiúscula e aos dois-pontos.

### 5. Tabelas de exames lidas à vista

As tabelas de laboratório usam fontes secundárias com poucas ocorrências por código, onde tanto o reconhecimento quanto o alinhamento ficam frágeis. Como um erro em um valor de bilirrubina ou em uma unidade seria especialmente danoso, essas cinco tabelas não foram decodificadas automaticamente: foram **recortadas da página e transcritas à vista**, valor a valor.

### 6. Verificação

- Todas as cifras do texto decodificado foram comparadas com o reconhecimento óptico da página correspondente. Oitenta e sete das cem questões tiveram todas as suas cifras confirmadas de imediato; as divergências restantes foram inspecionadas uma a uma na imagem original, e todas se mostraram omissões do reconhecedor, não erros de decodificação.
- Ao final, as cem questões ficaram **sem um único caractere ilegível**.
- Confirmações independentes: a primeira questão coincide exatamente com uma consulta feita à fonte por outra via; e as respostas marcadas à mão no exemplar (questões 66 e 76) coincidem com o gabarito oficial verificado, o que valida ao mesmo tempo a decodificação, a separação das alternativas e o gabarito.

## Ordem de execução dos scripts

| Script | O que faz |
|:--|:--|
| `01_extrair_provas_legiveis.py` | Extrai as edições com camada de texto legível (2023/1, 2023/2, 2024/1) |
| `02_reconhecer_glifos.py` | Reconhece os glifos de uma fonte, por votação entre ocorrências |
| `03_detectar_formas.py` | Agrupa os glifos por forma e aponta os códigos com mais de um caractere |
| `04_desambiguar_glifos.py` | Separa as ocorrências desses códigos em grupos e gera as amostras para conferência visual |
| `05_decodificar_2024_2.py` | Decodifica o caderno inteiro aplicando as tabelas e a desambiguação por forma |
| `06_separar_alternativas.py` | Separa enunciado e alternativas A–D de cada questão |
| `07_extrair_figuras.py` | Recorta as figuras dos cadernos e as codifica para embutir no aplicativo |
| `08_montar_aplicativo.py` | Monta o aplicativo final a partir do modelo e dos dados |
| `verificar_gabaritos.py` | Confere o gabarito lido do arquivo contra a leitura visual da imagem oficial |
| `tabelas_2024_2.py` | Tabelas de exames transcritas à vista a partir da imagem oficial |

## O que este método não resolve

Ele reconstrói a correspondência entre códigos e caracteres com alta confiança, mas depende de duas etapas com julgamento humano: a conferência visual dos grupos de glifos ambíguos e a transcrição das tabelas. Ambas foram feitas e estão documentadas, mas não são automáticas — e é justamente por não serem que se pode confiar nos números.
