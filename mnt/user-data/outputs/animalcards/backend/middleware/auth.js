/**
 * MIDDLEWARE/AUTH.JS — Vérification JWT
 * Protège les routes qui nécessitent d'être connecté.
 * Usage : router.get("/protected", authMiddleware, handler)
 */

const jwt = require("jsonwebtoken");
const Store = require("../data/store");

const JWT_SECRET = process.env.JWT_SECRET || "animalcards_dev_secret";

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token manquant ou malformé." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // On recharge l'utilisateur depuis le store pour avoir les données fraîches
    const user = Store.findUserById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: "Utilisateur introuvable." });
    }

    req.user = user; // Disponible dans tous les handlers suivants
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token invalide ou expiré." });
  }
}

module.exports = authMiddleware;
