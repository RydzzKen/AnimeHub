const express = require('express');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const data = require('../utils/dataStore');
const { isAuthenticated, handleValidationErrors } = require('../middleware/auth');
const { isSafeImageUrl } = require('../utils/validation');

const router = express.Router();

// ---- Strict rate limiting on credential endpoints (brute-force defence) ----
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.' }
});

// ---- In-memory account lockout (resets on restart) ----
const failedAttempts = new Map();

function isLocked(username) {
    const entry = failedAttempts.get(username);
    if (!entry) return false;
    if (entry.until && entry.until > Date.now()) return true;
    if (entry.until && entry.until <= Date.now()) failedAttempts.delete(username);
    return false;
}

function recordFailure(username) {
    const entry = failedAttempts.get(username) || { count: 0, until: 0 };
    entry.count += 1;
    if (entry.count >= 5) {
        entry.until = Date.now() + (15 * 60 * 1000);
        entry.count = 0;
    }
    failedAttempts.set(username, entry);
}

function clearFailure(username) {
    failedAttempts.delete(username);
}

function assertSafeImage(value) {
    return isSafeImageUrl(value);
}

// 1. API REGISTER
router.post('/register',
    authLimiter,
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

        const users = data.readUsers();

        // First-ever account becomes admin (secure bootstrap). The reserved
        // 'admin' username cannot be claimed afterwards.
        const isFirstUser = users.length === 0;
        if (username.toLowerCase() === 'admin' && !isFirstUser) {
            return res.json({ success: false, message: 'Username sudah terdaftar!' });
        }

        if (users.find((u) => u.username === username)) {
            return res.json({ success: false, message: 'Username sudah terdaftar!' });
        }

        const passwordHash = bcrypt.hashSync(password, 10);

        const newUser = {
            id: Date.now(),
            username,
            password: passwordHash,
            displayName: username,
            avatar: '',
            banner: '',
            bio: '',
            level: 1,
            xp: 0,
            role: isFirstUser ? 'admin' : 'user',
            friends: [],
            continueWatching: null
        };

        users.push(newUser);
        data.saveUsers(users);

        res.json({ success: true, message: 'Registrasi berhasil! Silakan login.' });
    });

// 2. API LOGIN
router.post('/login',
    authLimiter,
    [
        body('username').isString().trim().notEmpty().withMessage('Username wajib diisi.'),
        body('password').isString().notEmpty().withMessage('Password wajib diisi.')
    ],
    handleValidationErrors,
    (req, res) => {
        const { username, password } = req.body;
        let users = data.readUsers();
        let banned = data.readBanned();

        if (isLocked(username)) {
            return res.status(429).json({ success: false, message: 'Terlalu banyak percobaan gagal. Akun dikunci 15 menit.' });
        }

        const dummyHash = '$2a$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
        let user = users.find((u) => u.username === username);

        let passwordValid = false;
        if (user) {
            if (user.password && user.password.startsWith('$2')) {
                passwordValid = bcrypt.compareSync(password, user.password);
            } else {
                passwordValid = (user.password === password);
                if (passwordValid) {
                    user.password = bcrypt.hashSync(password, 10);
                    data.saveUsers(users);
                }
            }
        } else {
            bcrypt.compareSync(password || '', dummyHash);
        }

        if (!passwordValid) {
            recordFailure(username);
        }

        if (user && passwordValid) {
            clearFailure(username);
            const banEntry = banned.find((b) => b.username === username);

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
                        const updatedBanned = banned.filter((b) => b.username !== username);
                        data.saveBanned(updatedBanned);
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

        res.json({ success: false, message: 'Username atau password salah!' });
    });

// API: cek sesi user saat ini (digunakan panel admin)
router.get('/me', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Belum login' });
    }
    res.json({ success: true, user: req.session.user });
});

// API LOGOUT
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Gagal logout' });
        }
        res.json({ success: true, message: 'Logout berhasil!' });
    });
});

