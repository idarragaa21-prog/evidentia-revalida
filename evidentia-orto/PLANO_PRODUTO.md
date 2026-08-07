# Evidentia Orto — TEPOT · TEOT

## Visão

**Evidentia Orto** será um produto separado, construído sobre o mesmo princípio da marca Evidentia: conteúdo verificável, aprendizagem ativa e algoritmo transparente.

Não será apenas um banco de questões. O produto deve responder diariamente à pergunta:

> **O que este residente precisa estudar hoje para chegar melhor preparado ao TEPOT/TEOT?**

Sem IA generativa, sem consumo de tokens e com funcionamento local-first.

---

## 1. Público

### TEPOT
- residentes/especializandos de primeiro e segundo ano;
- uso longitudinal, começando cedo na formação;
- foco em base ortopédica, trauma, anatomia, classificações, princípios e condutas.

### TEOT
- residentes/especializandos de terceiro ano e candidatos ao título;
- preparação teórica e, posteriormente, módulos de raciocínio para a etapa prática/oral.

A estratégia comercial é acompanhar o mesmo usuário durante vários anos: **R1 → TEPOT → R2 → TEPOT → R3 → TEOT**.

---

## 2. Princípios invioláveis

1. **Sem IA em tempo real.** Nenhuma função depende de OpenAI, Claude, Gemini ou tokens.
2. **Conteúdo médico versionado e revisável.** Cada questão deve apontar para bibliografia verificável.
3. **Algoritmo explicável.** O usuário pode entender por que um tema foi classificado como fraco.
4. **Local-first.** Estudo, cálculo de domínio, repetição e seleção de sessão funcionam offline.
5. **Sincronização é cópia, não dependência.** Quando houver servidor, ele sincroniza progresso; não decide a sessão.
6. **Questões próprias até esclarecer licenciamento de questões oficiais/anteriores da SBOT.** Não copiar bancos comerciais.
7. **Uma fonte de verdade para conteúdo e metadados.** Nada de números escritos manualmente em várias telas.

---

## 3. Modos de estudo

### 3.1 Simulado
- prova completa ou parcial;
- por área, tema ou nível;
- cronômetro;
- correção somente ao final;
- desempenho global e por domínio.

### 3.2 Modo Estudo
- resposta imediata;
- justificativa da correta;
- justificativa de cada distrator;
- referência bibliográfica;
- opção de transformar o conceito em revisão.

### 3.3 Revisão Inteligente
A aplicação escolhe as questões que devem voltar considerando:
- acertos e erros;
- recência;
- tempo de resposta;
- erro repetido;
- erro com alta confiança;
- domínio do tema;
- intervalo desde a última exposição.

### 3.4 Flashcards Evidentia
Tipos:
- pergunta/resposta;
- cloze;
- classificação;
- imagem;
- conduta;
- dose/medida/ângulo;
- “por que não?”;
- comparação entre diagnósticos/condutas.

Scheduler local inspirado em repetição espaçada. A primeira versão usa um algoritmo determinístico simples; pode evoluir para FSRS sem custo de API.

### 3.5 Caderno de Erros
Não será apenas uma lista. Deve agrupar:
- por área;
- por tema;
- por classificação;
- por tipo de erro;
- por distrator recorrente;
- por erro com alta confiança.

### 3.6 Estudo Adaptativo
O usuário informa o tempo disponível (20/30/45/60 min) e a app monta a sessão de maior prioridade.

### 3.7 Reta Final
O usuário informa a data do exame. A distribuição diária muda conforme:
- dias restantes;
- temas frágeis;
- revisões vencidas;
- peso/frequência da área no blueprint;
- estabilidade do conhecimento.

---

## 4. Modelo do aluno

Cada questão registra localmente:

```json
{
  "question_id": "trauma-pelvis-001",
  "area": "Trauma",
  "topic": "Pelvis e acetábulo",
  "correct": false,
  "response_time_sec": 94,
  "confidence": "seguro",
  "distractor_tag": "classificacao",
  "answered_at": "2026-08-07T17:00:00Z"
}
```

A app deriva:
- domínio estimado;
- risco de esquecimento;
- velocidade;
- erros recentes;
- falsa convicção (erro + alta confiança);
- padrões de distratores;
- prioridade de revisão.

