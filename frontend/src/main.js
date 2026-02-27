/**
 * MAIN.JS — Orchestrateur complet (Étape 3 : Combats)
 */

import { Auth, register, login, logout, openBooster, getInventory } from "./api.js";
import { fetchQuiz, submitAnswer, buyHint } from "./api.quiz.js";
import {
  connectSocket, disconnectSocket, offAllBattleEvents, onBattleEvent,
  joinQueue, leaveQueue, prepareInvite, sendInvite, respondToInvite,
  sendAction, fetchLeaderboard,
} from "./api.battle.js";
import { setState, getState } from "./state.js";
import {
  renderAuthView, renderDashboardView, renderBoosterOpeningView,
  renderInventoryView, showError,
} from "./ui.js";
import {
  renderQuizView, showCorrectFeedback, showWrongFeedback, renderQuizSuccess,
} from "./ui.quiz.js";
import {
  renderDeckSelector, renderWaitingRoom, renderBattleView,
  updateBattleLog, renderBattleEnd, renderLeaderboard, showInviteNotification,
} from "./ui.battle.js";

const app = document.getElementById("app");

// =========================================================
// ROUTEUR
// =========================================================
function navigate(view, data = {}) {
  setState({ currentView: view });
  offAllBattleEvents();
  const { currentUser } = getState();

  switch (view) {
    case "auth":        renderAuthView(app); bindAuthEvents(); break;
    case "dashboard":   enterHomeMode(currentUser); break;
    case "booster":     renderBoosterOpeningView(app, data); bindBoosterEvents(); break;
    case "inventory":   renderInventoryView(app, data); bindInventoryEvents(); break;
    case "battle-deck": handleBattleDeckView(data); break;
    case "battle":      handleBattleView(data); break;
    case "leaderboard": handleLeaderboardView(); break;
  }
}

// =========================================================
// INIT
// =========================================================
async function init() {
  if (Auth.isLoggedIn()) {
    const savedUser = JSON.parse(localStorage.getItem("ac_user") || "null");
    if (savedUser) {
      setState({ currentUser: savedUser });
      connectSocket();
      listenForInvites();
      enterHomeMode(savedUser);
      return;
    }
  }
  navigate("auth");
}

function enterHomeMode(user) {
  document.body.classList.add("home-mode");
  refreshSwiperUI(user);
  bindSwiperButtons();
  // Charge l'inventaire dans la page swiper
  getInventory().then(refreshSwiperInventory).catch(() => {});
  // Events swiper
  window.addEventListener("swiper:inventory", async () => {
    const data = await getInventory().catch(() => ({ inventory: [] }));
    refreshSwiperInventory(data);
  }, { once: false });
  window.addEventListener("swiper:leaderboard", refreshSwiperLeaderboard, { once: false });
}

function bindSwiperButtons() {
  const btnBooster = document.getElementById("sw-btn-booster");
  if (btnBooster) {
    btnBooster.onclick = async () => {
      btnBooster.disabled = true; btnBooster.textContent = "Ouverture...";
      try {
        const result = await openBooster();
        localStorage.setItem("ac_user", JSON.stringify(result.user));
        setState({ currentUser: result.user });
        refreshSwiperUI(result.user);
        document.body.classList.remove("home-mode");
        navigate("booster", result);
      } catch (err) {
        btnBooster.disabled = false; btnBooster.textContent = "📦 Ouvrir un Booster";
      }
    };
  }

  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) {
    btnLogout.onclick = handleLogout; // Ta fonction handleLogout va s'en occuper !
  }

  const btnMatchmaking = document.getElementById("sw-btn-matchmaking");
  if (btnMatchmaking) {
    btnMatchmaking.onclick = async () => {
      document.body.classList.remove("home-mode");
      await handleBattleDeckView("queue");
    };
  }

  const btnInvite = document.getElementById("sw-btn-invite");
  if (btnInvite) {
    btnInvite.onclick = async () => {
      const username = prompt("Nom du joueur à inviter :");
      if (!username?.trim()) return;
      document.body.classList.remove("home-mode");
      await handleBattleDeckView(username.trim());
    };
  }
}

