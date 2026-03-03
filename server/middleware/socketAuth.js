const { verifyToken } = require('../auth');

module.exports = function socketAuth(socket, next) {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) return next(new Error('Authentication required'));

    try {
        const user = verifyToken(token);
        socket.user = user;
        next();
    } catch (err) {
        next(new Error('Invalid or expired token'));
    }
};