/* Evidentia Orto — motor adaptativo local v1
 * Sem IA, sem APIs externas, sem consumo de tokens.
 * Responsabilidades:
 * - registrar tentativas;
 * - estimar domínio por questão/tema;
 * - detectar erro com alta confiança e padrões de distrator;
 * - repetição espaçada de flashcards;
 * - montar uma sessão diária pelo tempo disponível.
 */

(function (global) {
  "use strict";

  const VERSION = 1;
  const STORAGE_KEY = "evidentia_orto_adaptive_v1";
  const DAY = 86400000;

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const nowMs = () => Date.now();
  const daysBetween = (a, b) => Math.max(0, (b - a) / DAY);

  function emptyState() {
    return {
      version: VERSION,
      questions: {},
      cards: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return emptyState();
      return {
        ...emptyState(),
        ...parsed,
        questions: parsed.questions || {},
        cards: parsed.cards || {},
      };
    } catch (_) {
      return emptyState();
    }
  }

  function save(state) {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return state;
  }

  function confidencePenalty(confidence, correct) {
    if (correct) return 0;
    if (confidence === "seguro") return 0.18;
    if (confidence === "duvida") return 0.08;
    return 0.03;
  }

  function recencyFactor(lastAnsweredAt, now = nowMs()) {
    if (!lastAnsweredAt) return 0.65;
    const d = daysBetween(new Date(lastAnsweredAt).getTime(), now);
    // Perde gradualmente estabilidade quando passa muito tempo sem contato.
    return clamp(1 - Math.log1p(d) / 8, 0.45, 1);
  }

  function computeMastery(stat, targetTimeSec = 75, now = nowMs()) {
    if (!stat || !stat.attempts) return 0.35;

    // Suavização bayesiana para evitar 100% depois de uma única resposta correta.
    const accuracy = (stat.correct + 1) / (stat.attempts + 2);
    const avgTime = stat.avgTimeSec || targetTimeSec;
    const speed = clamp(targetTimeSec / Math.max(20, avgTime), 0.55, 1.05);
    const recency = recencyFactor(stat.lastAnsweredAt, now);
    const repeatedErrorPenalty = clamp((stat.recentErrors || 0) * 0.04, 0, 0.16);
    const falseConvictionPenalty = clamp((stat.highConfidenceErrors || 0) * 0.06, 0, 0.18);

    return clamp(
      accuracy * 0.72 +
        speed * 0.10 +
        recency * 0.18 -
        repeatedErrorPenalty -
        falseConvictionPenalty,
      0,
      1
    );
  }

  function ensureQuestionStat(state, attempt) {
    const id = attempt.questionId;
    if (!state.questions[id]) {
      state.questions[id] = {
        questionId: id,
        area: attempt.area || "Sem área",
        topic: attempt.topic || "Sem tema",
        competency: attempt.competency || "geral",
        attempts: 0,
        correct: 0,
        errors: 0,
        recentErrors: 0,
        highConfidenceErrors: 0,
        avgTimeSec: 0,
        lastAnsweredAt: null,
        lastCorrect: null,
        distractors: {},
        history: [],
      };
    }
    return state.questions[id];
  }

  function recordAttempt(state, attempt) {
    if (!attempt || !attempt.questionId) throw new Error("questionId é obrigatório");
    const stat = ensureQuestionStat(state, attempt);
    const correct = !!attempt.correct;
    const t = clamp(Number(attempt.responseTimeSec || 0), 0, 3600);
    const answeredAt = attempt.answeredAt || new Date().toISOString();

    stat.attempts += 1;
    if (correct) stat.correct += 1;
    else stat.errors += 1;

    stat.avgTimeSec = stat.attempts === 1
      ? t
      : (stat.avgTimeSec * 0.75 + t * 0.25);

    if (!correct) {
      stat.recentErrors = clamp((stat.recentErrors || 0) + 1, 0, 5);
      if (attempt.confidence === "seguro") stat.highConfidenceErrors += 1;
      if (attempt.distractorTag) {
        stat.distractors[attempt.distractorTag] = (stat.distractors[attempt.distractorTag] || 0) + 1;
      }
    } else {
      stat.recentErrors = Math.max(0, (stat.recentErrors || 0) - 1);
    }

    stat.lastAnsweredAt = answeredAt;
    stat.lastCorrect = correct;
    stat.area = attempt.area || stat.area;
    stat.topic = attempt.topic || stat.topic;
    stat.competency = attempt.competency || stat.competency;

    stat.history.push({
      correct,
      responseTimeSec: t,
      confidence: attempt.confidence || "nao_informado",
      distractorTag: attempt.distractorTag || null,
      answeredAt,
    });
    stat.history = stat.history.slice(-12);
    stat.mastery = computeMastery(stat, attempt.targetTimeSec || 75);

    return stat;
  }

  function groupDashboard(state, field = "topic") {
    const groups = {};
    for (const stat of Object.values(state.questions)) {
      const key = stat[field] || "Sem classificação";
      if (!groups[key]) {
        groups[key] = {
          name: key,
          attempts: 0,
          correct: 0,
          highConfidenceErrors: 0,
          masterySum: 0,
          items: 0,
          distractors: {},
        };
      }
      const g = groups[key];
      g.attempts += stat.attempts || 0;
      g.correct += stat.correct || 0;
      g.highConfidenceErrors += stat.highConfidenceErrors || 0;
      g.masterySum += computeMastery(stat);
      g.items += 1;
      for (const [tag, count] of Object.entries(stat.distractors || {})) {
        g.distractors[tag] = (g.distractors[tag] || 0) + count;
      }
    }

    return Object.values(groups)
      .map((g) => ({
        ...g,
        accuracy: g.attempts ? g.correct / g.attempts : 0,
        mastery: g.items ? g.masterySum / g.items : 0,
        mainDistractor: Object.entries(g.distractors).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
      }))
      .sort((a, b) => a.mastery - b.mastery);
  }

  function questionPriority(state, question, now = nowMs()) {
    const stat = state.questions[question.id];
    if (!stat) return 0.82; // questão nunca vista: prioridade alta, mas abaixo de uma lacuna grave.

    const mastery = computeMastery(stat, question.targetTimeSec || 75, now);
    const last = stat.lastAnsweredAt ? new Date(stat.lastAnsweredAt).getTime() : 0;
    const days = last ? daysBetween(last, now) : 30;
    const overdue = clamp(days / 21, 0, 1);
    const recentError = stat.lastCorrect === false ? 1 : 0;
    const falseConviction = stat.highConfidenceErrors > 0 ? 1 : 0;
    const blueprintWeight = clamp(Number(question.weight || 1), 0.5, 2) / 2;

    return clamp(
      (1 - mastery) * 0.45 +
      overdue * 0.20 +
      recentError * 0.15 +
      falseConviction * 0.10 +
      blueprintWeight * 0.10,
      0,
      1
    );
  }

  function ensureCard(state, cardId) {
    if (!state.cards[cardId]) {
      state.cards[cardId] = {
        cardId,
        reps: 0,
        lapses: 0,
        ease: 2.5,
        intervalDays: 0,
        dueAt: new Date().toISOString(),
        lastReviewedAt: null,
      };
    }
    return state.cards[cardId];
  }

  // Scheduler determinístico estilo SM-2. Ratings: again | hard | good | easy.
  function rateCard(state, cardId, rating, reviewedAt = new Date()) {
    const c = ensureCard(state, cardId);
    const now = reviewedAt instanceof Date ? reviewedAt : new Date(reviewedAt);

    if (rating === "again") {
      c.lapses += 1;
      c.reps = 0;
      c.ease = clamp(c.ease - 0.20, 1.3, 3.0);
      c.intervalDays = 0.15; // ~3,6 h
    } else if (rating === "hard") {
      c.reps += 1;
      c.ease = clamp(c.ease - 0.08, 1.3, 3.0);
      c.intervalDays = Math.max(1, c.intervalDays ? c.intervalDays * 1.25 : 1);
    } else if (rating === "easy") {
      c.reps += 1;
      c.ease = clamp(c.ease + 0.10, 1.3, 3.0);
      c.intervalDays = c.intervalDays
        ? Math.max(4, c.intervalDays * c.ease * 1.3)
        : 4;
    } else {
      c.reps += 1;
      if (c.reps === 1) c.intervalDays = 1;
      else if (c.reps === 2) c.intervalDays = 4;
      else c.intervalDays = Math.max(5, c.intervalDays * c.ease);
    }

    c.intervalDays = Math.round(c.intervalDays * 10) / 10;
    c.lastReviewedAt = now.toISOString();
    c.dueAt = new Date(now.getTime() + c.intervalDays * DAY).toISOString();
    return c;
  }

  function dueCards(state, cards, now = nowMs()) {
    return (cards || [])
      .map((card) => {
        const stat = ensureCard(state, card.id);
        return { card, stat, due: new Date(stat.dueAt).getTime() <= now };
      })
      .filter((x) => x.due)
      .sort((a, b) => new Date(a.stat.dueAt) - new Date(b.stat.dueAt));
  }

  function buildDailySession(state, { questions = [], cards = [], minutes = 30, now = nowMs() } = {}) {
    const seconds = clamp(Number(minutes || 30), 10, 180) * 60;
    const cardBudget = Math.round(seconds * 0.28);
    const questionBudget = Math.round(seconds * 0.68);

    const due = dueCards(state, cards, now);
    const maxCards = Math.max(0, Math.floor(cardBudget / 25));
    const selectedCards = due.slice(0, maxCards).map((x) => x.card);

    const rankedQuestions = questions
      .map((q) => ({ ...q, priority: questionPriority(state, q, now) }))
      .sort((a, b) => b.priority - a.priority);
    const maxQuestions = Math.max(1, Math.floor(questionBudget / 85));
    const selectedQuestions = rankedQuestions.slice(0, maxQuestions);

    const criticalTopics = groupDashboard(state, "topic").slice(0, 3);

    return {
      minutes,
      cards: selectedCards,
      questions: selectedQuestions,
      criticalTopics,
      estimatedMinutes: Math.round((selectedCards.length * 25 + selectedQuestions.length * 85) / 60),
    };
  }

  function exportState(state) {
    return JSON.stringify(state, null, 2);
  }

  function importState(json) {
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    if (!parsed || typeof parsed !== "object") throw new Error("backup inválido");
    return save({ ...emptyState(), ...parsed, questions: parsed.questions || {}, cards: parsed.cards || {} });
  }

  global.EvidentiaAdaptive = {
    VERSION,
    STORAGE_KEY,
    emptyState,
    load,
    save,
    recordAttempt,
    computeMastery,
    groupDashboard,
    questionPriority,
    rateCard,
    dueCards,
    buildDailySession,
    exportState,
    importState,
  };
})(window);
