window.EVIDENTIA_ORTO_SAMPLE = {
  questions: [
    {
      id: "trauma-pelvis-001",
      exam: ["TEPOT", "TEOT"],
      area: "Trauma",
      topic: "Pelvis e acetábulo",
      competency: "classificação",
      weight: 1.3,
      targetTimeSec: 70,
      stem: "Paciente politraumatizado apresenta fratura do anel pélvico. Qual princípio deve orientar a avaliação inicial da estabilidade?",
      options: {
        A: "Avaliar apenas o desvio na radiografia anteroposterior.",
        B: "Integrar mecanismo, padrão radiográfico e estabilidade hemodinâmica.",
        C: "Classificar somente após tomografia com reconstrução 3D.",
        D: "Considerar toda fratura pélvica como mecanicamente estável."
      },
      answer: "B",
      distractorTags: { A: "classificacao", C: "sequencia", D: "conceito" },
      explanation: "Questão de demonstração. O conteúdo final deverá ser escrito e referenciado a partir da bibliografia oficial definida para o produto.",
      references: []
    },
    {
      id: "joelho-lca-001",
      exam: ["TEPOT", "TEOT"],
      area: "Joelho",
      topic: "Ligamento cruzado anterior",
      competency: "diagnóstico",
      weight: 1.2,
      targetTimeSec: 55,
      stem: "Qual achado de exame físico é classicamente utilizado para avaliar insuficiência do ligamento cruzado anterior?",
      options: {
        A: "Teste de Lachman.",
        B: "Teste de Thompson.",
        C: "Teste de Finkelstein.",
        D: "Teste de Cozen."
      },
      answer: "A",
      distractorTags: { B: "anatomia", C: "anatomia", D: "anatomia" },
      explanation: "Questão de demonstração. Substituir por item autoral completo com referência verificada.",
      references: []
    },
    {
      id: "pediatrica-ddq-001",
      exam: ["TEPOT", "TEOT"],
      area: "Ortopedia pediátrica",
      topic: "Displasia do desenvolvimento do quadril",
      competency: "conduta",
      weight: 1.1,
      targetTimeSec: 75,
      stem: "Na preparação para prova, qual informação deve ser integrada antes de definir a conduta na displasia do desenvolvimento do quadril?",
      options: {
        A: "Apenas a idade cronológica.",
        B: "Idade, estabilidade, achados de imagem e possibilidade de redução concêntrica.",
        C: "Somente o ângulo acetabular.",
        D: "Somente a presença de limitação da abdução."
      },
      answer: "B",
      distractorTags: { A: "conduta", C: "imagem", D: "exame_fisico" },
      explanation: "Questão de demonstração. O item definitivo deverá seguir o blueprint e a bibliografia oficial.",
      references: []
    },
    {
      id: "ombro-fratura-001",
      exam: ["TEPOT", "TEOT"],
      area: "Ombro e cotovelo",
      topic: "Fratura proximal do úmero",
      competency: "classificação",
      weight: 0.9,
      targetTimeSec: 65,
      stem: "Ao estudar classificações de fraturas do úmero proximal, qual combinação é mais útil para evitar memorização isolada?",
      options: {
        A: "Número de partes + deslocamento + implicação terapêutica.",
        B: "Somente o nome da classificação.",
        C: "Somente a idade do paciente.",
        D: "Somente a presença de dor."
      },
      answer: "A",
      distractorTags: { B: "classificacao", C: "indicacao", D: "conceito" },
      explanation: "Questão de demonstração destinada apenas ao protótipo técnico.",
      references: []
    }
  ],
  cards: [
    {
      id: "card-lca-lachman",
      area: "Joelho",
      topic: "Ligamento cruzado anterior",
      front: "Qual teste é classicamente usado para avaliar o ligamento cruzado anterior?",
      back: "Teste de Lachman."
    },
    {
      id: "card-pelvis-principio",
      area: "Trauma",
      topic: "Pelvis e acetábulo",
      front: "Na avaliação inicial da pelve, quais três dimensões devem ser integradas?",
      back: "Mecanismo, padrão de lesão/imagem e estado clínico-hemodinâmico."
    },
    {
      id: "card-ddq-conduta",
      area: "Ortopedia pediátrica",
      topic: "Displasia do desenvolvimento do quadril",
      front: "Quais elementos precisam ser integrados antes de definir conduta na DDQ?",
      back: "Idade, estabilidade, imagem e possibilidade de redução concêntrica."
    }
  ]
};
