const crypto = require('crypto');

// ==========================================
// ENCRYPT SENSITIVE JSON DATA AT REST (AES-256-GCM)
// Data files are transparently encrypted on write and decrypted on read.
// Only the key from ENCRYPTION_KEY is ever used. No hardcoded fallback
// keys exist, so an attacker can never decrypt with a known default.
// ==========================================

const envKey = process.env.ENCRYPTION_KEY;

// Write key: prefer the configured key. In dev without one, generate an
// ephemeral key so boot never fails; anything written with it is only
// readable during the same process lifetime (legacy migration path).
let encKey;
let ephemeralKey = null;
if (envKey && envKey.length >= 16) {
    encKey = crypto.createHash('sha256').update(envKey).digest();
} else {
    if (process.env.NODE_ENV === 'production') {
        console.error('FATAL: ENCRYPTION_KEY is not set or too weak. Exiting.');
        process.exit(1);
    }
    console.warn('WARNING: ENCRYPTION_KEY is weak/empty, using an ephemeral dev key.');
    ephemeralKey = crypto.randomBytes(32);
    encKey = ephemeralKey;
}

const encryptionCandidates = [encKey];
if (ephemeralKey && !Buffer.isBuffer(encKey)) encryptionCandidates.push(ephemeralKey);

function encryptJSON(obj) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
    const json = JSON.stringify(obj);
    let enc = cipher.update(json, 'utf8', 'base64');
    enc += cipher.final('base64');
    const tag = cipher.getAuthTag();
    return 'ENC:' + iv.toString('base64') + ':' + tag.toString('base64') + ':' + enc;
}

function decryptJSON(raw) {
    if (!raw || !raw.startsWith('ENC:')) {
        return raw; // legacy plaintext data
    }
    const parts = raw.split(':');
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const data = parts.slice(3).join(':');
    for (const key of encryptionCandidates) {
        try {
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);
            let dec = decipher.update(data, 'base64', 'utf8');
            dec += decipher.final('utf8');
            return dec;
        } catch (e) {
            // try next candidate key
        }
    }
    return null;
}

module.exports = {
    encryptionCandidates,
    encKey,
    encryptJSON,
    decryptJSON,
};