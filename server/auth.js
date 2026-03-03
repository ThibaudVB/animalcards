const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'change-this-secret';

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

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };