const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const PORT = 3000;
const SECRET = process.env.JWT_SECRET || 'change-this-secret';

const corsOptions = { origin: ['http://localhost:5173', 'http://localhost:5174'], credentials: true };
app.use(cors(corsOptions));
app.use(express.json());
const io = new Server(server, { cors: corsOptions });

// ─── DB ────────────────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'users.json');
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, '[]');
const cardsPath = path.join(__dirname, 'data', 'cards.json');

function readUsers() { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
function writeUsers(u) { fs.writeFileSync(DB_PATH, JSON.stringify(u, null, 2)); }
function findUser(username) { return readUsers().find(u => u.username === username); }

function hashPassword(pw) {
    const salt = crypto.randomBytes(16).toString('hex');
    return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function verifyPassword(pw, stored) {
    const [salt, hash] = stored.split(':');
    return crypto.timingSafeEqual(
        Buffer.from(hash, 'hex'),
        crypto.scryptSync(pw, salt, 64)
    );
}
function signToken(user) {
    return jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '24h' });
}
function auth(req, res, next) {
    const t = req.headers['authorization']?.split(' ')[1];
    if (!t) return res.status(401).json({ error: 'Accès refusé' });
    jwt.verify(t, SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token invalide' });
        req.user = user; next();
    });
}

// ─── CHEST HELPERS ─────────────────────────────────────────────────────────
// 4 slots : les 3 premiers sont gratuits (free_count), au-delà = 100 pièces chacun
const CHEST_COST = 100;       // pièces pour un slot payant
const FREE_SLOTS = 3;         // 3 premiers gratuits

function initChests(user) {
    if (!user.chestSlots) {
        // Chaque slot: { unlocked: bool, card: null|{id,name,...}, openedAt: null }
        user.chestSlots = [
            { unlocked: false, card: null },
            { unlocked: false, card: null },
            { unlocked: false, card: null },
            { unlocked: false, card: null }
        ];
    }
    if (user.coins === undefined) user.coins = 0;
}

// ─── AUTH ──────────────────────────────────────────────────────────────────
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Champs manquants' });
    if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Pseudo : 3-20 caractères' });
    if (password.length < 4) return res.status(400).json({ error: 'Mot de passe trop court (4 min)' });
    if (findUser(username)) return res.status(409).json({ error: 'Ce pseudo est déjà pris' });
    const user = {
        id: uuidv4(), username, password: hashPassword(password),
        unlockedCards: [1], pendingCards: [], friends: [], friendRequests: [], deck: [],
        level: 1, xp: 0, coins: 150,
        stats: { wins: 0, losses: 0 },
        chestSlots: [
            { unlocked: false, card: null },
            { unlocked: false, card: null },
            { unlocked: false, card: null },
            { unlocked: false, card: null }
        ],
        freeBoostersLeft: 3,
        boostersBoughtWithWins: 0,
        createdAt: new Date().toISOString()
    };
    const users = readUsers(); users.push(user); writeUsers(users);
    res.status(201).json({ token: signToken(user), username: user.username });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = findUser(username);
    if (!user || !verifyPassword(password, user.password)) return res.status(401).json({ error: 'Identifiants invalides' });
    res.json({ token: signToken(user), username: user.username });
});

// ─── INVENTORY ─────────────────────────────────────────────────────────────
app.get('/api/inventory', auth, (req, res) => {
    const user = findUser(req.user.username);
    if (!user) return res.status(404).json({ error: 'Introuvable' });
    initChests(user);
    const allCards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
    const inventory = allCards.map(card => {
        let status = 'locked';
        if ((user.unlockedCards || []).map(Number).includes(card.id)) status = 'unlocked';
        else if ((user.pendingCards || []).map(Number).includes(card.id)) status = 'pending';
        return { ...card, status };
    });
    res.json({
        inventory, deck: user.deck || [],
        level: user.level || 1, xp: user.xp || 0, xpNeeded: (user.level || 1) * 100,
        coins: user.coins || 0,
        stats: user.stats || { wins: 0, losses: 0 },
        chestSlots: user.chestSlots,
        freeBoostersLeft: user.freeBoostersLeft ?? 0,
        winsBoostersAvailable: Math.floor((user.stats?.wins || 0) / 5) - (user.boostersBoughtWithWins || 0)
    });
});

