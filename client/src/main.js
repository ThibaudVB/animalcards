import { io } from 'socket.io-client';

const API = 'http://localhost:3000';
let socket = null;
let mode = 'login';

const authCard   = document.getElementById('auth-card');
const chatCard   = document.getElementById('chat-card');
const formTitle  = document.getElementById('form-title');
const usernameEl = document.getElementById('username');
const passwordEl = document.getElementById('password');
const errorMsg   = document.getElementById('error-msg');
const submitBtn  = document.getElementById('submit-btn');
const toggleLink = document.getElementById('toggle-link');
const chatTitle  = document.getElementById('chat-title');
const messages   = document.getElementById('messages');
const msgInput   = document.getElementById('msg-input');
const sendBtn    = document.getElementById('send-btn');
const logoutBtn  = document.getElementById('logout-btn');

toggleLink.addEventListener('click', () => {
    mode = mode === 'login' ? 'register' : 'login';
    formTitle.textContent = mode === 'login' ? 'Login' : 'Register';
    submitBtn.textContent = mode === 'login' ? 'Login' : 'Create Account';
    toggleLink.textContent = mode === 'login'
        ? "Don't have an account? Register"
        : 'Already have an account? Login';
    errorMsg.textContent = '';
});

submitBtn.addEventListener('click', async () => {
    const username = usernameEl.value.trim();
    const password = passwordEl.value.trim();
    if (!username || !password) return showError('Please fill in all fields');

    try {
        const res = await fetch(`${API}/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) return showError(data.error);

        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username);
        enterChat(data.token, data.username);
    } catch {
        showError('Could not reach server');
    }
});

function enterChat(token, username) {
    authCard.style.display = 'none';
    chatCard.style.display = 'block';
    chatTitle.textContent = `Chat — ${username}`;

    socket = io(API, { auth: { token } });

    socket.on('welcome', ({ message }) => addMessage(message));
    socket.on('message', ({ from, text }) => addMessage(`${from}: ${text}`));
    socket.on('connect_error', () => logout());
}

sendBtn.addEventListener('click', sendMessage);
msgInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || !socket) return;
    socket.emit('message', text);
    msgInput.value = '';
}

logoutBtn.addEventListener('click', logout);

function logout() {
    localStorage.clear();
    socket?.disconnect();
    socket = null;
    chatCard.style.display = 'none';
    authCard.style.display = 'block';
    messages.innerHTML = '';
    usernameEl.value = '';
    passwordEl.value = '';
}

function addMessage(text) {
    const p = document.createElement('p');
    p.textContent = text;
    messages.appendChild(p);
    messages.scrollTop = messages.scrollHeight;
}

function showError(msg) {
    errorMsg.textContent = msg;
}

const savedToken = localStorage.getItem('token');
const savedUsername = localStorage.getItem('username');
if (savedToken && savedUsername) enterChat(savedToken, savedUsername);