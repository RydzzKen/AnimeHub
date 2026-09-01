const crypto = require('crypto');

// ==========================================
// FIX: ENCRYPT SENSITIVE JSON DATA AT REST (AES-256-GCM)
// Data files are transparently encrypted on write and decrypted on read.
// Existing plaintext files are migrated automatically on first save.
// ==========================================
// FIX: build a list of candidate keys so reads never fail catastrophically if the
// active key differs from the one used to write the file (prevents silent data loss).
const encryptionCandidates = [];
if (process.env.ENCRYPTION_KEY) {
    encryptionCandidates.push(crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest());
}
encryptionCandidates.push(crypto.createHash('sha256').update('insecure_dev_fallback_encryption_key_change_me').digest());
// key historically used by migration scripts that fell back to 'x'
encryptionCandidates.push(crypto.createHash('sha256').update('x').digest());

// Key used for WRITING: prefer the configured one, otherwise the dev fallback.
const encKey = process.env.ENCRYPTION_KEY
    ? crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest()
    : crypto.createHash('sha256').update('insecure_dev_fallback_encryption_key_change_me').digest();

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
    // FIX: try every candidate key before giving up.
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
    // Corrupted/encrypted data we can't read with any key -> return null (caller uses safe default)
    return null;
}

module.exports = {
    encryptionCandidates,
    encKey,
    encryptJSON,
    decryptJSON,
};
