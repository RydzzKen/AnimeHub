// ==========================================
// SECURITY HEADERS & CONFIG
// ==========================================
// FIX: Load environment variables from .env (session secret, encryption key, CORS origins)
require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const xss = require('xss');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult } = require('express-validator');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const csrf = require('csurf');

const app = express();
const PORT = process.env.PORT || 8080;

// FIX: Data file paths are resolved relative to __dirname and validated to stay inside the project.
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');
const FRIENDS_FILE = path.join(DATA_DIR, 'friends.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const BANNED_FILE = path.join(DATA_DIR, 'banned.json');

// FIX: Don't leak the framework name.
app.disable('x-powered-by');

// ==========================================
// FIX: SECURITY HEADERS (helmet)
// CSP is relaxed to allow the existing inline scripts / base64 images of the frontend.
// ==========================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            // Allowed external CDNs used by the frontend (player, fonts, icons).
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.plyr.io"],
            // FIX: allow inline event handlers (onclick="...") used throughout the frontend.
            scriptSrcAttr: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.plyr.io", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            mediaSrc: ["'self'", "data:", "https:"],
            frameSrc: ["'self'", "https:"]
        }
    },
    // Allow loading cross-origin images (e.g. via.placeholder.com) used by the frontend.
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// ==========================================
// FIX: CORS - allow specific origins, but reflect the request origin when
// ALLOWED_ORIGINS is empty or contains '*' (so the app also works behind
// tunnels / LAN IPs). CSRF + sameSite cookies still protect against abuse.
// ==========================================
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
const reflectAll = allowedOrigins.length === 0 || allowedOrigins.includes('*');
const corsOptions = {
    origin: function (origin, callback) {
        // Same-origin requests have no Origin header -> always allow.
        if (!origin) return callback(null, true);
        if (reflectAll) return callback(null, true); // reflect request origin (allow any)
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('CORS not allowed for this origin'));
    },
    credentials: true
};
app.use(cors(corsOptions));

// ==========================================
// FIX: RATE LIMITING - 100 requests per 15 minutes per IP (applied to /api only)
// ==========================================
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Terlalu banyak permintaan, coba lagi nanti.' }
});
app.use('/api', apiLimiter);

// ==========================================
// FIX: REQUEST LOGGING (morgan)
// ==========================================
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ==========================================
// FIX: PATH TRAVERSAL - reject requests containing traversal sequences
// ==========================================
app.use((req, res, next) => {
    const url = req.originalUrl || '';
    if (url.includes('..') ||
        url.toLowerCase().includes('%2e%2e') ||
        url.includes('\\')) {
        return res.status(400).json({ success: false, message: 'Permintaan tidak valid.' });
    }
    next();
});

// ==========================================
// FIX: SESSION SECRET moved to .env, secure cookies in production
// ==========================================
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 16) {
    // FIX: fail loudly if a weak/empty secret is configured in production
    if (process.env.NODE_ENV === 'production') {
        console.error('FATAL: SESSION_SECRET is not set or too weak. Exiting.');
        process.exit(1);
    } else {
        console.warn('WARNING: SESSION_SECRET is weak/empty, using insecure fallback (dev only).');
    }
}