app.post('/api/save-deck', auth, (req, res) => {
    const { deck } = req.body;
    const users = readUsers();
    const user = users.find(u => u.username === req.user.username);
    if (!user) return res.status(404).json({ error: 'Introuvable' });
    if (deck.length > 3) return res.status(400).json({ error: '3 cartes max' });
    user.deck = deck; writeUsers(users);
    res.json({ message: 'Deck mis à jour !' });
});

// ─── CHEST SYSTEM ──────────────────────────────────────────────────────────
// Unlock a chest slot (fill it with a card)
app.post('/api/chest/unlock', auth, (req, res) => {
    const { slotIndex } = req.body;
    if (slotIndex < 0 || slotIndex > 3) return res.status(400).json({ error: 'Slot invalide' });

    const users = readUsers();
    const user = users.find(u => u.username === req.user.username);
    if (!user) return res.status(404).json({ error: 'Introuvable' });
    initChests(user);

    const slot = user.chestSlots[slotIndex];
    if (slot.unlocked) return res.status(400).json({ error: 'Slot déjà débloqué' });

    // Cost check: first FREE_SLOTS slots cost 0, rest cost CHEST_COST
    const unlockedCount = user.chestSlots.filter(s => s.unlocked).length;
    const isFree = unlockedCount < FREE_SLOTS;
    const cost = isFree ? 0 : CHEST_COST;

    if (!isFree && (user.coins || 0) < cost) {
        return res.status(400).json({ error: `Pas assez de pièces ! (${cost} 🪙 requis)` });
    }

    const allCards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
    const available = allCards.filter(c =>
        !(user.unlockedCards || []).includes(c.id) &&
        !(user.pendingCards || []).includes(c.id) &&
        !user.chestSlots.some(s => s.card?.id === c.id)
    );

    if (available.length === 0) return res.status(400).json({ error: 'Toutes les cartes sont déjà obtenues !' });

    const card = available[Math.floor(Math.random() * available.length)];
    user.chestSlots[slotIndex].unlocked = true;
    user.chestSlots[slotIndex].card = { id: card.id, name: card.name, rarity: card.rarity, type: card.type };
    user.coins = (user.coins || 0) - cost;

    writeUsers(users);
    res.json({ card, cost, coinsLeft: user.coins, message: `Booster ouvert ! Tu as tiré ${card.name} !` });
});

// Collect a card from an unlocked chest slot → adds to pendingCards
app.post('/api/chest/collect', auth, (req, res) => {
    const { slotIndex } = req.body;
    const users = readUsers();
    const user = users.find(u => u.username === req.user.username);
    if (!user) return res.status(404).json({ error: 'Introuvable' });
    initChests(user);

    const slot = user.chestSlots[slotIndex];
    if (!slot || !slot.unlocked || !slot.card) return res.status(400).json({ error: 'Rien à collecter ici' });

    const cardId = slot.card.id;
    user.pendingCards = user.pendingCards || [];
    if (!user.pendingCards.includes(cardId) && !(user.unlockedCards || []).includes(cardId)) {
        user.pendingCards.push(cardId);
    }
    // Reset slot
    user.chestSlots[slotIndex] = { unlocked: false, card: null };

    writeUsers(users);
    res.json({ message: 'Carte ajoutée à ta collection !', cardId });
});

