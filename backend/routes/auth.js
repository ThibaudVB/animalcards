/**
 * ROUTES/AUTH.JS — Inscription & Connexion
 * POST /api/auth/register
 * POST /api/auth/login
 */

const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Store = require("../data/store");

const JWT_SECRET = process.env.JWT_SECRET || "animalcards_dev_secret";
const SALT_ROUNDS = 10;

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function createNewUser(username, passwordHash) {
  return {
    id: uuidv4(),
    username,
    passwordHash,
    createdAt: new Date().toISOString(),
    level: 1,
    exp: 0,
    coins: 50,
    hasSeenTutorial: false,
    inventory: [],
    unlockedCards: [],
    stats: { wins: 0, losses: 0 },
  };
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: "Username et password requis." });
    if (username.length < 3 || username.length > 20)
      return res.status(400).json({ error: "Username : 3 à 20 caractères." });
    if (password.length < 6)
      return res.status(400).json({ error: "Password : 6 caractères minimum." });
    if (Store.findUserByUsername(username))
      return res.status(409).json({ error: "Ce username est déjà pris." });

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = createNewUser(username, passwordHash);
    Store.createUser(user);
    const token = generateToken(user);

    console.log(`[AUTH] Nouvel utilisateur créé : ${username}`);
    return res.status(201).json({ message: "Compte créé !", token, user: sanitizeUser(user) });
  } catch (err) {
    console.error("[AUTH] Erreur register:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: "Username et password requis." });

    const user = Store.findUserByUsername(username);
    if (!user)
      return res.status(401).json({ error: "Identifiants incorrects." });

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch)
      return res.status(401).json({ error: "Identifiants incorrects." });

    const token = generateToken(user);
    console.log(`[AUTH] Connexion : ${username}`);
    return res.json({ message: `Bienvenue, ${user.username} !`, token, user: sanitizeUser(user) });
  } catch (err) {
    console.error("[AUTH] Erreur login:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

function sanitizeUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

module.exports = router;
module.exports.sanitizeUser = sanitizeUser;