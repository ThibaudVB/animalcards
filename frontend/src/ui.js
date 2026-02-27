const TYPE_COLORS = {
  TERRESTRE: { bg: "#8B5E3C", accent: "#C4A265", emoji: "🦎" },
  AQUATIQUE: { bg: "#1A5276", accent: "#5DADE2", emoji: "🐠" },
  VEGETAL: { bg: "#1D6A39", accent: "#58D68D", emoji: "🌿" },
};

const RARITY_STYLES = {
  COMMUNE: { label: "Commune", color: "#AAB7B8", stars: "★" },
  RARE: { label: "Rare", color: "#3498DB", stars: "★★" },
  LEGENDAIRE: { label: "Legendaire", color: "#F39C12", stars: "★★★" },
};

// Dans ton fichier ui.js

export function renderAuthView(appElement) {
  appElement.innerHTML = `
    <div class="auth-screen">
      <div class="auth-logo">
        <span class="logo-icon">🌍</span>
        <h1 class="logo-title">AnimalCards</h1>
        <p class="logo-subtitle">Collectionne, apprends et combats !</p>
      </div>

      <div class="auth-card">
        <div class="auth-tabs">
          <button class="tab-btn active" data-tab="login">Connexion</button>
          <button class="tab-btn" data-tab="register">Inscription</button>
        </div>

        <form id="auth-form" class="auth-form">
          <div class="form-group">
            <label for="username">Pseudo</label>
            <input type="text" id="username" placeholder="Ton nom de dresseur" required />
          </div>
          <div class="form-group">
            <label for="password">Mot de passe</label>
            <input type="password" id="password" placeholder="Mot de passe" required />
          </div>
          <button type="submit" id="auth-submit-btn" class="btn-primary">Se connecter</button>
        </form>
      </div>
    </div>
  `;
}

export function renderDashboardView(container, user) {
  const winRate = user.stats.wins + user.stats.losses > 0
    ? Math.round((user.stats.wins / (user.stats.wins + user.stats.losses)) * 100)
    : 0;
  const currentLevelExp = user.exp % 100;
  const expPercent = Math.round((currentLevelExp / 100) * 100);

  container.innerHTML = `
    <div class="dashboard">
      <header class="dashboard-header">
        <div class="player-info">
          <div class="player-avatar">${user.username[0].toUpperCase()}</div>
          <div class="player-details">
            <h2 class="player-name">${user.username}</h2>
            <span class="player-level">Niveau ${user.level}</span>
          </div>
        </div>
        <div class="player-coins">
          <span class="coin-icon">🪙</span>
          <span class="coin-count">${user.coins}</span>
        </div>
      </header>
      <div class="exp-bar-container">
        <div class="exp-bar">
          <div class="exp-bar-fill" style="width: ${expPercent}%"></div>
        </div>
        <span class="exp-label">${currentLevelExp} / 100 EXP</span>
      </div>
      <div class="stats-row">
        <div class="stat-chip">
          <span class="stat-value">${user.inventory.length}</span>
          <span class="stat-label">Cartes</span>
        </div>
        <div class="stat-chip">
          <span class="stat-value">${user.unlockedCards.length}</span>
          <span class="stat-label">Deverr.</span>
        </div>
        <div class="stat-chip">
          <span class="stat-value">${winRate}%</span>
          <span class="stat-label">Win rate</span>
        </div>
      </div>
      <div class="action-buttons">
        <button class="btn-action btn-battle" id="btn-battle">
          <span class="btn-icon">⚔️</span>
          Mode Combat
        </button>
        <button class="btn-action btn-booster" id="btn-open-booster">
          <span class="btn-icon">📦</span>
          Ouvrir un Booster
        </button>
        <button class="btn-action btn-inventory" id="btn-view-inventory">
          <span class="btn-icon">🃏</span>
          Mon Inventaire (${user.inventory.length})
        </button>
        <button class="btn-action btn-leaderboard" id="btn-leaderboard">
          <span class="btn-icon">🏆</span>
          Classement
        </button>
      </div>
      <button class="btn-logout" id="btn-logout">Deconnexion</button>
    </div>
  `;
}