// ─── BOOSTER (legacy, boutique tab) ────────────────────────────────────────
app.post('/api/open-booster', auth, (req, res) => {
    const users = readUsers();
    const user = users.find(u => u.username === req.user.username);
    if (!user) return res.status(404).json({ error: 'Introuvable' });
    initChests(user);

    // Init freeBoostersLeft si absent (anciens comptes)
    if (user.freeBoostersLeft === undefined) user.freeBoostersLeft = 0;

    const wins = user.stats?.wins || 0;
    const boostersBoughtWithWins = user.boostersBoughtWithWins || 0;
    const winsBoostersAvailable = Math.floor(wins / 5) - boostersBoughtWithWins;

    const canOpenFree = user.freeBoostersLeft > 0;
    const canOpenWin = winsBoostersAvailable > 0;
    const canOpenPaid = (req.body.buyWithCoins === true) && (user.coins || 0) >= 1000;

    if (!canOpenFree && !canOpenWin && !canOpenPaid) {
        return res.status(400).json({
            error: 'Aucun booster disponible.',
            freeBoostersLeft: user.freeBoostersLeft,
            winsBoostersAvailable,
            coins: user.coins
        });
    }

    const allCards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
    const unlockedNums = (user.unlockedCards || []).map(Number);
    const pendingNums  = (user.pendingCards  || []).map(Number);
    const available = allCards.filter(c => !unlockedNums.includes(c.id) && !pendingNums.includes(c.id));
    if (available.length === 0) return res.status(400).json({ error: 'Toutes les cartes déjà obtenues !' });

    const card = available[Math.floor(Math.random() * available.length)];
    user.pendingCards = pendingNums;
    user.unlockedCards = unlockedNums;
    user.pendingCards.push(card.id);

    // Déduire la source utilisée (priorité : gratuit > victoires > pièces)
    let source = '';
    if (canOpenFree) {
        user.freeBoostersLeft--;
        source = 'free';
    } else if (canOpenWin) {
        user.boostersBoughtWithWins = boostersBoughtWithWins + 1;
        source = 'wins';
    } else {
        user.coins -= 1000;
        source = 'coins';
    }

    writeUsers(users);
    res.json({
        card, source,
        freeBoostersLeft: user.freeBoostersLeft,
        winsBoostersAvailable: Math.floor((user.stats?.wins || 0) / 5) - (user.boostersBoughtWithWins || 0),
        coins: user.coins
    });
});

// ─── QUIZ ──────────────────────────────────────────────────────────────────
const quizPath = path.join(__dirname, 'data', 'quiz.json');
function getQuizData() { return JSON.parse(fs.readFileSync(quizPath, 'utf8')); }

// Stockage sessions quiz en mémoire (déclaré AVANT les routes)
const quizSessions = {};
setInterval(() => {
    const now = Date.now();
    for (const sid in quizSessions) {
        if (now - quizSessions[sid].createdAt > 30 * 60 * 1000) delete quizSessions[sid];
    }
}, 10 * 60 * 1000);

// GET /api/quiz/start?cardId=X
app.get('/api/quiz/start', auth, (req, res) => {
    const cardId = parseInt(req.query.cardId);
    if (isNaN(cardId)) return res.status(400).json({ error: 'cardId invalide' });

    const user = findUser(req.user.username);
    if (!user) return res.status(404).json({ error: 'Introuvable' });

    // Normalise pendingCards en nombres (au cas où certains seraient des strings)
    const pending = (user.pendingCards || []).map(Number);
    if (!pending.includes(cardId)) {
        return res.status(400).json({ error: `Carte #${cardId} non en attente de quiz (pending: [${pending}])` });
    }

    const quiz = getQuizData();
    const cardQ = quiz.byCard[String(cardId)] || [];
    const generalQ = quiz.general;

    const shuffled = arr => [...arr].sort(() => Math.random() - 0.5);
    const cardPick = shuffled(cardQ).slice(0, Math.min(2, cardQ.length));
    const generalPick = shuffled(generalQ).slice(0, 5 - cardPick.length);
    const questions = shuffled([...cardPick, ...generalPick]);

    // sessionId avec crypto déjà importé en haut du fichier
    const sessionId = crypto.randomBytes(16).toString('hex');

    quizSessions[sessionId] = {
        cardId,
        username: req.user.username,
        questions: questions.map(q => ({ id: q.id, answer: q.answer })),
        score: 0,
        createdAt: Date.now()
    };

    res.json({
        sessionId,
        total: questions.length,
        questions: questions.map(q => ({ id: q.id, question: q.question, choices: q.choices }))
    });
});

// POST /api/quiz/answer  → vérifie une réponse
app.post('/api/quiz/answer', auth, (req, res) => {
    const { sessionId, questionIndex, choiceIndex } = req.body;
    const session = quizSessions[sessionId];
    if (!session) return res.status(400).json({ error: 'Session invalide ou expirée' });
    if (session.username !== req.user.username) return res.status(403).json({ error: 'Accès refusé' });
    if (questionIndex < 0 || questionIndex >= session.questions.length) return res.status(400).json({ error: 'Question invalide' });

    const q = session.questions[questionIndex];
    const correct = q.answer === choiceIndex;
    if (correct) session.score++;

    res.json({ correct, correctAnswer: q.answer, score: session.score });
});

