const express = require('express');
const data = require('../utils/dataStore');
const { isAdmin } = require('../middleware/auth');

const router = express.Router();

// API BAN & SUSPEND
router.post('/admin/suspend', isAdmin, (req, res) => {
    const { username, duration } = req.body;
    let banned = data.readBanned();
    let users = data.readUsers();

    const userExists = users.some((u) => u.username === username);
    if (!userExists) {
        return res.status(404).json({ success: false, message: 'User tidak ditemukan!' });
    }

    const existing = banned.find((b) => b.username === username);
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

    data.saveBanned(banned);
    res.json({ success: true, message: `User ${username} di-suspend selama ${duration || 24} jam.` });
});

router.post('/admin/ban', isAdmin, (req, res) => {
    const { username } = req.body;
    let banned = data.readBanned();
    let users = data.readUsers();

    const userExists = users.some((u) => u.username === username);
    if (!userExists) {
        return res.status(404).json({ success: false, message: 'User tidak ditemukan!' });
    }

    const existing = banned.find((b) => b.username === username);
    if (existing) {
        return res.json({ success: false, message: `User ${username} sudah dalam daftar banned/suspend!` });
    }

    banned.push({
        username: username,
        type: 'ban',
        bannedAt: new Date().toISOString()
    });

    data.saveBanned(banned);
    res.json({ success: true, message: `User ${username} berhasil di-ban permanen.` });
});

router.post('/admin/unban', isAdmin, (req, res) => {
    const { username } = req.body;
    let banned = data.readBanned();

    const index = banned.findIndex((b) => b.username === username);
    if (index === -1) {
        return res.json({ success: false, message: `User ${username} tidak ditemukan dalam daftar banned.` });
    }

    banned.splice(index, 1);
    data.saveBanned(banned);
    res.json({ success: true, message: `User ${username} berhasil di-unban.` });
});

router.get('/admin/banned-list', isAdmin, (req, res) => {
    let banned = data.readBanned();
    let users = data.readUsers();

    const enriched = banned.map((b) => {
        const user = users.find((u) => u.username === b.username);
        return {
            ...b,
            displayName: user?.displayName || b.username,
            level: user?.level || 1,
            isExpired: b.type === 'suspend' ? new Date(b.until) < new Date() : false
        };
    });

    res.json(enriched);
});

// API ADMIN: daftar user
router.get('/admin/users', isAdmin, (req, res) => {
    let users = data.readUsers();
    const safeUsers = users.map(({ password, ...u }) => u);
    res.json(safeUsers);
});

router.delete('/admin/users/:username', isAdmin, (req, res) => {
    const username = req.params.username;
    let users = data.readUsers();

    if (username === 'admin') {
        return res.status(400).json({ message: 'Akun Admin utama tidak bisa dihapus!' });
    }

    users = users.filter((u) => u.username !== username);
    data.saveUsers(users);
    res.json({ message: `User '${username}' berhasil dihapus.` });
});

module.exports = router;
