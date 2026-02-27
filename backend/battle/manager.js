const { initBattleState, resolveTurn, serializeState } = require("./engine");
const Store = require("../data/store");
const { sanitizeUser } = require("../routes/auth");

const matchmakingQueue = [];
const activeBattles = new Map();
const socketToBattle = new Map();

const WIN_REWARDS = { exp: 100, coins: 50 };
const LOSE_REWARDS = { exp: 20, coins: 10 };

function initBattleSocket(io) {
  io.on("connection", (socket) => {
    console.log(`[SOCKET] Connecte : ${socket.id}`);

    socket.on("battle:joinQueue", ({ userId, deck }) => {
      const user = Store.findUserById(userId);
      if (!user) return socket.emit("battle:error", { message: "Utilisateur introuvable." });

      const deckError = validateDeck(user, deck);
      if (deckError) return socket.emit("battle:error", { message: deckError });

      removeFromQueue(socket.id);

      const deckCards = deck.map((cardId) => Store.getCardById(cardId));
      matchmakingQueue.push({ socketId: socket.id, userId, username: user.username, deck: deckCards });

      console.log(`[QUEUE] ${user.username} rejoint la file (${matchmakingQueue.length} en attente)`);
      socket.emit("battle:inQueue", { position: matchmakingQueue.length });

      if (matchmakingQueue.length >= 2) {
        const p1 = matchmakingQueue.shift();
        const p2 = matchmakingQueue.shift();
        createBattle(io, p1, p2);
      }
    });

    socket.on("battle:invite", ({ fromUserId, toUsername, deck }) => {
      const fromUser = Store.findUserById(fromUserId);
      if (!fromUser) return socket.emit("battle:error", { message: "Utilisateur introuvable." });

      const deckError = validateDeck(fromUser, deck);
      if (deckError) return socket.emit("battle:error", { message: deckError });

      const toUser = Store.findUserByUsername(toUsername);
      if (!toUser) return socket.emit("battle:error", { message: `Joueur "${toUsername}" introuvable.` });

      const targetSocketId = findSocketByUserId(io, toUser.id);
      if (!targetSocketId) return socket.emit("battle:error", { message: `${toUsername} n'est pas connecte.` });

      io.to(targetSocketId).emit("battle:inviteReceived", {
        fromUsername: fromUser.username,
        fromUserId: fromUser.id,
        fromSocketId: socket.id,
      });

      socket.emit("battle:inviteSent", { toUsername });
    });

    socket.on("battle:inviteResponse", ({ accepted, fromSocketId, userId, deck }) => {
      const user = Store.findUserById(userId);
      if (!user) return;

      if (!accepted) {
        io.to(fromSocketId).emit("battle:inviteDeclined", { byUsername: user.username });
        return;
      }

      const deckError = validateDeck(user, deck);
      if (deckError) return socket.emit("battle:error", { message: deckError });

      const fromSocket = io.sockets.sockets.get(fromSocketId);
      if (!fromSocket) return socket.emit("battle:error", { message: "L'invitant s'est deconnecte." });

      const inviterData = fromSocket._pendingInvite;
      if (!inviterData) return socket.emit("battle:error", { message: "Invitation expiree." });

      const p1 = { socketId: fromSocketId, ...inviterData };
      const p2 = {
        socketId: socket.id,
        userId,
        username: user.username,
        deck: deck.map((id) => Store.getCardById(id)),
      };

      createBattle(io, p1, p2);
    });

    socket.on("battle:prepareInvite", ({ userId, deck }) => {
      const user = Store.findUserById(userId);
      if (!user) return;
      const deckError = validateDeck(user, deck);
      if (deckError) return socket.emit("battle:error", { message: deckError });

      socket._pendingInvite = {
        userId,
        username: user.username,
        deck: deck.map((id) => Store.getCardById(id)),
      };
      socket._userId = userId;
      socket.emit("battle:readyToInvite");
    });

    socket.on("battle:action", ({ battleId, userId }) => {
      const state = activeBattles.get(battleId);
      if (!state) return socket.emit("battle:error", { message: "Combat introuvable." });
      if (state.status !== "WAITING_FOR_ACTIONS") return;

      const playerKey = state.player1.userId === userId ? "player1" : "player2";
      if (state.pendingActions[playerKey]) return;

      state.pendingActions[playerKey] = "ATTACK";

      const room = `battle_${battleId}`;
      socket.to(room).emit("battle:opponentReady");

      const bothReady =
        state.pendingActions.player1 === "ATTACK" &&
        state.pendingActions.player2 === "ATTACK";

      if (bothReady) {
        state.status = "ROUND_RESOLVING";
        const { events, winner } = resolveTurn(state);

        io.to(room).emit("battle:turnResult", {
          events,
          state: serializeState(state),
        });

        if (winner) {
          handleBattleEnd(io, state, room);
        }
      }
    });

    socket.on("battle:leaveQueue", () => {
      removeFromQueue(socket.id);
      socket.emit("battle:leftQueue");
    });

    socket.on("disconnect", () => {
      console.log(`[SOCKET] Deconnecte : ${socket.id}`);
      removeFromQueue(socket.id);

      const battleId = socketToBattle.get(socket.id);
      if (battleId) {
        const state = activeBattles.get(battleId);
        if (state && state.status !== "FINISHED") {
          const winnerKey = state.player1.socketId === socket.id ? "player2" : "player1";
          state.winner = winnerKey;
          state.status = "FINISHED";

          const room = `battle_${battleId}`;
          io.to(room).emit("battle:opponentDisconnected", {
            winner: winnerKey,
            state: serializeState(state),
          });

          handleBattleEnd(io, state, room);
        }
        socketToBattle.delete(socket.id);
      }
    });
  });
}