// =========================================================
// AUTH
// =========================================================
function bindAuthEvents() {
  const form = document.getElementById("auth-form");
  const tabs = document.querySelectorAll(".tab-btn");
  let currentTab = "login";

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.dataset.tab;
      document.getElementById("auth-submit-btn").textContent =
        currentTab === "login" ? "Se connecter" : "Créer mon compte";
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const btn = document.getElementById("auth-submit-btn");
    btn.disabled = true; btn.textContent = "Chargement...";

    try {
      const result = currentTab === "login"
        ? await login(username, password)
        : await register(username, password);

      localStorage.setItem("ac_user", JSON.stringify(result.user));
      setState({ currentUser: result.user });
      connectSocket();
      listenForInvites();

      if (!result.user.hasSeenTutorial) await handleFirstBooster();
      else navigate("dashboard");
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = currentTab === "login" ? "Se connecter" : "Créer mon compte";
    }
  });
}

// =========================================================
// DASHBOARD
// =========================================================
function bindDashboardEvents() {
  document.getElementById("btn-open-booster").addEventListener("click", handleOpenBooster);
  document.getElementById("btn-view-inventory").addEventListener("click", handleViewInventory);
  document.getElementById("btn-logout").addEventListener("click", handleLogout);
  document.getElementById("btn-battle")?.addEventListener("click", () => navigate("battle-deck"));
  document.getElementById("btn-leaderboard")?.addEventListener("click", () => navigate("leaderboard"));
}

// =========================================================
// BOOSTER
// =========================================================
function bindBoosterEvents() {
  document.getElementById("btn-back-dashboard").addEventListener("click", () => navigate("dashboard"));
}

// =========================================================
// INVENTAIRE
// =========================================================
function bindInventoryEvents() {
  document.getElementById("btn-back-dashboard").addEventListener("click", () => navigate("dashboard"));
  document.querySelectorAll(".btn-start-quiz").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await handleStartQuiz(btn.dataset.cardId, btn.dataset.cardName);
    });
  });
}

// =========================================================
// QUIZ
// =========================================================
async function handleStartQuiz(cardId, cardName) {
  try {
    const quiz = await fetchQuiz(cardId);
    startQuizFlow({ quiz, cardId, cardName });
  } catch (err) { showError(err.message); }
}

function startQuizFlow({ quiz, cardId, cardName }) {
  let currentIndex = 0;

  const renderQ = () => {
    const { currentUser } = getState();
    renderQuizView(app, { quiz, cardName, currentIndex, coins: currentUser.coins });
    bindQuizEvents();
  };

  const bindQuizEvents = () => {
    document.getElementById("quiz-btn-back").addEventListener("click", async () => {
      navigate("inventory", await getInventory());
    });

    document.querySelectorAll(".answer-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const answerIndex = parseInt(btn.dataset.index);
        const question = quiz.questions[currentIndex];
        const isLastQuestion = currentIndex === quiz.questions.length - 1;
        btn.style.borderColor = "var(--accent-blue)";

        try {
          const result = await submitAnswer(cardId, question.id, answerIndex, isLastQuestion);
          if (result.correct) {
            if (result.isQuizComplete) {
              localStorage.setItem("ac_user", JSON.stringify(result.user));
              setState({ currentUser: result.user });
              renderQuizSuccess(app, {
                cardName, rewards: result.rewards,
                onBack: async () => navigate("inventory", await getInventory()),
              });
            } else {
              showCorrectFeedback(app, result.explanation, isLastQuestion, () => {
                currentIndex++; renderQ();
              });
            }
          } else {
            showWrongFeedback(app, result.correctIndex, result.explanation, () => {
              currentIndex = 0; renderQ();
            });
          }
        } catch (err) { showError(err.message); }
      });
    });

    document.querySelectorAll(".btn-hint").forEach((hintBtn) => {
      hintBtn.addEventListener("click", async () => {
        const level = parseInt(hintBtn.dataset.level);
        const cost = parseInt(hintBtn.dataset.cost);
        const question = quiz.questions[currentIndex];
        if (!confirm(`Acheter l'indice ${level} pour ${cost} pieces ?`)) return;

        try {
          const result = await buyHint(cardId, question.id, level);
          document.getElementById("quiz-coin-count").textContent = result.remainingCoins;
          const { currentUser } = getState();
          currentUser.coins = result.remainingCoins;
          localStorage.setItem("ac_user", JSON.stringify(currentUser));
          setState({ currentUser: { ...currentUser } });
          const hintDisplay = document.getElementById("hint-text-display");
          hintDisplay.textContent = "Indice " + level + " : " + result.hintText;
          hintDisplay.classList.remove("hidden");
          hintBtn.disabled = true;
        } catch (err) { showError(err.message); }
      });
    });
  };

  renderQ();
}

