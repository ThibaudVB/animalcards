/**
 * STORE.JS — Base de données en mémoire (JSON)
 * Simule une vraie DB pour cette étape 1.
 * Facile à remplacer par MongoDB/PostgreSQL plus tard.
 */

// --- Catalogue de cartes disponibles dans les boosters ---
const CARDS_CATALOG = [
  {
    id: "card-cameleon",
    name: "Caméléon de Vérone",
    type: "TERRESTRE",
    rarity: "COMMUNE",
    imageUrl: "/assets/cameleon.png",
    description: "Maître du camouflage, change de couleur en 2 secondes.",
    stats: { vitesse: 45, attaque: 30, defense: 55 },
    weakness: "AQUATIQUE",
    resistance: "VEGETAL",
    quizId: "quiz-cameleon",
  },
  {
    id: "card-axolotl",
    name: "Axolotl Fantôme",
    type: "AQUATIQUE",
    rarity: "RARE",
    imageUrl: "/assets/axolotl.png",
    description: "Capable de régénérer n'importe quel membre en quelques semaines.",
    stats: { vitesse: 35, attaque: 50, defense: 65 },
    weakness: "VEGETAL",
    resistance: "TERRESTRE",
    quizId: "quiz-axolotl",
  },
  {
    id: "card-rafflesia",
    name: "Rafflesia Géante",
    type: "VEGETAL",
    rarity: "RARE",
    imageUrl: "/assets/rafflesia.png",
    description: "La plus grande fleur du monde, parasite silencieux de la forêt.",
    stats: { vitesse: 10, attaque: 70, defense: 80 },
    weakness: "TERRESTRE",
    resistance: "AQUATIQUE",
    quizId: "quiz-rafflesia",
  },
  {
    id: "card-renard",
    name: "Renard Arctique",
    type: "TERRESTRE",
    rarity: "COMMUNE",
    imageUrl: "/assets/renard.png",
    description: "Survit à -70°C grâce à sa fourrure isolante unique.",
    stats: { vitesse: 75, attaque: 40, defense: 35 },
    weakness: "AQUATIQUE",
    resistance: "VEGETAL",
    quizId: "quiz-renard",
  },
  {
    id: "card-pieuvre",
    name: "Pieuvre Mimique",
    type: "AQUATIQUE",
    rarity: "LEGENDAIRE",
    imageUrl: "/assets/pieuvre.png",
    description: "Imite plus de 15 espèces différentes pour tromper ses prédateurs.",
    stats: { vitesse: 60, attaque: 85, defense: 45 },
    weakness: "VEGETAL",
    resistance: "TERRESTRE",
    quizId: "quiz-pieuvre",
  },
];

// --- Stockage en mémoire ---
const db = {
  // Map<username, User>
  users: new Map(),
  // Map<userId, User> — index secondaire pour accès par ID
  usersById: new Map(),
};

// --- Helpers d'accès aux données ---
const Store = {
  // USERS
  findUserByUsername: (username) => db.users.get(username.toLowerCase()),
  findUserById: (id) => db.usersById.get(id),

  createUser: (user) => {
    db.users.set(user.username.toLowerCase(), user);
    db.usersById.set(user.id, user);
    return user;
  },

  updateUser: (user) => {
    db.users.set(user.username.toLowerCase(), user);
    db.usersById.set(user.id, user);
    return user;
  },

  getAllUsers: () => Array.from(db.usersById.values()),

  // CARDS
  getRandomCard: () => {
    // Système de rareté pondéré
    const weights = { COMMUNE: 60, RARE: 30, LEGENDAIRE: 10 };
    const roll = Math.random() * 100;
    let threshold = 0;

    const byRarity = (rarity) =>
      CARDS_CATALOG.filter((c) => c.rarity === rarity);

    let targetRarity;
    for (const [rarity, weight] of Object.entries(weights)) {
      threshold += weight;
      if (roll < threshold) {
        targetRarity = rarity;
        break;
      }
    }

    const pool = byRarity(targetRarity);
    return pool[Math.floor(Math.random() * pool.length)];
  },

  getCardById: (id) => CARDS_CATALOG.find((c) => c.id === id),
  getAllCards: () => CARDS_CATALOG,
};

module.exports = Store;