// API: Simpan Continue Watching ke Database Akun
router.post('/save-continue-watching', isAuthenticated, (req, res) => {
    const username = req.session.user.username;
    const { cwData, watchHistory } = req.body;

    if (!username) {
        return res.status(400).json({ success: false, message: 'Username tidak valid' });
    }

    let users = data.readUsers();
    const userIndex = users.findIndex((u) => u.username === username);

    if (userIndex !== -1) {
        users[userIndex].continueWatching = cwData || null;
        users[userIndex].watchHistory = watchHistory || null;

        data.saveUsers(users);
        return res.json({ success: true, message: 'Riwayat tontonan berhasil disimpan!' });
    } else {
        return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }
});

// 3. API UPDATE XP & LEVEL
router.post('/update-progress', isAuthenticated, (req, res) => {
    const username = req.session.user.username;
    const { xp, level } = req.body;
    let users = data.readUsers();
    let user = users.find((u) => u.username === username);

    if (user) {
        user.xp = Number.isFinite(Number(xp)) ? Math.max(0, parseInt(xp)) : (user.xp || 0);
        user.level = Number.isFinite(Number(level)) ? Math.max(1, parseInt(level)) : (user.level || 1);
        data.saveUsers(users);
        return res.json({ success: true });
    }

    res.status(404).json({ success: false, message: 'User tidak ditemukan' });
});

// 4. API UPDATE PROFILE
router.post('/update-profile',
    isAuthenticated,
    [
        body('displayName').optional({ values: 'falsy' }).isString().trim().isLength({ min: 3, max: 30 }).withMessage('Display name harus 3-30 karakter.'),
        body('bio').optional({ values: 'falsy' }).isString().isLength({ max: 300 }).withMessage('Bio maksimal 300 karakter.'),
        body('avatar').optional({ values: 'falsy' }).isString().custom(assertSafeImage).withMessage('Avatar tidak valid.'),
        body('banner').optional({ values: 'falsy' }).isString().custom(assertSafeImage).withMessage('Banner tidak valid.')
    ],
    handleValidationErrors,
    (req, res) => {
        const username = req.session.user.username;

        let users = data.readUsers();
        let user = users.find((u) => u.username === username);

        if (user) {
            if (req.body.displayName !== undefined && req.body.displayName) user.displayName = String(req.body.displayName).trim().slice(0, 30);
            if (req.body.avatar !== undefined && req.body.avatar) user.avatar = String(req.body.avatar).slice(0, 2000);
            if (req.body.banner !== undefined && req.body.banner) user.banner = String(req.body.banner).slice(0, 2000);
            if (req.body.bio !== undefined) user.bio = String(req.body.bio || '').slice(0, 300);

            data.saveUsers(users);

            const { password, ...updatedUserData } = user;
            return res.json({ success: true, message: 'Profil berhasil diperbarui!', user: updatedUserData });
        }

        res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    });

// 5. API GANTI PASSWORD
router.post('/change-password',
    authLimiter,
    isAuthenticated,
    [
        body('oldPassword').isString().notEmpty().withMessage('Password lama wajib diisi.'),
        body('newPassword').isString().isLength({ min: 6 }).withMessage('Password baru minimal 6 karakter.')
    ],
    handleValidationErrors,
    (req, res) => {
        const username = req.session.user.username;
        const { oldPassword, newPassword } = req.body;

        let users = data.readUsers();
        const userIndex = users.findIndex((u) => u.username === username);

        if (userIndex === -1) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }

        const user = users[userIndex];

        let oldValid = false;
        if (user.password && user.password.startsWith('$2')) {
            oldValid = bcrypt.compareSync(oldPassword, user.password);
        } else {
            oldValid = (user.password === oldPassword);
        }

        if (!oldValid) {
            return res.status(400).json({ success: false, message: 'Password lama salah!' });
        }

        if (oldPassword === newPassword) {
            return res.status(400).json({ success: false, message: 'Password baru harus berbeda dari password lama!' });
        }

        users[userIndex].password = bcrypt.hashSync(newPassword, 10);
        data.saveUsers(users);

        res.json({ success: true, message: 'Password berhasil diubah!' });
    });

module.exports = router;