// =========================================================
// COMBAT — SÉLECTION DU DECK
// =========================================================
async function handleBattleDeckView() {
  try {
    const { inventory } = await getInventory();
    const { currentUser } = getState();
    const unlockedCards = inventory.filter((c) => currentUser.unlockedCards.includes(c.id));

    renderDeckSelector(app, {
      unlockedCards,
      onBack: () => navigate("dashboard"),
      onConfirm: async (mode, deck, targetUsername) => {
        if (mode === "queue") {
          handleJoinQueue(deck);
        } else {
          handleSendInvite(deck, targetUsername);
        }
      },
    });
  } catch (err) { showError(err.message); }
}

// =========================================================
// COMBAT — MATCHMAKING
// =========================================================
function handleJoinQueue(deck) {
  const { currentUser } = getState();
  setState({ pendingDeck: deck });

  renderWaitingRoom(app, {
    onCancel: () => {
      leaveQueue();
      navigate("dashboard");
    },
  });

  joinQueue(currentUser.id, deck);

  onBattleEvent("battle:start", (data) => {
    setState({ battleId: data.battleId, battleState: data.state });
  });
  onBattleEvent("battle:yourRole", (data) => {
    setState({ myRole: data.role });
    const { battleState, myRole } = getState();
    navigate("battle", { state: battleState, myRole });
  });
}

// =========================================================
// COMBAT — INVITATION
// =========================================================
function handleSendInvite(deck, targetUsername) {
  const { currentUser } = getState();
  setState({ pendingDeck: deck });

  prepareInvite(currentUser.id, deck);

  onBattleEvent("battle:readyToInvite", () => {
    sendInvite(currentUser.id, targetUsername, deck);
  });

  onBattleEvent("battle:inviteSent", () => {
    renderWaitingRoom(app, { onCancel: () => navigate("dashboard") });
    app.querySelector(".waiting-title").textContent = `Invitation envoyée à ${targetUsername}…`;
  });

  onBattleEvent("battle:inviteDeclined", (data) => {
    showError(`${data.byUsername} a refusé ton invitation.`);
    navigate("battle-deck");
  });

  onBattleEvent("battle:start", (data) => {
    setState({ battleId: data.battleId, battleState: data.state });
  });
  onBattleEvent("battle:yourRole", (data) => {
    setState({ myRole: data.role });
    const { battleState, myRole } = getState();
    navigate("battle", { state: battleState, myRole });
  });
}

// =========================================================
// COMBAT — ÉCOUTE DES INVITATIONS ENTRANTES (global)
// =========================================================
function listenForInvites() {
  onBattleEvent("battle:inviteReceived", (data) => {
    showInviteNotification(app, {
      fromUsername: data.fromUsername,
      fromSocketId: data.fromSocketId,
      onAccept: (fromSocketId) => {
        const { currentUser, pendingDeck } = getState();
        if (!pendingDeck || pendingDeck.length !== 3) {
          alert("Tu dois d'abord sélectionner un deck ! Va dans Mode Combat.");
          return;
        }
        respondToInvite(true, fromSocketId, currentUser.id, pendingDeck);

        onBattleEvent("battle:start", (d) => setState({ battleId: d.battleId, battleState: d.state }));
        onBattleEvent("battle:yourRole", (d) => {
          setState({ myRole: d.role });
          const { battleState, myRole } = getState();
          navigate("battle", { state: battleState, myRole });
        });
      },
      onDecline: (fromSocketId) => {
        const { currentUser } = getState();
        respondToInvite(false, fromSocketId, currentUser.id, []);
      },
    });
  });
}