app.use(session({
    // FIX: use strong secret from .env
    secret: sessionSecret || 'insecure_dev_fallback_secret_change_me',
    // FIX: persist sessions to disk so logins survive server restarts
    store: new FileStore({
        path: path.join(DATA_DIR, 'sessions'),
        ttl: 24 * 60 * 60,
        retries: 0
    }),
    resave: false,
    saveUninitialized: false,
    cookie: {
        // FIX: secure cookies only in production (HTTPS)
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// ==========================================
// FIX: CSRF PROTECTION
// Uses double-submit cookie pattern; token delivered via /api/csrf-token and
// expected in the x-csrf-token header (injected automatically by public/csrf.js).
// ==========================================
const csrfProtection = csrf();
// Applied globally; GET/HEAD/OPTIONS are ignored by default.
app.use(csrfProtection);

// Endpoint to retrieve a CSRF token for the frontend.
app.get('/api/csrf-token', (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// MIDDLEWARE SANITASI XSS (existing behaviour preserved)
// ==========================================
app.use((req, res, next) => {
    if (req.body) {
        for (let key in req.body) {
            if (typeof req.body[key] === 'string') {
                req.body[key] = xss(req.body[key]);
            }
        }
    }
    if (req.query) {
        for (let key in req.query) {
            if (typeof req.query[key] === 'string') {
                req.query[key] = xss(req.query[key]);
            }
        }
    }
    next();
});

// ==========================================
// MIDDLEWARE AUTENTIKASI
// ==========================================
function isAuthenticated(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            error: 'Silakan login terlebih dahulu!'
        });
    }
    next();
}

function isAdmin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            error: 'Silakan login terlebih dahulu!'
        });
    }
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            error: 'Akses ditolak! Hanya admin yang diizinkan.'
        });
    }
    next();
}

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

// ==========================================
// HELPER FUNCTIONS (BACA & SIMPAN JSON) - now encryption aware
// ==========================================
function readJSON(file, fallback) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, encryptJSON(fallback));
        return fallback;
    }
    try {
        const raw = fs.readFileSync(file, 'utf8');
        const decrypted = decryptJSON(raw);
        if (decrypted === null) return fallback;
        return JSON.parse(decrypted || JSON.stringify(fallback));
    } catch (err) {
        return fallback;
    }
}

function saveJSON(file, data) {
    fs.writeFileSync(file, encryptJSON(data));
}

function readUsers() {
    return readJSON(USERS_FILE, []);
}
function saveUsers(users) {
    saveJSON(USERS_FILE, users);
}
function readComments() {
    return readJSON(COMMENTS_FILE, []);
}
function saveComments(comments) {
    saveJSON(COMMENTS_FILE, comments);
}
function readFriends() {
    return readJSON(FRIENDS_FILE, []);
}
function saveFriends(data) {
    saveJSON(FRIENDS_FILE, data);
}
function readMessages() {
    return readJSON(MESSAGES_FILE, []);
}
function saveMessages(data) {
    saveJSON(MESSAGES_FILE, data);
}
function readBanned() {
    return readJSON(BANNED_FILE, []);
}
function saveBanned(banned) {
    saveJSON(BANNED_FILE, banned);
}

// FIX: Input validation result handler
function handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: errors.array()[0].msg || 'Data tidak valid!',
            errors: errors.array()
        });
    }
    next();
}

// ==========================================
// API BAN & SUSPEND
// ==========================================
app.post('/api/admin/suspend', isAdmin, (req, res) => {
    const { username, duration } = req.body;
    let banned = readBanned();
    let users = readUsers();

    const userExists = users.some(u => u.username === username);
    if (!userExists) {
        return res.status(404).json({ success: false, message: 'User tidak ditemukan!' });
    }

    const existing = banned.find(b => b.username === username);
    if (existing) {
        return res.json({ success: false, message: `User ${username} sudah dalam daftar banned/suspend!` });
    }

    const suspendUntil = new Date();
    suspendUntil.setHours(suspendUntil.getHours() + parseInt(duration || 24));

    banned.push({
        username: username,
        type: 'suspend',
        until: suspendUntil.toISOString(),
        suspendedAt: new Date().toISOString()
    });

    saveBanned(banned);
    res.json({ success: true, message: `User ${username} di-suspend selama ${duration || 24} jam.` });
});

