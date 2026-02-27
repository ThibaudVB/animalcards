const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] },
});

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

const authRoutes = require("./routes/auth");
const boosterRoutes = require("./routes/booster");
const quizRoutes = require("./routes/quiz");
const { initBattleSocket, getLeaderboard } = require("./battle/manager");

app.use("/api/auth", authRoutes);
app.use("/api/booster", boosterRoutes);
app.use("/api/quiz", quizRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/leaderboard", (_req, res) => {
  res.json({ leaderboard: getLeaderboard() });
});

initBattleSocket(io);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`\nAnimalCards Server sur http://localhost:${PORT}`);
  console.log(`  API REST   -> http://localhost:${PORT}/api`);
  console.log(`  Socket.IO  -> ws://localhost:${PORT}\n`);
});

module.exports = { app, io };