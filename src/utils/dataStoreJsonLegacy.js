// ==========================================
// LEGACY JSON READER (used only for one-time migration to SQLite)
// Reads the encrypted JSON files exactly as the original dataStore did,
// so existing data can be moved into the relational DB.
// ==========================================
const fs = require('fs');
const config = require('../config');
const { decryptJSON, encryptJSON } = require('./crypto');

function readJSON(file, fallback) {
    if (!fs.existsSync(file)) return fallback;
    try {
        const raw = fs.readFileSync(file, 'utf8');
        const decrypted = decryptJSON(raw);
        if (decrypted === null) return fallback;
        return JSON.parse(decrypted || JSON.stringify(fallback));
    } catch (err) {
        return fallback;
    }
}

module.exports = {
    readUsers: () => readJSON(config.files.users, []),
    readAnime: () => readJSON(config.files.anime, []),
    readComments: () => readJSON(config.files.comments, []),
    readFriends: () => readJSON(config.files.friends, []),
    readMessages: () => readJSON(config.files.messages, []),
    readBanned: () => readJSON(config.files.banned, []),
    readPush: () => readJSON(config.files.push, []),
    readSchedule: () => readJSON(config.files.schedule, []),
    encryptJSON,
};