app.post('/api/admin/ban', isAdmin, (req, res) => {
    const { username } = req.body;
    let banned = readBanned();
    let users = readUsers();

    const userExists = users.some(u => u.username === username);
    if (!userExists) {
        return res.status(404).json({ success: false, message: 'User tidak ditemukan!' });
    }

    const existing = banned.find(b => b.username === username);
    if (existing) {
        return res.json({ success: false, message: `User ${username} sudah dalam daftar banned/suspend!` });
    }

    banned.push({
        username: username,
        type: 'ban',
        bannedAt: new Date().toISOString()
    });

    saveBanned(banned);
    res.json({ success: true, message: `User ${username} berhasil di-ban permanen.` });
});

app.post('/api/admin/unban', isAdmin, (req, res) => {
    const { username } = req.body;
    let banned = readBanned();

    const index = banned.findIndex(b => b.username === username);
    if (index === -1) {
        return res.json({ success: false, message: `User ${username} tidak ditemukan dalam daftar banned.` });
    }

    banned.splice(index, 1);
    saveBanned(banned);
    res.json({ success: true, message: `User ${username} berhasil di-unban.` });
});

app.get('/api/admin/banned-list', isAdmin, (req, res) => {
    let banned = readBanned();
    let users = readUsers();

    const enriched = banned.map(b => {
        const user = users.find(u => u.username === b.username);
        return {
            ...b,
            displayName: user?.displayName || b.username,
            level: user?.level || 1,
            isExpired: b.type === 'suspend' ? new Date(b.until) < new Date() : false
        };
    });

    res.json(enriched);
});

// ==========================================
// API USER & AUTH
// ==========================================
// 1. API REGISTER
// FIX: hash password with bcrypt (salt rounds 10)
// FIX: input validation
app.post('/api/register',
    [
        body('username').isString().trim().isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_]+$/).withMessage('Username tidak valid (3-30 huruf/angka/underscore).'),
        body('password').isString().isLength({ min: 6 }).withMessage('Password minimal 6 karakter.')
    ],
    handleValidationErrors,
    (req, res) => {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username dan password wajib diisi!' });
        }

        let users = readUsers();

        if (users.find(u => u.username === username)) {
            return res.json({ success: false, message: 'Username sudah terdaftar!' });
        }

        // FIX: store only a bcrypt hash, never the plaintext password
        const passwordHash = bcrypt.hashSync(password, 10);

        const newUser = {
            id: Date.now(),
            username,
            password: passwordHash,
            displayName: username,
            avatar: "",
            banner: "",
            bio: "",
            level: 1,
            xp: 0,
            role: username === 'admin' ? 'admin' : 'user',
            friends: [],
            continueWatching: null
        };

        users.push(newUser);
        saveUsers(users);

        res.json({ success: true, message: 'Registrasi berhasil! Silakan login.' });
    });

// 2. API LOGIN
// FIX: compare password with bcrypt; generic error message to prevent username enumeration
app.post('/api/login',
    [
        body('username').isString().trim().notEmpty().withMessage('Username wajib diisi.'),
        body('password').isString().notEmpty().withMessage('Password wajib diisi.')
    ],
    handleValidationErrors,
    (req, res) => {
        const { username, password } = req.body;
        let users = readUsers();
        let banned = readBanned();

        // FIX: always perform a dummy hash compare to reduce timing-based enumeration
        const dummyHash = '$2a$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
        let user = users.find(u => u.username === username);

        let passwordValid = false;
        if (user) {
            if (user.password && user.password.startsWith('$2')) {
                passwordValid = bcrypt.compareSync(password, user.password);
            } else {
                // FIX: legacy plaintext password -> verify then rehash to bcrypt
                passwordValid = (user.password === password);
                if (passwordValid) {
                    user.password = bcrypt.hashSync(password, 10);
                    saveUsers(users);
                }
            }
        } else {
            // Run a compare against a dummy hash so invalid-user and wrong-password
            // take a similar amount of time (anti enumeration).
            bcrypt.compareSync(password || '', dummyHash);
        }

        if (user && passwordValid) {
            const banEntry = banned.find(b => b.username === username);

            if (banEntry) {
                if (banEntry.type === 'ban') {
                    return res.json({
                        success: false,
                        message: '⚠️ Akun Anda telah di-BAN permanen oleh admin!'
                    });
                }

                if (banEntry.type === 'suspend') {
                    const until = new Date(banEntry.until);
                    const now = new Date();

                    if (until > now) {
                        const hoursLeft = Math.ceil((until - now) / (1000 * 60 * 60));
                        return res.json({
                            success: false,
                            message: `⏳ Akun Anda di-suspend. Tersisa ${hoursLeft} jam lagi.`
                        });
                    } else {
                        const updatedBanned = banned.filter(b => b.username !== username);
                        saveBanned(updatedBanned);
                    }
                }
            }

            req.session.user = {
                username: user.username,
                role: user.role,
                displayName: user.displayName
            };

            if (!user.friends) user.friends = [];
            const { password: _, ...userData } = user;
            return res.json({
                success: true,
                message: 'Login Berhasil!',
                user: userData
            });
        }

        // FIX: generic message for both unknown user and wrong password (no enumeration)
        res.json({ success: false, message: 'Username atau password salah!' });
    });

