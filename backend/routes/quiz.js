/**
 * ROUTES/QUIZ.JS — Système de Quiz
 *
 * GET  /api/quiz/:cardId          → Récupère les questions (sans les réponses)
 * POST /api/quiz/:cardId/answer   → Soumet une réponse à une question
 * POST /api/quiz/:cardId/hint     → Achète un indice
 */

const express = require("express");
const router = express.Router();
const quizzes = require("../data/quizzes.json");
const Store = require("../data/store");
const authMiddleware = require("../middleware/auth");
const { sanitizeUser } = require("./auth");

// --- Helpers ---

// Retrouve un quiz par cardId
function getQuizByCardId(cardId) {
  return quizzes.find((q) => q.cardId === cardId) || null;
}

// Masque les bonnes réponses avant envoi au client
function sanitizeQuestions(questions) {
  return questions.map(({ id, question, answers, hints }) => ({
    id,
    question,
    answers,
    // On envoie les hints sans le champ "level" interne, juste cost + text masqué
    hints: hints.map((h) => ({ level: h.level, cost: h.cost })),
  }));
}

// Récompenses quand on valide un quiz
const QUIZ_REWARDS = { exp: 50, coins: 30 };

// ─────────────────────────────────────────────
// GET /api/quiz/:cardId
// Retourne les 5 questions sans les bonnes réponses
// ─────────────────────────────────────────────
router.get("/:cardId", authMiddleware, (req, res) => {
  const { cardId } = req.params;
  const user = req.user;

  // Vérifie que le joueur possède bien cette carte
  if (!user.inventory.includes(cardId)) {
    return res.status(403).json({ error: "Tu ne possèdes pas cette carte." });
  }

  // Vérifie que la carte n'est pas déjà déverrouillée
  if (user.unlockedCards.includes(cardId)) {
    return res.status(400).json({ error: "Cette carte est déjà déverrouillée !" });
  }

  const quiz = getQuizByCardId(cardId);
  if (!quiz) {
    return res.status(404).json({ error: "Quiz introuvable pour cette carte." });
  }

  return res.json({
    quizId: quiz.quizId,
    cardId: quiz.cardId,
    totalQuestions: quiz.questions.length,
    questions: sanitizeQuestions(quiz.questions),
  });
});

// ─────────────────────────────────────────────
// POST /api/quiz/:cardId/answer
// Corps : { questionId, answerIndex }
// Retourne : { correct, explanation, isQuizComplete, rewards? }
// ─────────────────────────────────────────────
router.post("/:cardId/answer", authMiddleware, (req, res) => {
  const { cardId } = req.params;
  const { questionId, answerIndex } = req.body;
  const user = req.user;

  if (answerIndex === undefined || !questionId) {
    return res.status(400).json({ error: "questionId et answerIndex sont requis." });
  }

  if (!user.inventory.includes(cardId)) {
    return res.status(403).json({ error: "Tu ne possèdes pas cette carte." });
  }

  const quiz = getQuizByCardId(cardId);
  if (!quiz) {
    return res.status(404).json({ error: "Quiz introuvable." });
  }

  const question = quiz.questions.find((q) => q.id === questionId);
  if (!question) {
    return res.status(404).json({ error: "Question introuvable." });
  }

  const correct = answerIndex === question.correctIndex;

  // Si mauvaise réponse → on retourne juste le résultat, pas de déverrouillage
  if (!correct) {
    return res.json({
      correct: false,
      correctIndex: question.correctIndex,
      explanation: question.explanation,
      isQuizComplete: false,
    });
  }

  // Bonne réponse → on vérifie si c'était la dernière question
  // Le frontend envoie les réponses dans l'ordre, on lui fait confiance
  // pour savoir si c'est la question finale (isLastQuestion dans le body)
  const { isLastQuestion } = req.body;

  if (!isLastQuestion) {
    // Bonne réponse, mais pas encore terminé
    return res.json({
      correct: true,
      explanation: question.explanation,
      isQuizComplete: false,
    });
  }

  // ✅ Quiz complété avec succès !
  user.unlockedCards.push(cardId);
  user.exp += QUIZ_REWARDS.exp;
  user.coins += QUIZ_REWARDS.coins;

  const newLevel = Math.floor(user.exp / 100) + 1;
  const leveledUp = newLevel > user.level;
  if (leveledUp) user.level = newLevel;

  Store.updateUser(user);

  console.log(`[QUIZ] ${user.username} a déverrouillé la carte ${cardId} !`);

  return res.json({
    correct: true,
    explanation: question.explanation,
    isQuizComplete: true,
    rewards: { ...QUIZ_REWARDS, leveledUp, newLevel: user.level },
    user: sanitizeUser(user),
  });
});

// ─────────────────────────────────────────────
// POST /api/quiz/:cardId/hint
// Corps : { questionId, hintLevel }
// Déduit les pièces et retourne le texte de l'indice
// ─────────────────────────────────────────────
router.post("/:cardId/hint", authMiddleware, (req, res) => {
  const { cardId } = req.params;
  const { questionId, hintLevel } = req.body;
  const user = req.user;

  if (!questionId || hintLevel === undefined) {
    return res.status(400).json({ error: "questionId et hintLevel sont requis." });
  }

  const quiz = getQuizByCardId(cardId);
  if (!quiz) return res.status(404).json({ error: "Quiz introuvable." });

  const question = quiz.questions.find((q) => q.id === questionId);
  if (!question) return res.status(404).json({ error: "Question introuvable." });

  const hint = question.hints.find((h) => h.level === hintLevel);
  if (!hint) return res.status(404).json({ error: "Indice introuvable." });

  // Vérification des pièces
  if (user.coins < hint.cost) {
    return res.status(400).json({
      error: `Pas assez de pièces. Il te faut ${hint.cost} 🪙, tu en as ${user.coins}.`,
    });
  }

  // Déduction des pièces
  user.coins -= hint.cost;
  Store.updateUser(user);

  console.log(`[QUIZ] ${user.username} a acheté l'indice ${hintLevel} (${hint.cost} 🪙)`);

  return res.json({
    hintText: hint.text,
    remainingCoins: user.coins,
    user: sanitizeUser(user),
  });
});

module.exports = router;
