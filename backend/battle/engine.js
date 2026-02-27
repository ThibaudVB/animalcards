const WEAKNESS_TABLE = {
  TERRESTRE: "AQUATIQUE",
  AQUATIQUE: "VEGETAL",
  VEGETAL: "TERRESTRE",
};

const DAMAGE_MULTIPLIERS = {
  WEAKNESS: 1.5,
  RESISTANCE: 0.75,
  NORMAL: 1.0,
};

function calculateMaxHp(card) {
  return card.stats.defense * 2 + 20;
}

function calculateDamage(attacker, defender) {
  const baseDamage = attacker.stats.attaque;
  const defenderType = defender.type;
  const attackerType = attacker.type;

  let multiplier = DAMAGE_MULTIPLIERS.NORMAL;
  let effectiveness = "NORMAL";

  if (WEAKNESS_TABLE[attackerType] === defenderType) {
    multiplier = DAMAGE_MULTIPLIERS.WEAKNESS;
    effectiveness = "WEAKNESS";
  } else if (WEAKNESS_TABLE[defenderType] === attackerType) {
    multiplier = DAMAGE_MULTIPLIERS.RESISTANCE;
    effectiveness = "RESISTANCE";
  }

  const defenseReduction = Math.floor(defender.stats.defense * 0.1);
  const finalDamage = Math.max(1, Math.floor(baseDamage * multiplier) - defenseReduction);

  return { damage: finalDamage, effectiveness };
}

function getFirstAttacker(card1, card2) {
  if (card1.stats.vitesse > card2.stats.vitesse) return "player1";
  if (card2.stats.vitesse > card1.stats.vitesse) return "player2";
  return Math.random() < 0.5 ? "player1" : "player2";
}

function initBattleState(player1, player2) {
  const buildCombatDeck = (deck) =>
    deck.map((card) => ({
      ...card,
      maxHp: calculateMaxHp(card),
      currentHp: calculateMaxHp(card),
      isDefeated: false,
    }));

  return {
    id: `battle_${Date.now()}`,
    status: "WAITING_FOR_ACTIONS",
    turn: 1,
    player1: {
      userId: player1.userId,
      username: player1.username,
      deck: buildCombatDeck(player1.deck),
      activeCardIndex: 0,
    },
    player2: {
      userId: player2.userId,
      username: player2.username,
      deck: buildCombatDeck(player2.deck),
      activeCardIndex: 0,
    },
    pendingActions: {},
    log: [],
    winner: null,
  };
}

function resolveTurn(state) {
  const p1 = state.player1;
  const p2 = state.player2;
  const card1 = p1.deck[p1.activeCardIndex];
  const card2 = p2.deck[p2.activeCardIndex];
  const events = [];

  const firstAttacker = getFirstAttacker(card1, card2);
  const [first, second] = firstAttacker === "player1" ? [p1, p2] : [p2, p1];
  const [firstCard, secondCard] = firstAttacker === "player1" ? [card1, card2] : [card2, card1];
  const [firstKey, secondKey] = firstAttacker === "player1" ? ["player1", "player2"] : ["player2", "player1"];

  const hit1 = calculateDamage(firstCard, secondCard);
  secondCard.currentHp = Math.max(0, secondCard.currentHp - hit1.damage);

  events.push({
    type: "ATTACK",
    attacker: firstKey,
    attackerCard: firstCard.name,
    defenderCard: secondCard.name,
    damage: hit1.damage,
    effectiveness: hit1.effectiveness,
    remainingHp: secondCard.currentHp,
  });

  if (secondCard.currentHp <= 0) {
    secondCard.isDefeated = true;
    events.push({ type: "CARD_DEFEATED", player: secondKey, card: secondCard.name });

    const nextIndex = getNextAliveCard(second.deck, second.activeCardIndex);
    if (nextIndex !== -1) {
      second.activeCardIndex = nextIndex;
      events.push({ type: "NEXT_CARD", player: secondKey, card: second.deck[nextIndex].name });
    } else {
      state.winner = firstKey;
      state.status = "FINISHED";
      events.push({ type: "BATTLE_END", winner: firstKey });
      state.log.push(...events);
      return { events, winner: firstKey };
    }
  }

  if (!secondCard.isDefeated) {
    const currentSecondCard = second.deck[second.activeCardIndex];
    const hit2 = calculateDamage(currentSecondCard, firstCard);
    firstCard.currentHp = Math.max(0, firstCard.currentHp - hit2.damage);

    events.push({
      type: "ATTACK",
      attacker: secondKey,
      attackerCard: currentSecondCard.name,
      defenderCard: firstCard.name,
      damage: hit2.damage,
      effectiveness: hit2.effectiveness,
      remainingHp: firstCard.currentHp,
    });

    if (firstCard.currentHp <= 0) {
      firstCard.isDefeated = true;
      events.push({ type: "CARD_DEFEATED", player: firstKey, card: firstCard.name });

      const nextIndex = getNextAliveCard(first.deck, first.activeCardIndex);
      if (nextIndex !== -1) {
        first.activeCardIndex = nextIndex;
        events.push({ type: "NEXT_CARD", player: firstKey, card: first.deck[nextIndex].name });
      } else {
        state.winner = secondKey;
        state.status = "FINISHED";
        events.push({ type: "BATTLE_END", winner: secondKey });
        state.log.push(...events);
        return { events, winner: secondKey };
      }
    }
  }

  state.turn++;
  state.status = "WAITING_FOR_ACTIONS";
  state.pendingActions = {};
  state.log.push(...events);

  return { events, winner: null };
}

function getNextAliveCard(deck, currentIndex) {
  for (let i = currentIndex + 1; i < deck.length; i++) {
    if (!deck[i].isDefeated) return i;
  }
  return -1;
}

function serializeState(state) {
  return {
    battleId: state.id,
    status: state.status,
    turn: state.turn,
    winner: state.winner,
    player1: {
      username: state.player1.username,
      activeCardIndex: state.player1.activeCardIndex,
      deck: state.player1.deck.map((c) => ({
        id: c.id, name: c.name, type: c.type,
        maxHp: c.maxHp, currentHp: c.currentHp, isDefeated: c.isDefeated,
        stats: c.stats,
      })),
    },
    player2: {
      username: state.player2.username,
      activeCardIndex: state.player2.activeCardIndex,
      deck: state.player2.deck.map((c) => ({
        id: c.id, name: c.name, type: c.type,
        maxHp: c.maxHp, currentHp: c.currentHp, isDefeated: c.isDefeated,
        stats: c.stats,
      })),
    },
  };
}

module.exports = { initBattleState, resolveTurn, serializeState, calculateMaxHp };