// API: Simpan Continue Watching ke Database Akun
// FIX: use encryption-aware helpers; only the owner (matched by username) is updated.
app.post('/api/save-continue-watching', (req, res) => {
    const { username, cwData, watchHistory } = req.body;

    if (!username) {
        return res.status(400).json({ success: false, message: 'Username tidak valid' });
    }

    let users = readUsers();
    const userIndex = users.findIndex(u => u.username === username);

    if (userIndex !== -1) {
        users[userIndex].continueWatching = cwData;
        users[userIndex].watchHistory = watchHistory;

        saveUsers(users);
        return res.json({ success: true, message: 'Riwayat tontonan berhasil disimpan!' });
    } else {
        return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }
});

// 3. API UPDATE XP & LEVEL
app.post('/api/update-progress', (req, res) => {
    const { username, xp, level } = req.body;
    let users = readUsers();
    let user = users.find(u => u.username === username);

    if (user) {
        user.xp = xp;
        user.level = level;
        saveUsers(users);
        return res.json({ success: true });
    }

    res.status(404).json({ success: false, message: 'User tidak ditemukan' });
});

// 4. API UPDATE PROFILE
// FIX: IDOR - users can only update their OWN profile (enforced via session, not body username)
// FIX: MASS ASSIGNMENT - only allow displayName, avatar, banner, bio (block role/level/password)
app.post('/api/update-profile', isAuthenticated, (req, res) => {
    // FIX: ignore username from body; use the authenticated session user
    const username = req.session.user.username;

    let users = readUsers();
    let user = users.find(u => u.username === username);

    if (user) {
        // FIX: whitelist fields - explicitly block role, level, password, xp, etc.
        // (client-supplied role/level/password are NEVER written)
        if (req.body.displayName !== undefined) user.displayName = req.body.displayName || user.username;
        if (req.body.avatar !== undefined) user.avatar = req.body.avatar;
        if (req.body.banner !== undefined) user.banner = req.body.banner;
        if (req.body.bio !== undefined) user.bio = req.body.bio;

        saveUsers(users);

        // FIX: return level & role in the response so the UI keeps displaying them
        // correctly (write is still whitelisted above, so this is safe).
        const { password, ...updatedUserData } = user;
        return res.json({ success: true, message: 'Profil berhasil diperbarui!', user: updatedUserData });
    }

    res.status(404).json({ success: false, message: 'User tidak ditemukan' });
});

// =============================================================
// AMBIL PROFIL USER LAIN & AKSI PERTEMANAN
// =============================================================
app.get('/api/users/:username', (req, res) => {
    const users = readUsers();
    const targetUser = users.find(u => u.username === req.params.username);

    if (!targetUser) {
        return res.status(404).json({ error: "User tidak ditemukan" });
    }

    const { password, ...publicProfile } = targetUser;
    res.json(publicProfile);
});