O algoritmo deve conseguir explicar o resultado, por exemplo:

> Pelvis e acetábulo precisa de atenção: 43% de acertos, 3 erros nos últimos 7 dias, tempo médio acima da sua média e 1 erro com alta confiança.

---

## 5. Estrutura de conteúdo

Cada questão própria deve conter no mínimo:

```json
{
  "id": "joelho-lca-001",
  "exam": ["TEPOT", "TEOT"],
  "area": "Joelho",
  "topic": "Ligamento cruzado anterior",
  "competency": "conduta",
  "difficulty": 2,
  "stem": "...",
  "options": {"A":"...","B":"...","C":"...","D":"..."},
  "answer": "C",
  "distractor_tags": {"A":"indicacao", "B":"anatomia", "D":"tempo"},
  "explanation": "...",
  "references": ["ref-rockwood-001"]
}
```

Áreas iniciais:
- Trauma;
- Joelho;
- Quadril;
- Ombro e cotovelo;
- Mão;
- Pé e tornozelo;
- Coluna;
- Ortopedia pediátrica;
- Tumores;
- Infecção;
- Metabolismo ósseo;
- Princípios de fixação e biomecânica;
- Anatomia aplicada.

---

## 6. Conteúdo visual específico de Ortopedia

O motor deve suportar:
- radiografias;
- tomografia;
- ressonância;
- fotografias clínicas autorizadas;
- desenhos próprios de anatomia;
- classificações;
- planejamento cirúrgico;
- algoritmos próprios baseados em fontes.

Cada imagem precisa de origem/licença documentada. Não usar figuras de livros comerciais sem autorização.

---

## 7. Roadmap

### Fase 0 — agora
- [x] plano de produto;
- [x] motor adaptativo local v1;
- [x] esquema de dados;
- [x] protótipo web mínimo;
- [ ] bibliografia oficial TEPOT/TEOT versionada;
- [ ] blueprint de áreas e pesos;
- [ ] primeiro lote de 100 questões próprias.

### Fase 1 — MVP
- banco de 300–500 questões próprias;
- modo estudo;
- simulado;
- caderno de erros;
- flashcards;
- repetição espaçada;
- dashboard por tema;
- sessão adaptativa;
- PWA offline.

### Fase 2 — produto comercial
- autenticação e licença reutilizando a arquitetura Evidentia;
- sincronização entre aparelhos;
- pagamento;
- painel de administração;
- assinatura/passes;
- política de privacidade;
- beta com residentes reais.

### Fase 3 — diferenciação
- modo imagem;
- classificações com repetição;
- preparação de prova prática/oral com árvores de decisão pré-escritas;
- plano até a data do exame;
- exportação opcional para Anki;
- relatórios por competência.

---

## 8. Métricas de produto

Não medir apenas número de questões feitas.

Principais:
- usuários ativos por semana;
- sessões concluídas;
- questões por sessão;
- revisões vencidas concluídas;
- evolução de domínio por área;
- retenção em 7/30/90 dias;
- conversão gratuito → pago;
- renovação TEPOT → TEPOT → TEOT.

---

## 9. Arquitetura

```text
EVIDENTIA CORE
├── adaptive-engine.js       domínio, prioridade e sessão diária
├── spaced-repetition        flashcards e revisões
├── local-store              progresso offline
├── sync                     futuro: Supabase
├── auth/licença             reutilizar do Revalida
└── payments                 reutilizar do Revalida

EVIDENTIA ORTO
├── conteúdo TEPOT/TEOT
├── blueprint ortopédico
├── questões próprias
├── imagens licenciadas/próprias
└── UI específica de Ortopedia
```

A separação permite melhorar o motor uma vez e usar o mesmo raciocínio no Revalida · ENAMED.

---

## 10. Primeira definição de sucesso

O MVP está validado quando:
1. 20 residentes usam por pelo menos 14 dias;
2. ≥ 50% retornam na segunda semana;
3. conseguem entender o dashboard sem explicação;
4. a sessão adaptativa é usada voluntariamente;
5. pelo menos 5 usuários dizem que pagariam pelo produto e depois ocorre a primeira venda real.