// POST /api/quiz/complete  → finalise, débloque la carte si score >= 3/5
app.post('/api/quiz/complete', auth, (req, res) => {
    const { sessionId } = req.body;
    const session = quizSessions[sessionId];
    if (!session) return res.status(400).json({ error: 'Session invalide ou expirée' });
    if (session.username !== req.user.username) return res.status(403).json({ error: 'Accès refusé' });

    const { cardId, score, questions } = session;
    const total = questions.length;
    const passed = score >= 3; // Seuil : 3/5 correct

    delete quizSessions[sessionId];

    if (!passed) {
        return res.json({ passed: false, score, total, message: `${score}/${total} — Réessaie ! (3 bonnes réponses requises)` });
    }

    const users = readUsers();
    const user = users.find(u => u.username === req.user.username);
    if (!user) return res.status(404).json({ error: 'Introuvable' });

    // Normalise en nombres pour comparaison stricte fiable
    const pendingNums  = (user.pendingCards  || []).map(Number);
    const unlockedNums = (user.unlockedCards || []).map(Number);
    const cardIdNum = Number(cardId);
    if (!pendingNums.includes(cardIdNum)) return res.status(400).json({ error: 'Carte non en attente' });
    user.pendingCards  = pendingNums.filter(id => id !== cardIdNum);
    user.unlockedCards = unlockedNums;
    if (!user.unlockedCards.includes(cardIdNum)) user.unlockedCards.push(cardIdNum);

    const xpGain = 30 + score * 10;
    user.xp = (user.xp || 0) + xpGain;
    let leveledUp = false;
    while (user.xp >= (user.level || 1) * 100) {
        user.xp -= user.level * 100;
        user.level++;
        leveledUp = true;
    }
    writeUsers(users);

    res.json({ passed: true, score, total, xpGain, newLevel: user.level, leveledUp, message: `Carte débloquée ! +${xpGain} XP` });
});

// ─── SCOREBOARD ────────────────────────────────────────────────────────────
app.get('/api/scoreboard', auth, (req, res) => {
    const users = readUsers();
    const board = users.map(u => ({
        username: u.username,
        level: u.level || 1, xp: u.xp || 0,
        wins: u.stats?.wins || 0, losses: u.stats?.losses || 0,
        totalCards: (u.unlockedCards || []).length,
        winRate: (u.stats?.wins || 0) + (u.stats?.losses || 0) > 0
            ? Math.round(((u.stats?.wins || 0) / ((u.stats?.wins || 0) + (u.stats?.losses || 0))) * 100) : 0
    })).sort((a, b) => b.level - a.level || b.wins - a.wins || b.xp - a.xp);
    res.json({ scoreboard: board, currentUser: req.user.username });
});

// ─── SOCIAL ────────────────────────────────────────────────────────────────
const onlinePlayers = new Set();

app.get('/api/friends', auth, (req, res) => {
    const all = readUsers();
    const user = all.find(u => u.username === req.user.username);
    if (!user) return res.status(404).json({ error: 'Introuvable' });
    const friends = (user.friends || []).map(name => {
        const f = all.find(u => u.username === name);
        return f ? { username: f.username, level: f.level || 1, wins: f.stats?.wins || 0, totalCards: (f.unlockedCards || []).length, isOnline: onlinePlayers.has(f.username) } : null;
    }).filter(Boolean);
    res.json({ friends, requests: user.friendRequests || [] });
});

