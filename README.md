# 🌿 AnimalCards — Étape 1 : Compte & Premier Booster

## Structure du projet

```
animalcards/
├── backend/
│   ├── data/
│   │   └── store.js          ← Base de données en mémoire
│   ├── middleware/
│   │   └── auth.js           ← Vérification JWT
│   ├── routes/
│   │   ├── auth.js           ← POST /api/auth/register & /login
│   │   └── booster.js        ← POST /api/booster/open & GET /inventory
│   ├── server.js             ← Point d'entrée Express + Socket.IO
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── api.js            ← Client HTTP (fetch + gestion JWT)
    │   ├── state.js          ← Store réactif en mémoire
    │   ├── ui.js             ← Rendu HTML des vues
    │   └── main.js           ← Orchestrateur (events → API → UI)
    ├── index.html            ← App shell + styles
    ├── vite.config.js
    └── package.json
```

## Installation & Démarrage

### Backend
```bash
cd backend
npm install
npm run dev          # Démarre sur http://localhost:3000
```

### Frontend
```bash
cd frontend
npm install
npm run dev          # Démarre sur http://localhost:5173
```

## Endpoints disponibles (Étape 1)

| Méthode | Route                    | Auth | Description                        |
|---------|--------------------------|------|------------------------------------|
| GET     | /api/health              | Non  | Health check du serveur            |
| POST    | /api/auth/register       | Non  | Créer un compte                    |
| POST    | /api/auth/login          | Non  | Se connecter                       |
| POST    | /api/booster/open        | Oui  | Ouvrir un booster (tirage aléatoire)|
| GET     | /api/booster/inventory   | Oui  | Récupérer son inventaire            |

## Flux de jeu (Étape 1)

1. **Inscription** → création du compte avec hash bcrypt + token JWT
2. **Premier booster automatique** → tirage d'une carte du catalogue, ajout en inventaire (verrouillée), récompenses EXP+pièces
3. **Dashboard** → affichage du profil, niveau, pièces, statistiques
4. **Inventaire** → liste des cartes avec statut verrouillé/déverrouillé

## Prochaines étapes

- **Étape 2** : Système de Quiz (5 questions, indices payants, déverrouillage de carte)
- **Étape 3** : Mode Challenge — combats 1v1 via Socket.IO
- **Étape 4** : Leaderboard & API REST de progression