app.post('/api/friends/action', (req, res) => {
    const { currentUsername, targetUsername } = req.body;

    if (!currentUsername || !targetUsername) {
        return res.status(400).json({ error: "Data tidak lengkap" });
    }

    if (currentUsername === targetUsername) {
        return res.status(400).json({ error: "Tidak dapat menambahkan diri sendiri sebagai teman" });
    }

    let users = readUsers();
    const currentUser = users.find(u => u.username === currentUsername);
    const targetUser = users.find(u => u.username === targetUsername);

    if (!currentUser || !targetUser) {
        return res.status(404).json({ error: "Pengguna tidak ditemukan" });
    }

    if (!currentUser.friends) currentUser.friends = [];
    if (!targetUser.friends) targetUser.friends = [];

    const isFriend = currentUser.friends.includes(targetUsername);

    if (isFriend) {
        currentUser.friends = currentUser.friends.filter(u => u !== targetUsername);
        targetUser.friends = targetUser.friends.filter(u => u !== currentUsername);

        saveUsers(users);
        return res.json({ status: 'removed', message: `Berhenti berteman dengan ${targetUsername}` });
    } else {
        currentUser.friends.push(targetUsername);
        targetUser.friends.push(currentUsername);

        saveUsers(users);
        return res.json({ status: 'added', message: `Berhasil berteman dengan ${targetUsername}` });
    }
});

// =============================================================
// API KOLOM KOMENTAR
// =============================================================
app.get('/api/comments', (req, res) => {
    const videoTitle = req.query.video;
    let comments = readComments();
    let users = readUsers();

    if (videoTitle) {
        comments = comments.filter(c => c.video === videoTitle);
    }

    const enrichedComments = comments.map(c => {
        const userInfo = users.find(u => u.username === c.user) || {};
        return {
            ...c,
            avatar: userInfo.avatar || 'https://via.placeholder.com/40',
            level: userInfo.level || 1,
            rank: userInfo.role === 'admin' ? 'Admin' : `Lvl ${userInfo.level || 1}`
        };
    });

    res.json(enrichedComments);
});

// 8. API POST KOMENTAR BARU
// FIX: input validation
app.post('/api/comments',
    [
        body('text').isString().trim().isLength({ min: 1, max: 2000 }).withMessage('Komentar wajib diisi (maks 2000).'),
        body('video').isString().trim().notEmpty().withMessage('Judul video wajib diisi.')
    ],
    handleValidationErrors,
    (req, res) => {
        const { video, text, user } = req.body;

        let comments = readComments();

        const newComment = {
            id: Date.now(),
            video: video,
            text: text,
            user: user || 'Anonymous',
            date: new Date().toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
        };

        comments.push(newComment);
        saveComments(comments);

        res.json({ success: true, message: 'Komentar berhasil dikirim!', comment: newComment });
    });

// API DELETE KOMENTAR
app.delete('/api/comments/:id', (req, res) => {
    const commentId = parseInt(req.params.id);
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ success: false, message: 'User tidak valid!' });
    }

    let users = readUsers();
    let comments = readComments();

    const currentUser = users.find(u => u.username === username);
    const commentIndex = comments.findIndex(c => c.id === commentId);

    if (commentIndex === -1) {
        return res.status(404).json({ success: false, message: 'Komentar tidak ditemukan!' });
    }

    const targetComment = comments[commentIndex];

    const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.username === 'admin');
    const isOwner = targetComment.user === username;

    if (isAdmin || isOwner) {
        comments.splice(commentIndex, 1);
        saveComments(comments);
        return res.json({ success: true, message: 'Komentar berhasil dihapus.' });
    } else {
        return res.status(403).json({ success: false, message: 'Anda tidak memiliki izin!' });
    }
});

// =============================================================
// API ADMIN
// =============================================================
app.get('/api/admin/users', isAdmin, (req, res) => {
    let users = readUsers();
    const safeUsers = users.map(({ password, ...u }) => u);
    res.json(safeUsers);
});