function createBattle(io, p1, p2) {
  const state = initBattleState(p1, p2);
  activeBattles.set(state.id, state);

  state.player1.socketId = p1.socketId;
  state.player2.socketId = p2.socketId;

  socketToBattle.set(p1.socketId, state.id);
  socketToBattle.set(p2.socketId, state.id);

  const room = `battle_${state.id}`;
  io.sockets.sockets.get(p1.socketId)?.join(room);
  io.sockets.sockets.get(p2.socketId)?.join(room);

  console.log(`[BATTLE] ${p1.username} vs ${p2.username} (${state.id})`);

  io.to(room).emit("battle:start", {
    battleId: state.id,
    state: serializeState(state),
  });

  io.sockets.sockets.get(p1.socketId)?.emit("battle:yourRole", { role: "player1" });
  io.sockets.sockets.get(p2.socketId)?.emit("battle:yourRole", { role: "player2" });
}

function handleBattleEnd(io, state, room) {
  const winnerKey = state.winner;
  const loserKey = winnerKey === "player1" ? "player2" : "player1";

  const winnerUser = Store.findUserById(state[winnerKey].userId);
  const loserUser = Store.findUserById(state[loserKey].userId);

  if (winnerUser) {
    winnerUser.exp += WIN_REWARDS.exp;
    winnerUser.coins += WIN_REWARDS.coins;
    winnerUser.stats.wins++;
    const newLevel = Math.floor(winnerUser.exp / 100) + 1;
    if (newLevel > winnerUser.level) winnerUser.level = newLevel;
    Store.updateUser(winnerUser);
  }

  if (loserUser) {
    loserUser.exp += LOSE_REWARDS.exp;
    loserUser.coins += LOSE_REWARDS.coins;
    loserUser.stats.losses++;
    Store.updateUser(loserUser);
  }

  io.to(room).emit("battle:end", {
    winner: winnerKey,
    winnerUsername: state[winnerKey].username,
    rewards: { winner: WIN_REWARDS, loser: LOSE_REWARDS },
  });

  setTimeout(() => {
    activeBattles.delete(state.id);
    socketToBattle.delete(state.player1.socketId);
    socketToBattle.delete(state.player2.socketId);
  }, 30000);
}

function validateDeck(user, deck) {
  if (!Array.isArray(deck) || deck.length !== 3)
    return "Le deck doit contenir exactement 3 cartes.";
  for (const cardId of deck) {
    if (!user.inventory.includes(cardId))
      return `Tu ne possedes pas la carte ${cardId}.`;
    if (!user.unlockedCards.includes(cardId))
      return `La carte ${cardId} n'est pas deverrouillee.`;
  }
  return null;
}

function removeFromQueue(socketId) {
  const idx = matchmakingQueue.findIndex((p) => p.socketId === socketId);
  if (idx !== -1) matchmakingQueue.splice(idx, 1);
}

function findSocketByUserId(io, userId) {
  for (const [socketId, socket] of io.sockets.sockets) {
    if (socket._userId === userId) return socketId;
  }
  return null;
}

function getLeaderboard() {
  return Store.getAllUsers()
    .map((u) => ({
      username: u.username,
      level: u.level,
      wins: u.stats.wins,
      losses: u.stats.losses,
      winRate: u.stats.wins + u.stats.losses > 0
        ? Math.round((u.stats.wins / (u.stats.wins + u.stats.losses)) * 100)
        : 0,
    }))
    .sort((a, b) => b.level - a.level || b.wins - a.wins)
    .slice(0, 50);
}

module.exports = { initBattleSocket, getLeaderboard };