// =========================================================
// COMBAT — VUE DE COMBAT
// =========================================================
function handleBattleView({ state, myRole }) {
  let currentState = state;
  let actionSent = false;

  const doRender = () => {
    renderBattleView(app, {
      state: currentState, myRole,
      onAttack: () => {
        if (actionSent) return;
        actionSent = true;
        const btn = document.getElementById("btn-attack");
        if (btn) { btn.disabled = true; btn.textContent = "En attente de l'adversaire…"; }
        const { battleId, currentUser } = getState();
        sendAction(battleId, currentUser.id);
      },
    });
  };

  doRender();

  onBattleEvent("battle:opponentReady", () => {
    const btn = document.getElementById("btn-attack");
    if (btn && !actionSent) btn.textContent = "L'adversaire est prêt — attaque !";
  });

  onBattleEvent("battle:turnResult", (data) => {
    currentState = data.state;
    actionSent = false;
    doRender();
    updateBattleLog(data.events, myRole);
  });

  onBattleEvent("battle:end", (data) => {
    const { currentUser } = getState();
    // Refresh des coins/exp
    const updatedUser = {
      ...currentUser,
      exp: currentUser.exp + (data.winner === myRole ? 100 : 20),
      coins: currentUser.coins + (data.winner === myRole ? 50 : 10),
      stats: {
        wins: currentUser.stats.wins + (data.winner === myRole ? 1 : 0),
        losses: currentUser.stats.losses + (data.winner !== myRole ? 1 : 0),
      },
    };
    localStorage.setItem("ac_user", JSON.stringify(updatedUser));
    setState({ currentUser: updatedUser });

    renderBattleEnd(app, {
      winner: data.winner,
      myRole,
      winnerUsername: data.winnerUsername,
      rewards: data.rewards,
      onBack: () => { const u = getState().currentUser; document.body.classList.add("home-mode"); refreshSwiperUI(u); bindSwiperButtons(); },
    });
  });

  onBattleEvent("battle:opponentDisconnected", (data) => {
    renderBattleEnd(app, {
      winner: data.winner, myRole,
      winnerUsername: data.winner === myRole ? "Toi" : "Adversaire",
      rewards: { winner: { exp: 100, coins: 50 }, loser: { exp: 20, coins: 10 } },
      onBack: () => navigate("dashboard"),
    });
  });
}

// =========================================================
// LEADERBOARD
// =========================================================
async function handleLeaderboardView() {
  try {
    const data = await fetchLeaderboard();
    renderLeaderboard(app, {
      leaderboard: data.leaderboard,
      onBack: () => navigate("dashboard"),
    });
  } catch (err) { showError(err.message); }
}

// =========================================================
// ACTIONS MÉTIER
// =========================================================
async function handleFirstBooster() {
  try {
    const result = await openBooster();
    localStorage.setItem("ac_user", JSON.stringify(result.user));
    setState({ currentUser: result.user });
    navigate("booster", result);
  } catch (err) { navigate("dashboard"); }
}

async function handleOpenBooster() {
  const btn = document.getElementById("btn-open-booster");
  btn.disabled = true; btn.textContent = "Ouverture...";
  try {
    const result = await openBooster();
    localStorage.setItem("ac_user", JSON.stringify(result.user));
    setState({ currentUser: result.user });
    navigate("booster", result);
  } catch (err) {
    showError(err.message);
    btn.disabled = false; btn.textContent = "Ouvrir un Booster";
  }
}

async function handleViewInventory() {
  try { navigate("inventory", await getInventory()); }
  catch (err) { showError(err.message); }
}

function handleLogout() {
  logout();
  disconnectSocket();
  localStorage.removeItem("ac_user");
  setState({ currentUser: null });
  document.body.classList.remove("home-mode");
  navigate("auth");
}

init();

// =========================================================
// SWIPER INTEGRATION — mise à jour des données dans les pages
// =========================================================

/**
 * Met à jour toutes les stats visibles dans le swiper
 * (appelé après chaque action qui change l'état du joueur)
 */