export function renderBoosterOpeningView(container, result) {
  const { drawnCard, rewards, isFirstBooster } = result;
  const typeStyle = TYPE_COLORS[drawnCard.type] || TYPE_COLORS.TERRESTRE;
  const rarityStyle = RARITY_STYLES[drawnCard.rarity] || RARITY_STYLES.COMMUNE;

  container.innerHTML = `
    <div class="booster-opening">
      ${isFirstBooster ? `<div class="first-booster-badge">🎉 Premier Booster !</div>` : ""}
      <p class="booster-intro">Tu as obtenu...</p>
      <div class="card-reveal" style="--card-bg: ${typeStyle.bg}; --card-accent: ${typeStyle.accent}">
        <div class="card-inner">
          <div class="card-header">
            <span class="card-type-emoji">${typeStyle.emoji}</span>
            <span class="card-type-label">${drawnCard.type}</span>
            <span class="card-rarity" style="color: ${rarityStyle.color}">${rarityStyle.stars}</span>
          </div>
          <div class="card-name">${drawnCard.name}</div>
          <div class="card-image-placeholder">
            <span class="card-placeholder-emoji">${typeStyle.emoji}</span>
          </div>
          <p class="card-description">${drawnCard.description}</p>
          <div class="card-stats">
            <div class="stat-row">
              <span class="stat-icon">⚡</span>
              <span class="stat-name">Vitesse</span>
              <div class="stat-bar"><div class="stat-bar-fill" style="width: ${drawnCard.stats.vitesse}%; background: ${typeStyle.accent}"></div></div>
              <span class="stat-val">${drawnCard.stats.vitesse}</span>
            </div>
            <div class="stat-row">
              <span class="stat-icon">⚔️</span>
              <span class="stat-name">Attaque</span>
              <div class="stat-bar"><div class="stat-bar-fill" style="width: ${drawnCard.stats.attaque}%; background: ${typeStyle.accent}"></div></div>
              <span class="stat-val">${drawnCard.stats.attaque}</span>
            </div>
            <div class="stat-row">
              <span class="stat-icon">🛡️</span>
              <span class="stat-name">Defense</span>
              <div class="stat-bar"><div class="stat-bar-fill" style="width: ${drawnCard.stats.defense}%; background: ${typeStyle.accent}"></div></div>
              <span class="stat-val">${drawnCard.stats.defense}</span>
            </div>
          </div>
          <div class="card-lock-badge">🔒 Verrouillee — Complete le Quiz pour debloquer</div>
        </div>
      </div>
      <div class="rewards-banner">
        <span>+${rewards.exp} EXP</span>
        <span>+${rewards.coins} 🪙</span>
        ${rewards.leveledUp ? `<span class="level-up-badge">⬆️ Niveau ${rewards.newLevel} !</span>` : ""}
      </div>
      <button class="btn-primary" id="btn-back-dashboard">Retour au tableau de bord</button>
    </div>
  `;
}

export function renderInventoryView(container, inventoryData) {
  const { inventory } = inventoryData;

  const cardListHTML = inventory.length === 0
    ? `<p class="empty-inventory">Ton inventaire est vide. Ouvre un booster !</p>`
    : inventory.map((card) => {
        const typeStyle = TYPE_COLORS[card.type] || TYPE_COLORS.TERRESTRE;
        const rarityStyle = RARITY_STYLES[card.rarity] || RARITY_STYLES.COMMUNE;
        return `
          <div class="inventory-card ${card.isUnlocked ? "unlocked" : "locked"}">
            <div class="inv-card-header" style="background: ${typeStyle.bg}">
              <span>${typeStyle.emoji}</span>
              <span style="color: ${rarityStyle.color}">${rarityStyle.stars}</span>
            </div>
            <div class="inv-card-body">
              <div class="inv-card-name">${card.name}</div>
              <div class="inv-card-type">${card.type}</div>
              <div class="inv-card-status">
                ${card.isUnlocked ? "✅ Deverrouillee" : "🔒 Verrouillee"}
              </div>
              ${!card.isUnlocked
                ? `<button class="btn-start-quiz" data-card-id="${card.id}" data-card-name="${card.name}">🧠 Lancer le Quiz</button>`
                : `<div class="card-ready-badge">⚔️ Prete au combat</div>`
              }
            </div>
          </div>
        `;
      }).join("");

  container.innerHTML = `
    <div class="inventory-screen">
      <div class="inventory-header">
        <button class="btn-back" id="btn-back-dashboard">← Retour</button>
        <h2>Mon Inventaire</h2>
        <span class="inv-count">${inventory.length} carte${inventory.length > 1 ? "s" : ""}</span>
      </div>
      <div class="inventory-grid">${cardListHTML}</div>
    </div>
  `;
}

export function showError(message) {
  const banner = document.getElementById("error-banner");
  if (banner) {
    banner.textContent = message;
    banner.classList.remove("hidden");
    setTimeout(() => banner.classList.add("hidden"), 4000);
  }
}