app.post('/api/friends/request', auth, (req, res) => {
    const { targetUsername } = req.body;
    if (!targetUsername || targetUsername === req.user.username) return res.status(400).json({ error: 'Invalide' });
    const users = readUsers();
    const sender = users.find(u => u.username === req.user.username);
    const target = users.find(u => u.username === targetUsername);
    if (!target) return res.status(404).json({ error: 'Joueur introuvable' });
    if ((sender.friends || []).includes(targetUsername)) return res.status(400).json({ error: 'Déjà amis' });
    if ((target.friendRequests || []).includes(req.user.username)) return res.status(400).json({ error: 'Demande déjà envoyée' });
    target.friendRequests = target.friendRequests || [];
    target.friendRequests.push(req.user.username);
    writeUsers(users);
    const ts = [...io.sockets.sockets.values()].find(s => s.user?.username === targetUsername);
    if (ts) ts.emit('friend_request', { from: req.user.username });
    res.json({ message: `Demande envoyée à ${targetUsername} !` });
});

app.post('/api/friends/accept', auth, (req, res) => {
    const { senderUsername } = req.body;
    const users = readUsers();
    const me = users.find(u => u.username === req.user.username);
    const sender = users.find(u => u.username === senderUsername);
    if (!sender || !(me.friendRequests || []).includes(senderUsername)) return res.status(400).json({ error: 'Invalide' });
    me.friendRequests = me.friendRequests.filter(r => r !== senderUsername);
    me.friends = me.friends || []; sender.friends = sender.friends || [];
    if (!me.friends.includes(senderUsername)) me.friends.push(senderUsername);
    if (!sender.friends.includes(req.user.username)) sender.friends.push(req.user.username);
    writeUsers(users);
    const ss = [...io.sockets.sockets.values()].find(s => s.user?.username === senderUsername);
    if (ss) ss.emit('friend_accepted', { by: req.user.username });
    res.json({ message: `${senderUsername} est maintenant ton ami !` });
});

app.post('/api/friends/reject', auth, (req, res) => {
    const { senderUsername } = req.body;
    const users = readUsers();
    const me = users.find(u => u.username === req.user.username);
    if (!me) return res.status(404).json({ error: 'Introuvable' });
    me.friendRequests = (me.friendRequests || []).filter(r => r !== senderUsername);
    writeUsers(users); res.json({ message: 'Refusé' });
});

app.post('/api/friends/remove', auth, (req, res) => {
    const { friendUsername } = req.body;
    const users = readUsers();
    const me = users.find(u => u.username === req.user.username);
    const fr = users.find(u => u.username === friendUsername);
    if (!me) return res.status(404).json({ error: 'Introuvable' });
    me.friends = (me.friends || []).filter(f => f !== friendUsername);
    if (fr) fr.friends = (fr.friends || []).filter(f => f !== req.user.username);
    writeUsers(users); res.json({ message: 'Ami retiré' });
});

app.get('/api/search-player', auth, (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ results: [] });
    const users = readUsers();
    res.json({ results: users.filter(u => u.username !== req.user.username && u.username.toLowerCase().includes(q.toLowerCase())).slice(0, 10).map(u => ({ username: u.username, level: u.level || 1, wins: u.stats?.wins || 0, isOnline: onlinePlayers.has(u.username) })) });
});

// ─── SOCKET AUTH ───────────────────────────────────────────────────────────
io.use((socket, next) => {
    const t = socket.handshake.auth?.token;
    if (!t) return next(new Error('Token manquant'));
    jwt.verify(t, SECRET, (err, user) => {
        if (err) return next(new Error('Token invalide'));
        socket.user = user; next();
    });
});

let matchmakingQueue = [];
const battles = {};

