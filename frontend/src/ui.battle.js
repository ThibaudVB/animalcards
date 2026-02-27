const TYPE_COLORS = {
  TERRESTRE: { bg: "#8B5E3C", accent: "#C4A265", emoji: "🦎" },
  AQUATIQUE: { bg: "#1A5276", accent: "#5DADE2", emoji: "🐠" },
  VEGETAL: { bg: "#1D6A39", accent: "#58D68D", emoji: "🌿" },
};

export function renderDeckSelector(container, { unlockedCards, onConfirm, onBack }) {
  let selected = [];

  const render = () => {
    container.innerHTML = `
      <div class="deck-selector">
        <div class="deck-header">
          <button class="btn-back" id="deck-btn-back">← Retour</button>
          <h2 class="deck-title">Choisir son Deck</h2>
          <span class="deck-count">${selected.length}/3</span>
        </div>
        <p class="deck-subtitle">Selectionne 3 cartes deverrouilees pour combattre</p>
        <div class="deck-grid">
          ${unlockedCards.length === 0
            ? `<p class="empty-inventory" style="grid-column:1/-1">Aucune carte deverrouillee.<br/>Complete des quiz d'abord !</p>`
            : unlockedCards.map((card) => {
                const t = TYPE_COLORS[card.type] || TYPE_COLORS.TERRESTRE;
                const isSelected = selected.includes(card.id);
                return `
                  <div class="deck-card ${isSelected ? "deck-card-selected" : ""}" data-card-id="${card.id}">
                    <div class="deck-card-top" style="background:${t.bg}">
                      <span>${t.emoji}</span>
                      ${isSelected ? `<span class="deck-check">✓</span>` : ""}
                    </div>
                    <div class="deck-card-info">
                      <div class="deck-card-name">${card.name}</div>
                      <div class="deck-card-type">${card.type}</div>
                      <div class="deck-mini-stats">⚡${card.stats.vitesse} ⚔️${card.stats.attaque} 🛡️${card.stats.defense}</div>
                    </div>
                  </div>
                `;
              }).join("")
          }
        </div>
        <div class="deck-actions">
          <div class="deck-selected-preview">
            ${selected.map((id) => {
              const card = unlockedCards.find((c) => c.id === id);
              const t = TYPE_COLORS[card?.type] || TYPE_COLORS.TERRESTRE;
              return `<div class="deck-preview-slot" style="border-color:${t.accent}">${t.emoji} ${card?.name}</div>`;
            }).join("")}
            ${Array(3 - selected.length).fill(0).map(() =>
              `<div class="deck-preview-slot empty">— vide —</div>`
            ).join("")}
          </div>
          <div class="deck-mode-buttons">
            <button class="btn-queue ${selected.length !== 3 ? "disabled" : ""}"
                    id="btn-join-queue" ${selected.length !== 3 ? "disabled" : ""}>
              🎯 Matchmaking
            </button>
            <button class="btn-invite ${selected.length !== 3 ? "disabled" : ""}"
                    id="btn-invite-player" ${selected.length !== 3 ? "disabled" : ""}>
              📨 Inviter un joueur
            </button>
          </div>
        </div>
      </div>
    `;

    container.querySelectorAll(".deck-card").forEach((el) => {
      el.addEventListener("click", () => {
        const cardId = el.dataset.cardId;
        if (selected.includes(cardId)) {
          selected = selected.filter((id) => id !== cardId);
        } else if (selected.length < 3) {
          selected.push(cardId);
        }
        render();
      });
    });

    document.getElementById("deck-btn-back")?.addEventListener("click", onBack);

    document.getElementById("btn-join-queue")?.addEventListener("click", () => {
      if (selected.length === 3) onConfirm("queue", selected);
    });

    document.getElementById("btn-invite-player")?.addEventListener("click", () => {
      if (selected.length === 3) {
        const username = prompt("Nom du joueur a inviter :");
        if (username?.trim()) onConfirm("invite", selected, username.trim());
      }
    });
  };

  render();
}

export function renderWaitingRoom(container, { onCancel }) {
  container.innerHTML = `
    <div class="waiting-room">
      <div class="waiting-spinner">⚔️</div>
      <h2 class="waiting-title">Recherche d'un adversaire…</h2>
      <p class="waiting-sub">En attente dans la file de matchmaking</p>
      <div class="waiting-dots"><span>.</span><span>.</span><span>.</span></div>
      <button class="btn-cancel-queue" id="btn-cancel-queue">Annuler</button>
    </div>
  `;
  document.getElementById("btn-cancel-queue").addEventListener("click", onCancel);
}

export function renderBattleView(container, { state, myRole, onAttack }) {
  const me = state[myRole];
  const opponentRole = myRole === "player1" ? "player2" : "player1";
  const opponent = state[opponentRole];
  const myActive = me.deck[me.activeCardIndex];
  const opActive = opponent.deck[opponent.activeCardIndex];

  container.innerHTML = `
    <div class="battle-screen">
      <div class="battle-side opponent-side">
        <div class="battle-player-label">
          <span class="battle-username">${opponent.username}</span>
          <span class="battle-cards-left">${opponent.deck.filter(c => !c.isDefeated).length} cartes restantes</span>
        </div>
        ${renderCombatCard(opActive, false)}
      </div>
      <div class="battle-middle">
        <div class="battle-turn-badge">Tour ${state.turn}</div>
        <div class="vs-label">⚔️</div>
      </div>
      <div class="battle-side player-side">
        ${renderCombatCard(myActive, true)}
        <div class="battle-player-label">
          <span class="battle-username">Toi</span>
          <div class="battle-deck-mini">
            ${me.deck.map((c, i) => `
              <div class="deck-dot ${c.isDefeated ? "dot-dead" : i === me.activeCardIndex ? "dot-active" : "dot-alive"}"></div>
            `).join("")}
          </div>
        </div>
      </div>
      <div class="battle-log" id="battle-log">
        <p class="log-placeholder">Le combat commence...</p>
      </div>
      <button class="btn-attack" id="btn-attack">⚔️ Attaquer !</button>
    </div>
  `;

  document.getElementById("btn-attack").addEventListener("click", onAttack);
}

function renderCombatCard(card, isPlayer) {
  const t = TYPE_COLORS[card.type] || TYPE_COLORS.TERRESTRE;
  const hpPercent = Math.round((card.currentHp / card.maxHp) * 100);
  const hpColor = hpPercent > 50 ? "var(--accent-green)" : hpPercent > 25 ? "var(--accent-gold)" : "var(--danger)";

  return `
    <div class="combat-card ${isPlayer ? "combat-card-player" : "combat-card-opponent"}">
      <div class="combat-card-header" style="background:${t.bg}">
        <span class="combat-card-emoji">${t.emoji}</span>
        <span class="combat-card-name">${card.name}</span>
        <span class="combat-card-type">${card.type}</span>
      </div>
      <div class="combat-card-body">
        <div class="hp-row">
          <span class="hp-label">HP</span>
          <div class="hp-bar">
            <div class="hp-fill" style="width:${hpPercent}%; background:${hpColor}"></div>
          </div>
          <span class="hp-value">${card.currentHp}/${card.maxHp}</span>
        </div>
        <div class="combat-stats">
          <span>⚡ ${card.stats.vitesse}</span>
          <span>⚔️ ${card.stats.attaque}</span>
          <span>🛡️ ${card.stats.defense}</span>
        </div>
      </div>
    </div>
  `;
}

export function updateBattleLog(events, myRole) {
  const log = document.getElementById("battle-log");
  if (!log) return;
  log.querySelector(".log-placeholder")?.remove();

  events.forEach((event) => {
    const el = document.createElement("p");
    el.classList.add("log-entry");

    if (event.type === "ATTACK") {
      const isMe = event.attacker === myRole;
      const effectText = { WEAKNESS: " 🔥 Super efficace !", RESISTANCE: " 💨 Pas tres efficace…", NORMAL: "" }[event.effectiveness] || "";
      el.textContent = isMe
        ? `Toi → ${event.defenderCard} : -${event.damage} HP${effectText}`
        : `${event.attackerCard} → Toi : -${event.damage} HP${effectText}`;
      el.style.color = isMe ? "var(--accent-green)" : "var(--danger)";
    } else if (event.type === "CARD_DEFEATED") {
      el.textContent = `💀 ${event.card} est KO !`;
      el.style.color = "var(--text-secondary)";
    } else if (event.type === "NEXT_CARD") {
      el.textContent = `➡️ ${event.card} entre en jeu !`;
    }

    if (el.textContent) log.prepend(el);
  });
}

export function renderBattleEnd(container, { winner, myRole, winnerUsername, rewards, onBack }) {
  const isWinner = winner === myRole;
  const myRewards = isWinner ? rewards.winner : rewards.loser;

  container.innerHTML = `
    <div class="battle-end-screen">
      <div class="battle-end-icon">${isWinner ? "🏆" : "💀"}</div>
      <h1 class="battle-end-title ${isWinner ? "win" : "lose"}">${isWinner ? "Victoire !" : "Defaite…"}</h1>
      <p class="battle-end-sub">
        ${isWinner ? "Tu as ecrase ton adversaire !" : `${winnerUsername} a gagne le combat.`}
      </p>
      <div class="rewards-banner">
        <div class="reward-item">
          <span class="reward-value">+${myRewards.exp}</span>
          <span class="reward-label">EXP</span>
        </div>
        <div class="reward-item">
          <span class="reward-value">+${myRewards.coins}</span>
          <span class="reward-label">🪙</span>
        </div>
      </div>
      <button class="btn-primary" id="btn-back-after-battle">Retour au menu</button>
    </div>
  `;

  document.getElementById("btn-back-after-battle").addEventListener("click", onBack);
}

export function renderLeaderboard(container, { leaderboard, onBack }) {
  container.innerHTML = `
    <div class="leaderboard-screen">
      <div class="lb-header">
        <button class="btn-back" id="lb-btn-back">← Retour</button>
        <h2>Classement</h2>
      </div>
      <div class="lb-list">
        ${leaderboard.length === 0
          ? `<p style="text-align:center;color:var(--text-secondary);padding:2rem">Aucun joueur pour l'instant.</p>`
          : leaderboard.map((p, i) => `
            <div class="lb-row ${i < 3 ? "lb-top" : ""}">
              <span class="lb-rank">${["🥇","🥈","🥉"][i] || "#" + (i+1)}</span>
              <span class="lb-name">${p.username}</span>
              <span class="lb-level">Niv. ${p.level}</span>
              <span class="lb-wins">${p.wins}V / ${p.losses}D</span>
              <span class="lb-wr">${p.winRate}%</span>
            </div>
          `).join("")
        }
      </div>
    </div>
  `;
  document.getElementById("lb-btn-back").addEventListener("click", onBack);
}

export function showInviteNotification(container, { fromUsername, fromSocketId, onAccept, onDecline }) {
  document.getElementById("invite-notif")?.remove();
  const notif = document.createElement("div");
  notif.className = "invite-notif";
  notif.id = "invite-notif";
  notif.innerHTML = `
    <div class="invite-notif-inner">
      <span>⚔️ <strong>${fromUsername}</strong> te defie !</span>
      <div>
        <button class="btn-accept-invite" id="btn-accept-invite">Accepter</button>
        <button class="btn-decline-invite" id="btn-decline-invite">Refuser</button>
      </div>
    </div>
  `;
  document.body.appendChild(notif);

  document.getElementById("btn-accept-invite").addEventListener("click", () => {
    notif.remove();
    onAccept(fromSocketId);
  });
  document.getElementById("btn-decline-invite").addEventListener("click", () => {
    notif.remove();
    onDecline(fromSocketId);
  });
}