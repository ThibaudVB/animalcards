/**
 * UI.QUIZ.JS — Rendu des vues du système de Quiz
 *
 * renderQuizView()        → Écran de quiz actif (question + réponses)
 * renderQuizSuccess()     → Carte déverrouillée !
 * renderQuizFail()        → Mauvaise réponse, on recommence
 */

// ─────────────────────────────────────────────────────────
// VUE PRINCIPALE DU QUIZ
// ─────────────────────────────────────────────────────────
export function renderQuizView(container, { quiz, cardName, currentIndex, coins }) {
  const question = quiz.questions[currentIndex];
  const isLast = currentIndex === quiz.questions.length - 1;
  const progress = Math.round(((currentIndex) / quiz.questions.length) * 100);

  container.innerHTML = `
    <div class="quiz-screen">

      <!-- Header -->
      <div class="quiz-header">
        <button class="btn-back" id="quiz-btn-back">← Inventaire</button>
        <div class="quiz-card-name">${cardName}</div>
        <div class="quiz-coins">🪙 <span id="quiz-coin-count">${coins}</span></div>
      </div>

      <!-- Barre de progression -->
      <div class="quiz-progress">
        <div class="quiz-progress-bar">
          <div class="quiz-progress-fill" style="width: ${progress}%"></div>
        </div>
        <span class="quiz-progress-label">Question ${currentIndex + 1} / ${quiz.questions.length}</span>
      </div>

      <!-- Question -->
      <div class="quiz-question-card">
        <div class="quiz-question-icon">🧠</div>
        <p class="quiz-question-text">${question.question}</p>
      </div>

      <!-- Zone des indices -->
      <div class="quiz-hints-zone" id="hints-zone">
        <div class="hints-available">
          ${question.hints.map((h) => `
            <button class="btn-hint" data-level="${h.level}" data-cost="${h.cost}">
              💡 Indice ${h.level} <span class="hint-cost">${h.cost} 🪙</span>
            </button>
          `).join("")}
        </div>
        <div id="hint-text-display" class="hint-text hidden"></div>
      </div>

      <!-- Réponses -->
      <div class="quiz-answers" id="quiz-answers">
        ${question.answers.map((answer, i) => `
          <button class="answer-btn" data-index="${i}">
            <span class="answer-letter">${["A", "B", "C", "D"][i]}</span>
            <span class="answer-text">${answer}</span>
          </button>
        `).join("")}
      </div>

      <!-- Feedback (caché au départ) -->
      <div id="quiz-feedback" class="quiz-feedback hidden"></div>

    </div>
  `;
}

// ─────────────────────────────────────────────────────────
// FEEDBACK : BONNE RÉPONSE (en cours de quiz)
// ─────────────────────────────────────────────────────────
export function showCorrectFeedback(container, explanation, isLast, onNext) {
  const feedback = container.querySelector("#quiz-feedback");
  feedback.innerHTML = `
    <div class="feedback-correct">
      <span class="feedback-icon">✅</span>
      <div>
        <strong>Bonne réponse !</strong>
        <p class="feedback-explanation">${explanation}</p>
      </div>
    </div>
    <button class="btn-primary" id="btn-next-question">
      ${isLast ? "🎉 Terminer le Quiz" : "Question suivante →"}
    </button>
  `;
  feedback.classList.remove("hidden");

  // Désactive les boutons de réponse
  container.querySelectorAll(".answer-btn").forEach((btn) => (btn.disabled = true));
  container.querySelectorAll(".btn-hint").forEach((btn) => (btn.disabled = true));

  container.querySelector("#btn-next-question").addEventListener("click", onNext);
}

// ─────────────────────────────────────────────────────────
// FEEDBACK : MAUVAISE RÉPONSE
// ─────────────────────────────────────────────────────────
export function showWrongFeedback(container, correctIndex, explanation, onRetry) {
  const feedback = container.querySelector("#quiz-feedback");
  feedback.innerHTML = `
    <div class="feedback-wrong">
      <span class="feedback-icon">❌</span>
      <div>
        <strong>Mauvaise réponse…</strong>
        <p class="feedback-explanation">
          La bonne réponse était : <strong>${["A", "B", "C", "D"][correctIndex]}</strong><br/>
          ${explanation}
        </p>
      </div>
    </div>
    <button class="btn-retry" id="btn-retry-quiz">
      🔄 Recommencer depuis le début
    </button>
  `;
  feedback.classList.remove("hidden");

  // Colore en rouge la mauvaise réponse sélectionnée, en vert la bonne
  container.querySelectorAll(".answer-btn").forEach((btn) => {
    btn.disabled = true;
    const idx = parseInt(btn.dataset.index);
    if (idx === correctIndex) btn.classList.add("answer-correct");
    else btn.classList.add("answer-wrong-dim");
  });
  container.querySelectorAll(".btn-hint").forEach((btn) => (btn.disabled = true));

  container.querySelector("#btn-retry-quiz").addEventListener("click", onRetry);
}

// ─────────────────────────────────────────────────────────
// VUE : SUCCÈS — Carte déverrouillée !
// ─────────────────────────────────────────────────────────
export function renderQuizSuccess(container, { cardName, rewards, onBack }) {
  container.innerHTML = `
    <div class="quiz-success-screen">
      <div class="success-burst">🎉</div>
      <h1 class="success-title">Quiz réussi !</h1>
      <p class="success-subtitle">
        <strong>${cardName}</strong> est maintenant déverrouillée et prête pour le combat !
      </p>

      <div class="success-card-badge">
        🔓 Carte déverrouillée
      </div>

      <div class="rewards-banner">
        <div class="reward-item">
          <span class="reward-value">+${rewards.exp}</span>
          <span class="reward-label">EXP</span>
        </div>
        <div class="reward-item">
          <span class="reward-value">+${rewards.coins}</span>
          <span class="reward-label">🪙</span>
        </div>
        ${rewards.leveledUp ? `
          <div class="reward-item reward-levelup">
            <span class="reward-value">⬆️ Niv. ${rewards.newLevel}</span>
            <span class="reward-label">Level Up !</span>
          </div>
        ` : ""}
      </div>

      <button class="btn-primary" id="btn-back-after-quiz">
        Retour à l'inventaire
      </button>
    </div>
  `;

  container.querySelector("#btn-back-after-quiz").addEventListener("click", onBack);
}