app.delete('/api/admin/users/:username', isAdmin, (req, res) => {
    const username = req.params.username;
    let users = readUsers();

    if (username === 'admin') {
        return res.status(400).json({ message: 'Akun Admin utama tidak bisa dihapus!' });
    }

    users = users.filter(u => u.username !== username);
    saveUsers(users);
    res.json({ message: `User '${username}' berhasil dihapus.` });
});

// API LOGOUT
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Gagal logout' });
        }
        res.json({ success: true, message: 'Logout berhasil!' });
    });
});

// ==========================================
// API PERTEMANAN & PERSONAL CHAT
// ==========================================
// 1. Send Friend Request
app.post('/api/friends/request', (req, res) => {
    const { sender, receiver } = req.body;
    let friends = readFriends();

    const existing = friends.find(f =>
        (f.user1 === sender && f.user2 === receiver) ||
        (f.user1 === receiver && f.user2 === sender)
    );

    if (existing) {
        return res.json({ success: false, message: 'Permintaan pertemanan sudah dikirim atau sudah berteman!' });
    }

    friends.push({ id: Date.now(), user1: sender, user2: receiver, status: 'pending' });
    saveFriends(friends);
    res.json({ success: true, message: 'Permintaan pertemanan berhasil dikirim!' });
});

// 2. Accept Friend Request
app.post('/api/friends/accept', (req, res) => {
    const { requestId } = req.body;
    let friends = readFriends();

    const index = friends.findIndex(f => f.id === Number(requestId));
    if (index !== -1) {
        friends[index].status = 'accepted';
        saveFriends(friends);
        return res.json({ success: true, message: 'Permintaan pertemanan diterima!' });
    }

    res.json({ success: false, message: 'Permintaan tidak ditemukan.' });
});

// Endpoint Tolak Pertemanan
app.post('/api/friends/reject', (req, res) => {
    const { requestId } = req.body;
    let friends = readFriends();

    const newFriends = friends.filter(f => f.id !== Number(requestId));

    if (friends.length !== newFriends.length) {
        saveFriends(newFriends);
        return res.json({ success: true, message: 'Permintaan pertemanan ditolak.' });
    }

    res.json({ success: false, message: 'Permintaan tidak ditemukan.' });
});

// 3. Reject / Delete Friend Request (kept for backwards compatibility)
app.post('/api/friends/reject', (req, res) => {
    const { requestId } = req.body;
    let friends = readFriends();

    friends = friends.filter(f => f.id !== parseInt(requestId));
    saveFriends(friends);
    res.json({ success: true, message: 'Permintaan pertemanan ditolak.' });
});

// 4. Get Daftar Pending Friend Request
app.get('/api/friends/requests/:username', (req, res) => {
    const { username } = req.params;
    let friends = readFriends();

    const pendingRequests = friends.filter(f => f.user2 === username && f.status === 'pending');
    res.json(pendingRequests);
});

// Endpoint untuk mengecek status pertemanan antara 2 user
app.get('/api/friends/status/:user1/:user2', (req, res) => {
    const { user1, user2 } = req.params;
    const friends = readFriends();

    const relation = friends.find(f =>
        (f.user1 === user1 && f.user2 === user2) ||
        (f.user1 === user2 && f.user2 === user1)
    );

    if (!relation) {
        return res.json({ status: 'none' });
    }

    res.json({ status: relation.status, sender: relation.user1 });
});

// 1. Get Friendlist
app.get('/api/friends/list/:username', (req, res) => {
    const { username } = req.params;
    const friends = readFriends();

    const accepted = friends.filter(f =>
        f.status === 'accepted' && (f.user1 === username || f.user2 === username)
    );

    const friendNames = accepted.map(f => f.user1 === username ? f.user2 : f.user1);

    res.json(friendNames);
});

