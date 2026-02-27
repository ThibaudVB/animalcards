import { Auth } from "./api.js";

let socket = null;
const listeners = {};

export function connectSocket() {
  if (socket && socket.connected) return socket;

  socket = window.io("http://localhost:3000");

  socket.on("connect", () => {
    console.log("[SOCKET] Connecte :", socket.id);
    const user = JSON.parse(localStorage.getItem("ac_user") || "null");
    if (user) socket._userId = user.id;
  });

  socket.on("disconnect", () => console.log("[SOCKET] Deconnecte"));

  const events = [
    "battle:inQueue", "battle:start", "battle:yourRole", "battle:turnResult",
    "battle:end", "battle:opponentReady", "battle:opponentDisconnected",
    "battle:inviteReceived", "battle:inviteSent", "battle:inviteDeclined",
    "battle:readyToInvite", "battle:leftQueue", "battle:error",
  ];

  events.forEach((event) => {
    socket.on(event, (data) => {
      console.log(`[SOCKET] ${event}`, data);
      if (listeners[event]) listeners[event].forEach((cb) => cb(data));
    });
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}

export function onBattleEvent(event, callback) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(callback);
  return () => {
    listeners[event] = listeners[event].filter((cb) => cb !== callback);
  };
}

export function offAllBattleEvents() {
  Object.keys(listeners).forEach((k) => (listeners[k] = []));
}

export function joinQueue(userId, deck) {
  ensureConnected();
  socket.emit("battle:joinQueue", { userId, deck });
}

export function leaveQueue() {
  ensureConnected();
  socket.emit("battle:leaveQueue");
}

export function prepareInvite(userId, deck) {
  ensureConnected();
  socket.emit("battle:prepareInvite", { userId, deck });
}

export function sendInvite(fromUserId, toUsername, deck) {
  ensureConnected();
  socket.emit("battle:invite", { fromUserId, toUsername, deck });
}

export function respondToInvite(accepted, fromSocketId, userId, deck) {
  ensureConnected();
  socket.emit("battle:inviteResponse", { accepted, fromSocketId, userId, deck });
}

export function sendAction(battleId, userId) {
  ensureConnected();
  socket.emit("battle:action", { battleId, userId });
}

function ensureConnected() {
  if (!socket || !socket.connected) connectSocket();
}

export async function fetchLeaderboard() {
  const res = await fetch("http://localhost:3000/api/leaderboard");
  return res.json();
}