// ─── END GAME ──────────────────────────────────────────────────────────────
function endGame(roomId, battle, winnerUsername, reason) {
    if (!battles[roomId]) return;
    let xpStats = {}, coinsGained = 0;
    try {
        const users = readUsers();
        const allCards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));

        const applyRewards = (username, pts, isWinner) => {
            const u = users.find(x => x.username === username);
            if (!u) return null;
            initChests(u);
            const xpGain = 10 + pts * 20 + (isWinner ? 50 : 0);
            const coinGain = isWinner ? 120 : 30; // pièces gagnées
            u.xp = (u.xp || 0) + xpGain;
            u.coins = (u.coins || 0) + coinGain;
            u.stats = u.stats || { wins: 0, losses: 0 };
            if (isWinner) u.stats.wins++; else u.stats.losses++;
            let leveledUp = false;
            while (u.xp >= (u.level || 1) * 100) { u.xp -= u.level * 100; u.level++; leveledUp = true; }
            if (username === winnerUsername) coinsGained = coinGain;
            return { xpGain, coinGain, newLevel: u.level, leveledUp };
        };

        xpStats[battle.p1.username] = applyRewards(battle.p1.username, battle.p1.points, winnerUsername === battle.p1.username);
        xpStats[battle.p2.username] = applyRewards(battle.p2.username, battle.p2.points, winnerUsername === battle.p2.username);

        // Booster reward in a free chest slot for winner
        let boosterReward = null;
        const winnerDb = users.find(u => u.username === winnerUsername);
        if (winnerDb) {
            const available = allCards.filter(c =>
                !(winnerDb.unlockedCards || []).includes(c.id) &&
                !(winnerDb.pendingCards || []).includes(c.id) &&
                !winnerDb.chestSlots.some(s => s.card?.id === c.id)
            );
            const freeSlot = winnerDb.chestSlots.findIndex(s => !s.unlocked);
            if (freeSlot !== -1 && available.length > 0) {
                const card = available[Math.floor(Math.random() * available.length)];
                winnerDb.chestSlots[freeSlot] = { unlocked: true, card: { id: card.id, name: card.name, rarity: card.rarity, type: card.type } };
                boosterReward = card;
            }
        }

        writeUsers(users);
        delete battles[roomId];
        io.to(roomId).emit('match_end', { winner: winnerUsername, reason, xpStats, boosterReward });
        return;
    } catch (e) { console.error('endGame error:', e); }
    delete battles[roomId];
    io.to(roomId).emit('match_end', { winner: winnerUsername, reason, xpStats: {} });
}

// ─── SOCKET EVENTS ─────────────────────────────────────────────────────────
io.on('connection', socket => {
    onlinePlayers.add(socket.user.username);

    socket.on('find_match', () => {
        const user = findUser(socket.user.username);
        if (!user || (user.deck || []).length < 3) return socket.emit('matchmaking_error', { message: '⚠️ 3 cartes requises dans le deck !' });
        if ((user.level || 1) < 2) return socket.emit('matchmaking_error', { message: '🔒 Niveau 2 requis !' });
        if (!matchmakingQueue.find(p => p.socket.id === socket.id)) matchmakingQueue.push({ socket, username: socket.user.username });

        if (matchmakingQueue.length >= 2) {
            const p1 = matchmakingQueue.shift(), p2 = matchmakingQueue.shift();
            const roomId = 'room_' + uuidv4();
            p1.socket.join(roomId); p2.socket.join(roomId);
            const allUsers = readUsers(), allCards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
            const getCards = name => {
                const u = allUsers.find(x => x.username === name);
                return (u?.deck || []).map(id => { const c = allCards.find(x => x.id === id); return c ? { ...c, currentHp: c.hp } : null; }).filter(Boolean);
            };
            battles[roomId] = {
                p1: { socket: p1.socket, username: p1.username, cards: getCards(p1.username), activeIndex: 0, points: 0, action: null },
                p2: { socket: p2.socket, username: p2.username, cards: getCards(p2.username), activeIndex: 0, points: 0, action: null }
            };
            const emit = side => {
                const me = battles[roomId][side], other = battles[roomId][side === 'p1' ? 'p2' : 'p1'];
                me.socket.emit('match_state', { opponent: other.username, myCards: me.cards, myActiveIndex: 0, myPoints: 0, enemyCards: other.cards, enemyActiveIndex: 0, enemyPoints: 0 });
            };
            emit('p1'); emit('p2');
        }
    });

    socket.on('play_turn', ({ moveIndex }) => {
        const roomId = [...socket.rooms].find(r => r.startsWith('room_'));
        if (!roomId || !battles[roomId]) return;
        const b = battles[roomId];
        const player = b.p1.socket.id === socket.id ? b.p1 : b.p2;
        if (player.action !== null) return;
        const card = player.cards[player.activeIndex];
        if (!card || !card.moves[parseInt(moveIndex)]) return;
        player.action = { moveIndex: parseInt(moveIndex) };
        if (b.p1.action !== null && b.p2.action !== null) resolveTurn(roomId, b);
    });

    socket.on('surrender', () => {
        const roomId = [...socket.rooms].find(r => r.startsWith('room_'));
        if (!roomId || !battles[roomId]) return;
        const b = battles[roomId];
        endGame(roomId, b, b.p1.socket.id === socket.id ? b.p2.username : b.p1.username, 'Abandon');
    });

    socket.on('cancel_match', () => { matchmakingQueue = matchmakingQueue.filter(p => p.socket.id !== socket.id); });

    socket.on('disconnect', () => {
        onlinePlayers.delete(socket.user.username);
        matchmakingQueue = matchmakingQueue.filter(p => p.socket.id !== socket.id);
        for (const roomId in battles) {
            const b = battles[roomId];
            if (b.p1.socket.id === socket.id) endGame(roomId, b, b.p2.username, 'Déconnexion');
            else if (b.p2.socket.id === socket.id) endGame(roomId, b, b.p1.username, 'Déconnexion');
        }
    });
});