export function refreshSwiperUI(user) {
  if (!user) return;
  const winRate = user.stats.wins + user.stats.losses > 0
    ? Math.round((user.stats.wins / (user.stats.wins + user.stats.losses)) * 100) : 0;
  const expInLevel = user.exp % 100;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("sw-username", user.username);
  set("sw-coins", user.coins);
  set("sw-level", user.level);
  set("sw-exp-text", `${expInLevel} / 100`);
  set("sw-total-cards", user.inventory.length);
  set("sw-unlocked-cards", user.unlockedCards.length);
  set("sw-win-rate", winRate + "%");

  const fill = document.getElementById("sw-exp-fill");
  if (fill) fill.style.width = expInLevel + "%";

  // Sync pièces sur toutes les pages
  document.querySelectorAll(".sw-coins-sync").forEach(el => el.textContent = user.coins);
}

/**
 * Met à jour la grille d'inventaire dans le swiper (page 1)
 */
function refreshSwiperInventory(inventoryData) {
  const grid = document.getElementById("sw-inventory-grid");
  if (!grid) return;
  const { inventory } = inventoryData;

  if (inventory.length === 0) {
    grid.innerHTML = `<p class="empty-inventory">Ouvre un booster pour commencer !</p>`;
    return;
  }

  const TYPE_COLORS = {
    TERRESTRE: { bg: "#8B5E3C", accent: "#C4A265", emoji: "🦎" },
    AQUATIQUE: { bg: "#1A5276", accent: "#5DADE2", emoji: "🐠" },
    VEGETAL: { bg: "#1D6A39", accent: "#58D68D", emoji: "🌿" },
  };
  const RARITY = { COMMUNE: "★", RARE: "★★", LEGENDAIRE: "★★★" };

  grid.innerHTML = inventory.map(card => {
    const t = TYPE_COLORS[card.type] || TYPE_COLORS.TERRESTRE;
    return `
      <div class="inventory-card ${card.isUnlocked ? "unlocked" : "locked"}">
        <div class="inv-card-header" style="background:${t.bg}">
          <span>${t.emoji}</span><span>${RARITY[card.rarity] || "★"}</span>
        </div>
        <div class="inv-card-body">
          <div class="inv-card-name">${card.name}</div>
          <div class="inv-card-type">${card.type}</div>
          <div class="inv-card-status">${card.isUnlocked ? "✅ Déverrouillée" : "🔒 Verrouillée"}</div>
          ${!card.isUnlocked
            ? `<button class="btn-start-quiz" data-card-id="${card.id}" data-card-name="${card.name}">🧠 Lancer le Quiz</button>`
            : `<div class="card-ready-badge">⚔️ Prête au combat</div>`}
        </div>
      </div>`;
  }).join("");

  // Branche les boutons quiz de la grille swiper
  grid.querySelectorAll(".btn-start-quiz").forEach(btn => {
    btn.addEventListener("click", async () => {
      document.body.classList.remove("home-mode");
      await handleStartQuiz(btn.dataset.cardId, btn.dataset.cardName);
    });
  });
}

/**
 * Met à jour le leaderboard dans le swiper (page 3)
 */
async function refreshSwiperLeaderboard() {
  const container = document.getElementById("sw-leaderboard-content");
  if (!container) return;
  try {
    const data = await fetchLeaderboard();
    const lb = data.leaderboard;
    if (lb.length === 0) {
      container.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:2rem">Aucun joueur encore.</p>`;
      return;
    }
    container.innerHTML = `<div class="lb-list">` + lb.map((p, i) => `
      <div class="lb-row ${i < 3 ? "lb-top" : ""}">
        <span class="lb-rank">${["🥇","🥈","🥉"][i] || "#"+(i+1)}</span>
        <span class="lb-name">${p.username}</span>
        <span class="lb-level">Niv. ${p.level}</span>
        <span class="lb-wins">${p.wins}V/${p.losses}D</span>
        <span class="lb-wr">${p.winRate}%</span>
      </div>`).join("") + `</div>`;
  } catch (e) { container.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:1rem">Erreur de chargement.</p>`; }
}
