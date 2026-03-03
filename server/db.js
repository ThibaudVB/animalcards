const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'users.json');

function readUsers() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeUsers(users) {
    fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2));
}

function findUserByUsername(username) {
    return readUsers().find(u => u.username === username);
}

function createUser(user) {
    const users = readUsers();
    if (findUserByUsername(user.username)) throw new Error('User already exists');
    users.push(user);
    writeUsers(users);
    return user;
}

module.exports = { findUserByUsername, createUser };