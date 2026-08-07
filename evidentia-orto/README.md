# Evidentia Orto · TEPOT · TEOT

Protótipo inicial do segundo vertical da Evidentia.

## O que já existe

- plano estruturado do produto (`PLANO_PRODUTO.md`);
- motor adaptativo local (`src/adaptive-engine.js`);
- repetição espaçada de flashcards;
- registro de acerto/erro, tempo, confiança e tipo de distrator;
- domínio estimado por questão e tema;
- detecção de erro com alta confiança;
- priorização de questões;
- montagem automática de sessão por tempo disponível;
- protótipo web funcional (`app/index.html`);
- dados demonstrativos (`data/sample-data.js`).

## Como testar

Como os arquivos são estáticos, basta servir esta pasta localmente. Exemplo:

```bash
cd evidential-revalida/evidentia-orto
python3 -m http.server 8081
```

Depois abrir:

```text
http://localhost:8081/app/
```

O progresso do protótipo fica no `localStorage` do navegador.

## Importante

As questões em `sample-data.js` são **somente demonstrações técnicas**. Não são um banco comercial e não devem ser publicadas como preparação TEPOT/TEOT. O conteúdo definitivo será autoral e vinculado à bibliografia oficial/verificada.

## Próximo passo de código

1. separar o motor adaptativo em pacote reutilizável Evidentia Core;
2. criar schema real de questões e referências;
3. adicionar caderno de erros;
4. criar modo simulado;
5. adicionar visualização de flashcards por imagem/classificação;
6. tornar a aplicação uma PWA offline;
7. só depois conectar autenticação/licença/sincronização já usadas no Revalida.
