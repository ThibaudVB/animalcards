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
const io = new Server(server, {
    cors: {
        origin: ['http://localhost:5173', 'http://localhost:5174'],
        methods: ['GET', 'POST'],
        credentials: true
    }
});
const PORT = 3000;
const SECRET = process.env.JWT_SECRET || 'change-this-secret';

app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true
}));
app.use(express.json());


const DB_PATH = path.join(__dirname, 'users.json');
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, '[]');

function readUsers() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}
function writeUsers(users) {
    fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2));
}
function findUser(username) {
    return readUsers().find(u => u.username === username);
}


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


function signToken(user) {
    return jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '1h' });
}
function verifyToken(token) {
    return jwt.verify(token, SECRET);
}


app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
    if (findUser(username)) return res.status(409).json({ error: 'User already exists' });

    const user = { id: uuidv4(), username, password: hashPassword(password) };
    const users = readUsers();
    users.push(user);
    writeUsers(users);

    res.status(201).json({ token: signToken(user), username: user.username });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = findUser(username);
    if (!user || !verifyPassword(password, user.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ token: signToken(user), username: user.username });
});


io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token'));
    try {
        socket.user = verifyToken(token);
        next();
    } catch {
        next(new Error('Invalid token'));
    }
});

io.on('connection', (socket) => {
    console.log(`Connected: ${socket.user.username}`);
    socket.emit('welcome', { message: `Welcome, ${socket.user.username}!` });

    socket.on('message', (text) => {
        io.emit('message', { from: socket.user.username, text });
    });

    socket.on('disconnect', () => console.log(`Disconnected: ${socket.user.username}`));
});


server.listen(PORT, () => console.log(`Serveur sur port ${PORT}`));