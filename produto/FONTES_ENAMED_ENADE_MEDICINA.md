# Fontes oficiais para o módulo Revalida · ENAMED

Atualizado em 2026-08-07.

## Correção histórica importante

O **ENAMED não existia em 2023**. O Ministério da Educação instituiu o Exame Nacional de Avaliação da Formação Médica (Enamed) em 23 de abril de 2025, como modalidade do Enade para Medicina.

Portanto, para ampliar o banco sem misturar nomes de exames, a interface deve separar:

- **Revalida** — provas próprias do Revalida;
- **ENADE Medicina (histórico)** — prova de Medicina anterior à criação do ENAMED;
- **ENAMED** — a partir de 2025.

Não rotular a prova de 2023 como “ENAMED 2023”. Isso seria factualmente incorreto.

---

## 1. ENADE Medicina 2023 — fonte oficial INEP

Página oficial de provas e gabaritos de 2023:

https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enade/provas-e-gabaritos/2023

### Medicina

**Prova:**
https://download.inep.gov.br/enade/provas_e_gabaritos/2023_PV_medicina.pdf

**Gabarito:**
https://download.inep.gov.br/enade/provas_e_gabaritos/2023_GB_medicina.pdf

**Padrão de resposta das questões discursivas:**
https://download.inep.gov.br/enade/padrao_resposta/2023_medicina.pdf

### Estratégia de importação

O formato histórico do Enade tinha:
- 10 questões de Formação Geral, sendo 8 objetivas + 2 discursivas;
- 30 questões do Componente Específico, sendo 27 objetivas + 3 discursivas.

Para o banco **Revalida · ENAMED**, a primeira importação deve priorizar as **27 questões objetivas do Componente Específico de Medicina**. As questões de Formação Geral podem ficar de fora do banco principal por não representarem o núcleo médico que queremos treinar.

As questões discursivas podem futuramente alimentar um módulo separado de raciocínio/conduta, mas não devem ser misturadas ao simulador objetivo.

Identificador proposto:

```text
ENADE-MED-2023-Q001 ...
```

Na interface:

```text
ENADE Medicina · 2023
Histórico pré-ENAMED
```

---

## 2. ENAMED 2025 — primeira edição do exame

O ENAMED foi instituído em 2025. A prova oficial contém 100 questões objetivas.

### Base legal / legislação oficial

Página oficial:
https://www.gov.br/inep/pt-br/centrais-de-conteudo/legislacao/enamed/2025

Principais atos:
- Portaria MEC nº 330, de 23/04/2025 — institui o ENAMED;
- Portaria nº 413, de 18/06/2025 — regulamenta o exame;
- Edital nº 81, de 25/06/2025 — diretrizes e procedimentos;
- Portaria nº 478, de 18/07/2025 — Matriz de Referência Comum para Avaliação da Formação Médica.

### Prova

O INEP disponibiliza o caderno oficial de 100 questões. A versão ampliada, que contém o mesmo conteúdo textual da prova, está em:

https://download.inep.gov.br/enamed/provas_e_gabaritos/2025_caderno_ampliado_preliminar.pdf

### Gabarito definitivo

Usar a versão mais recente encontrada no servidor oficial do INEP:

https://download.inep.gov.br/enamed/provas_e_gabaritos/2025_gabarito_caderno_1_v2.pdf

**Não usar automaticamente uma versão anterior do gabarito** se houver versão `v2`: o pipeline deve comparar data/versão e exigir explicitamente o gabarito definitivo mais recente.

Identificador proposto:

```text
ENAMED-2025-Q001 ... ENAMED-2025-Q100
```

---

## 3. ENAMED 2026

Em 2026 existe edital do ENAMED, mas em 07/08/2026 a edição de 2026 ainda não deve ser tratada como banco de questões concluído sem a publicação oficial do caderno e do gabarito definitivo.

Página de legislação:
https://www.gov.br/inep/pt-br/centrais-de-conteudo/legislacao/enamed

O importador deve ter uma regra simples:

```text
Só entra no banco comercial quando existirem:
1. caderno oficial publicado pelo INEP;
2. gabarito definitivo;
3. conferência de texto concluída;
4. figuras necessárias extraídas e conferidas;
5. classificação + justificativa revisada.
```

---

## 4. Arquitetura recomendada no banco

Adicionar o campo `origem_exame` e não inferir o exame apenas pelo nome da edição:

```json
{
  "origem_exame": "enade_medicina",
  "edicao": "2023",
  "numero": 12
}
```

ou

```json
{
  "origem_exame": "enamed",
  "edicao": "2025",
  "numero": 12
}
```

ou

```json
{
  "origem_exame": "revalida",
  "edicao": "2024/2",
  "numero": 12
}
```

Isso permite filtros corretos:

```text
Todos
Revalida
ENAMED
ENADE Medicina (histórico)
```

---

## 5. Regra de qualidade

Para qualquer nova prova:

1. baixar apenas de `gov.br/inep` ou `download.inep.gov.br`;
2. guardar hash do PDF original;
3. extrair texto;
4. comparar enunciado e alternativas contra o PDF;
5. vincular figura quando necessária;
6. usar gabarito definitivo, nunca preliminar se existir definitivo;
7. manter o texto oficial imutável;
8. justificativas Evidentia em camada separada;
9. registrar a fonte oficial por questão;
10. executar a porta automática de qualidade antes do build.

---

## 6. Próximo lote recomendado

Ordem de integração:

1. **ENADE Medicina 2023 — 27 objetivas específicas**;
2. **ENAMED 2025 — 100 objetivas**;
3. revisar se todas as edições Revalida 2023–2026 publicadas pelo INEP estão efetivamente no banco atual;
4. quando sair caderno + gabarito definitivo, **ENAMED 2026**.

Isso acrescenta **127 questões médicas oficiais relevantes** ao acervo sem chamar incorretamente o ENADE 2023 de ENAMED.
