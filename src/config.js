require('dotenv').config();

const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const config = {
    port: process.env.PORT || 8080,
    host: process.env.HOST || '0.0.0.0',
    rootDir: ROOT_DIR,
    dataDir: DATA_DIR,
    publicDir: PUBLIC_DIR,
    files: {
        users: path.join(DATA_DIR, 'users.json'),
        comments: path.join(DATA_DIR, 'comments.json'),
        friends: path.join(DATA_DIR, 'friends.json'),
        messages: path.join(DATA_DIR, 'messages.json'),
        banned: path.join(DATA_DIR, 'banned.json'),
        anime: path.join(DATA_DIR, 'anime.json'),
        push: path.join(DATA_DIR, 'push.json'),
        schedule: path.join(DATA_DIR, 'schedule.json'),
    },
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    sessionSecret: process.env.SESSION_SECRET,
    encryptionKey: process.env.ENCRYPTION_KEY,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
    vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@animehub.local',
    isProd: process.env.NODE_ENV === 'production',
};

module.exports = config;
