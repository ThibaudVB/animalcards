import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';

const API = 'http://localhost:3000';
let socket;

export default function App() {
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [username, setUsername] = useState(localStorage.getItem('username'));
    const [messages, setMessages] = useState([]);
    const [form, setForm] = useState({ username: '', password: '' });
    const [error, setError] = useState('');
    const [input, setInput] = useState('');
    const [mode, setMode] = useState('login');

    useEffect(() => {
        if (!token) return;

        socket = io(API, { auth: { token } });

        socket.on('welcome', ({ message }) => console.log(message));
        socket.on('message', (msg) => setMessages(prev => [...prev, msg]));
        socket.on('connect_error', () => logout());

        return () => socket.disconnect();
    }, [token]);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        try {
        const endpoint = mode === 'login' ? '/login' : '/register';
        const { data } = await axios.post(API + endpoint, form);
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username);
        setToken(data.token);
        setUsername(data.username);
        } catch (err) {
        setError(err.response?.data?.error || 'Something went wrong');
        }
    }

    function logout() {
        localStorage.clear();
        setToken(null);
        setUsername(null);
        setMessages([]);
        socket?.disconnect();
    }

    function sendMessage(e) {
        e.preventDefault();
        if (!input.trim()) return;
        socket.emit('message', input);
        setInput('');
    }

    if (!token) return (
        <div style={{ maxWidth: 360, margin: '100px auto', fontFamily: 'sans-serif' }}>
        <h2>{mode === 'login' ? 'Login' : 'Register'}</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
            placeholder="Username"
            value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })}
            />
            <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            />
            {error && <p style={{ color: 'red' }}>{error}</p>}
            <button type="submit">{mode === 'login' ? 'Login' : 'Create Account'}</button>
        </form>
        <p>
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Register' : 'Login'}
            </button>
        </p>
        </div>
    );

    return (
        <div style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h2>Chat — {username}</h2>
            <button onClick={logout}>Logout</button>
        </div>
        <div style={{ border: '1px solid #ccc', height: 300, overflowY: 'auto', padding: 10, marginBottom: 10 }}>
            {messages.map((m, i) => (
            <p key={i}><strong>{m.from}:</strong> {m.text}</p>
            ))}
        </div>
        <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8 }}>
            <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type a message..."
            style={{ flex: 1 }}
            />
            <button type="submit">Send</button>
        </form>
        </div>
    );
}