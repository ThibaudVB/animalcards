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

// --- BASES DE DONNÉES JSON ---
const DB_PATH = path.join(__dirname, 'users.json');
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, '[]');
const cardsPath = path.join(__dirname, 'data', 'cards.json');

// --- FONCTIONS AUTH ---
function readUsers() { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
function writeUsers(users) { fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2)); }
function findUser(username) { return readUsers().find(u => u.username === username); }
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
    const [salt, hash] = stored.split(':');
    const incoming = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(incoming, 'hex'));
}
function signToken(user) { return jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '1h' }); }

// MIDDLEWARE : Vérifie le token HTTP
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format "Bearer TOKEN"
    if (!token) return res.status(401).json({ error: 'Accès refusé' });

    jwt.verify(token, SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token invalide' });
        req.user = user;
        next();
    });
}

// --- ROUTES AUTHENTIFICATION ---
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Champs manquants' });
    if (findUser(username)) return res.status(409).json({ error: 'Utilisateur existant' });

    const user = { 
        id: uuidv4(), 
        username, 
        password: hashPassword(password), 
        unlockedCards: [1], 
        pendingCards: [],
        friends: [],           
        friendRequests: []     
    };
    
    const users = readUsers();
    users.push(user);
    writeUsers(users);

    res.status(201).json({ token: signToken(user), username: user.username });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = findUser(username);
    if (!user || !verifyPassword(password, user.password)) {
        return res.status(401).json({ error: 'Identifiants invalides' });
    }
    res.json({ token: signToken(user), username: user.username });
});

// --- ROUTES INVENTAIRE & BOOSTER ---

// ROUTE 1 : Afficher l'inventaire avec les 3 états
app.get('/api/inventory', authenticateToken, (req, res) => {
    const user = findUser(req.user.username);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    const unlocked = user.unlockedCards || [];
    const pending = user.pendingCards || [];

    fs.readFile(cardsPath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Erreur lecture JSON' });
        
        const allCards = JSON.parse(data);
        const inventory = allCards.map(card => {
            let status = 'locked';
            if (unlocked.includes(card.id)) status = 'unlocked';
            else if (pending.includes(card.id)) status = 'pending';
            
            return { ...card, status };
        });

        res.json(inventory);
    });
});

// ROUTE 2 : Ouvrir un booster (Tire une carte aléatoire)
app.post('/api/open-booster', authenticateToken, (req, res) => {
    const users = readUsers();
    const userIndex = users.findIndex(u => u.username === req.user.username);
    const user = users[userIndex];

    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    fs.readFile(cardsPath, 'utf8', (err, data) => {
        const allCards = JSON.parse(data);
        
        // On filtre les cartes que le joueur n'a PAS (ni débloquées, ni en attente)
        const availableCards = allCards.filter(c => 
            !user.unlockedCards.includes(c.id) && !user.pendingCards.includes(c.id)
        );

        if (availableCards.length === 0) {
            return res.status(400).json({ error: 'Incroyable ! Tu possèdes déjà toutes les cartes du jeu !' });
        }

        // On pioche une carte au hasard
        const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];
        
        // On l'ajoute dans les cartes "En attente de quiz" (Phase 1)
        user.pendingCards.push(randomCard.id);
        writeUsers(users);

        res.json({ message: `Tu as tiré ${randomCard.name} !`, card: randomCard });
    });
});

// ROUTE 3 : Simuler la réussite du Quiz (Phase 2)
app.post('/api/win-quiz', authenticateToken, (req, res) => {
    const { cardId } = req.body;
    const users = readUsers();
    const userIndex = users.findIndex(u => u.username === req.user.username);
    const user = users[userIndex];

    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    // Si la carte était bien en attente, on la passe en "unlocked"
    if (user.pendingCards.includes(cardId)) {
        user.pendingCards = user.pendingCards.filter(id => id !== cardId); 
        user.unlockedCards.push(cardId); 
        writeUsers(users);
        return res.json({ message: 'Bonne réponse ! Carte débloquée pour le combat !' });
    }
    
    res.status(400).json({ error: 'Cette carte n\'est pas en attente de quiz.' });
});

// --- SYSTÈME D'AMIS ---

// 1. Récupérer sa liste d'amis et ses requêtes
app.get('/api/friends', authenticateToken, (req, res) => {
    const user = findUser(req.user.username);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    
    res.json({
        friends: user.friends || [],
        requests: user.friendRequests || []
    });
});

// 2. Envoyer une demande d'ami
app.post('/api/friends/request', authenticateToken, (req, res) => {
    const { targetUsername } = req.body;
    const users = readUsers();
    
    const sender = users.find(u => u.username === req.user.username);
    const target = users.find(u => u.username === targetUsername);

    if (!sender) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (!target) return res.status(404).json({ error: 'Joueur introuvable.' });
    if (sender.username === target.username) return res.status(400).json({ error: 'Tu ne peux pas t\'ajouter toi-même !' });
    if ((sender.friends || []).includes(target.username)) return res.status(400).json({ error: 'Vous êtes déjà amis.' });
    if ((target.friendRequests || []).includes(sender.username)) return res.status(400).json({ error: 'Demande déjà envoyée.' });

    // On ajoute le nom de l'envoyeur dans la liste d'attente de la cible
    target.friendRequests = target.friendRequests || [];
    target.friendRequests.push(sender.username);
    writeUsers(users);

    res.json({ message: `Demande d'ami envoyée à ${target.username} !` });
});

// 3. Accepter une demande d'ami
app.post('/api/friends/accept', authenticateToken, (req, res) => {
    const { senderUsername } = req.body;
    const users = readUsers();
    
    const receiver = users.find(u => u.username === req.user.username);
    const sender = users.find(u => u.username === senderUsername);

    if (!receiver || !sender) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    // On vérifie que la demande existe bien
    if (!(receiver.friendRequests || []).includes(senderUsername)) {
        return res.status(400).json({ error: 'Aucune demande correspondante.' });
    }

    // On retire la demande
    receiver.friendRequests = receiver.friendRequests.filter(name => name !== senderUsername);
    
    // On les ajoute mutuellement en amis
    receiver.friends = receiver.friends || [];
    sender.friends = sender.friends || [];
    
    receiver.friends.push(sender.username);
    sender.friends.push(receiver.username);
    
    writeUsers(users);

    res.json({ message: `Tu es maintenant ami avec ${senderUsername} !` });
});

// --- SOCKET.IO ---
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Token manquant'));
    try { socket.user = verifyToken(token); next(); } catch { next(new Error('Token invalide')); }
});

io.on('connection', (socket) => {
    console.log(`🟢 [ONLINE] ${socket.user.username}`);
    socket.on('disconnect', () => console.log(`🔴 [OFFLINE] ${socket.user.username}`));
});

server.listen(PORT, () => console.log(`🚀 Serveur prêt sur http://localhost:${PORT}`));