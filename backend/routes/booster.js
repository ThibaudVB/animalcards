/**
 * ROUTES/BOOSTER.JS — Ouverture de boosters
 * POST /api/booster/open  → Ouvre un booster et ajoute la carte (verrouillée) à l'inventaire
 * GET  /api/booster/inventory → Récupère l'inventaire complet du joueur
 */

const express = require("express");
const router = express.Router();
const Store = require("../data/store");
const authMiddleware = require("../middleware/auth");
const { sanitizeUser } = require("./auth");

// Récompenses par ouverture de booster
const BOOSTER_REWARDS = {
  exp: 20,
  coins: 15,
};

// POST /api/booster/open
// Corps attendu : {} (pas de paramètre pour l'instant)
router.post("/open", authMiddleware, (req, res) => {
  const user = req.user;

  try {
    // 1. Tirage aléatoire d'une carte du catalogue
    const drawnCard = Store.getRandomCard();

    // 2. Ajout de la carte à l'inventaire (verrouillée par défaut)
    //    On autorise les doublons — comme dans les vrais TCG
    user.inventory.push(drawnCard.id);

    // 3. Récompenses (EXP + pièces)
    user.exp += BOOSTER_REWARDS.exp;
    user.coins += BOOSTER_REWARDS.coins;

    // 4. Calcul du level up (formule simple : 100 EXP par niveau)
    const newLevel = Math.floor(user.exp / 100) + 1;
    const leveledUp = newLevel > user.level;
    if (leveledUp) {
      user.level = newLevel;
    }

    // 5. Marquer le tutoriel comme vu si c'est le 1er booster
    const isFirstBooster = user.inventory.length === 1;
    if (isFirstBooster) {
      user.hasSeenTutorial = true;
    }

    // 6. Sauvegarde
    Store.updateUser(user);

    console.log(
      `[BOOSTER] ${user.username} a ouvert un booster → ${drawnCard.name} (${drawnCard.rarity})`
    );

    return res.json({
      message: isFirstBooster
        ? `Félicitations ! Voici ta première carte : ${drawnCard.name} !`
        : `Booster ouvert ! Tu as obtenu : ${drawnCard.name} !`,
      drawnCard,
      rewards: {
        exp: BOOSTER_REWARDS.exp,
        coins: BOOSTER_REWARDS.coins,
        leveledUp,
        newLevel: user.level,
      },
      isFirstBooster,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("[BOOSTER] Erreur:", err);
    return res.status(500).json({ error: "Erreur lors de l'ouverture du booster." });
  }
});

// GET /api/booster/inventory
// Retourne les cartes de l'inventaire avec leurs détails complets
router.get("/inventory", authMiddleware, (req, res) => {
  const user = req.user;

  // Dédoublonnage pour l'affichage (on sait combien on en a via inventory.length)
  const cardDetails = user.inventory.map((cardId) => {
    const card = Store.getCardById(cardId);
    return {
      ...card,
      isUnlocked: user.unlockedCards.includes(cardId),
    };
  });

  return res.json({
    inventory: cardDetails,
    totalCards: cardDetails.length,
    unlockedCount: user.unlockedCards.length,
  });
});

module.exports = router;