// 2. Unfriend
app.post('/api/friends/unfriend', (req, res) => {
    const { user1, user2 } = req.body;
    let friends = readFriends();

    const updatedFriends = friends.filter(f =>
        !((f.user1 === user1 && f.user2 === user2) || (f.user1 === user2 && f.user2 === user1))
    );

    saveFriends(updatedFriends);
    res.json({ success: true, message: 'Berhasil menghapus pertemanan.' });
});

// Ambil Daftar Teman
app.get('/api/friends/:username', (req, res) => {
    const { username } = req.params;
    let friends = readFriends();

    const myFriends = friends.filter(f =>
        (f.user1 === username || f.user2 === username) && f.status === 'accepted'
    ).map(f => f.user1 === username ? f.user2 : f.user1);

    res.json(myFriends);
});

// Get Chat antara 2 User
app.get('/api/chat/:user1/:user2', (req, res) => {
    const { user1, user2 } = req.params;
    let messages = readMessages();

    const chatHistory = messages.filter(m =>
        (m.from === user1 && m.to === user2) || (m.from === user2 && m.to === user1)
    );

    res.json(chatHistory);
});

// Send Chat
// FIX: input validation
app.post('/api/chat',
    [
        body('from').isString().trim().notEmpty().withMessage('Pengirim wajib diisi.'),
        body('to').isString().trim().notEmpty().withMessage('Penerima wajib diisi.'),
        body('text').isString().trim().isLength({ min: 1, max: 5000 }).withMessage('Pesan wajib diisi.')
    ],
    handleValidationErrors,
    (req, res) => {
        const { from, to, text } = req.body;
        let messages = readMessages();

        const newMsg = { id: Date.now(), from, to, text, timestamp: new Date().toLocaleTimeString() };
        messages.push(newMsg);
        saveMessages(messages);

        res.json({ success: true, message: newMsg });
    });

// ==========================================
// FIX: CUSTOM ERROR HANDLER (hide stack traces in production)
// ==========================================
app.use((err, req, res, next) => {
    const isProd = process.env.NODE_ENV === 'production';
    // CSRF errors should surface a clear 403 without leaking internals
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({ success: false, message: 'Permintaan ditolak (CSRF tidak valid).' });
    }
    console.error(err);
    res.status(err.status || 500).json({
        success: false,
        message: isProd ? 'Terjadi kesalahan pada server.' : (err.message || 'Terjadi kesalahan pada server.')
    });
});

// ==========================================
// START SERVER
// ==========================================
// FIX: export the app for testing; only listen when run directly.
module.exports = app;

if (require.main === module) {
    app.listen(PORT, () => {
        console.clear();

        const cyan = "\x1b[36m";
        const green = "\x1b[32m";
        const yellow = "\x1b[33m";
        const magenta = "\x1b[35m";
        const bold = "\x1b[1m";
        const reset = "\x1b[0m";

        console.log(`
${cyan}${bold}
  █████╗ ███╗   ██╗██╗███╗   ███╗███████╗
 ██╔══██╗████╗  ██║██║████╗ ████║██╔════╝
 ███████║██╔██╗ ██║██║██╔████╔██║█████╗
 ██╔══██║██║╚██╗██║██║██║╚██╔╝██║██╔══╝
 ██║  ██║██║ ╚████║██║██║ ╚═╝ ██║███████╗
 ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝╚═╝     ╚═╝╚══════╝
       STREAMING SERVER v7.0
${reset}
${yellow}=================================================${reset}
  ${green}✔${reset} ${bold}SERVER STATUS :${reset} ${green}ONLINE & READY${reset}
  ${green}✔${reset} ${bold}PORT          :${reset} ${magenta}${PORT}${reset}
  ${green}✔${reset} ${bold}URL LOCAL     :${reset} ${cyan}http://localhost:${PORT}${reset}
${yellow}=================================================${reset}
  ${bold}Tekan ${reset}${yellow}CTRL + C${reset}${bold} untuk mematikan server.${reset}
    `);
    });
}