// ─── RESOLVE TURN ──────────────────────────────────────────────────────────
function resolveTurn(roomId, b) {
    if (!battles[roomId]) return;
    const a1 = b.p1.cards[b.p1.activeIndex], a2 = b.p2.cards[b.p2.activeIndex];
    const m1 = a1.moves[b.p1.action.moveIndex], m2 = a2.moves[b.p2.action.moveIndex];
    let first, second, fm, sm;
    if (a1.speed >= a2.speed) { first = b.p1; second = b.p2; fm = m1; sm = m2; }
    else { first = b.p2; second = b.p1; fm = m2; sm = m1; }
    const fa = first.cards[first.activeIndex], sa = second.cards[second.activeIndex];
    const logs = [];

    logs.push(`⚡ <b>${fa.name}</b> → <b>${fm.name}</b>`);
    if (fm.power > 0) {
        const d = Math.max(1, Math.floor(fm.power + fa.attack * 0.4));
        sa.currentHp = Math.max(0, sa.currentHp - d);
        logs.push(`💥 ${sa.name} perd <b>${d} PV</b> (${sa.currentHp}/${sa.hp})`);
    }

    let sKO = false;
    if (sa.currentHp <= 0) {
        sa.currentHp = 0; logs.push(`💀 <b>${sa.name} K.O !</b>`); first.points++;
        sKO = true;
        const ni = second.cards.findIndex(c => c.currentHp > 0);
        if (ni !== -1) { second.activeIndex = ni; logs.push(`🔄 → <b>${second.cards[ni].name}</b>`); }
    }

    if (!sKO) {
        logs.push(`⚡ <b>${sa.name}</b> → <b>${sm.name}</b>`);
        if (sm.power > 0) {
            const d = Math.max(1, Math.floor(sm.power + sa.attack * 0.4));
            fa.currentHp = Math.max(0, fa.currentHp - d);
            logs.push(`💥 ${fa.name} perd <b>${d} PV</b> (${fa.currentHp}/${fa.hp})`);
        }
        if (fa.currentHp <= 0) {
            fa.currentHp = 0; logs.push(`💀 <b>${fa.name} K.O !</b>`); second.points++;
            const ni = first.cards.findIndex(c => c.currentHp > 0);
            if (ni !== -1) { first.activeIndex = ni; logs.push(`🔄 → <b>${first.cards[ni].name}</b>`); }
        }
    }

    b.p1.action = null; b.p2.action = null;

    let winner = null;
    if (b.p1.points >= 3 || b.p2.cards.every(c => c.currentHp <= 0)) winner = b.p1.username;
    else if (b.p2.points >= 3 || b.p1.cards.every(c => c.currentHp <= 0)) winner = b.p2.username;

    [['p1', 'p2'], ['p2', 'p1']].forEach(([ms, es]) => {
        const me = b[ms], en = b[es];
        me.socket.emit('turn_result', {
            logs, isOver: !!winner,
            state: { myCards: me.cards, myActiveIndex: me.activeIndex, myPoints: me.points, enemyCards: en.cards, enemyActiveIndex: en.activeIndex, enemyPoints: en.points }
        });
    });

    if (winner) setTimeout(() => { if (battles[roomId]) endGame(roomId, b, winner, 'K.O.'); }, 2000);
}

server.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));
