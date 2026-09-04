const express = require('express');
const { body } = require('express-validator');
const data = require('../utils/dataStore');
const { isAuthenticated, handleValidationErrors } = require('../middleware/auth');
const push = require('../utils/push');

const router = express.Router();

// 1. Send Friend Request
router.post('/friends/request', isAuthenticated, (req, res) => {
    const sender = req.session.user.username;
    const { receiver } = req.body;

    if (typeof receiver !== 'string' || !receiver.trim() || receiver === sender) {
        return res.status(400).json({ success: false, message: 'Penerima tidak valid.' });
    }

    let friends = data.readFriends();

    const existing = friends.find((f) =>
        (f.user1 === sender && f.user2 === receiver) ||
        (f.user1 === receiver && f.user2 === sender)
    );

    if (existing) {
        return res.json({ success: false, message: 'Permintaan pertemanan sudah dikirim atau sudah berteman!' });
    }

    friends.push({ id: Date.now(), user1: sender, user2: receiver, status: 'pending' });
    data.saveFriends(friends);
    res.json({ success: true, message: 'Permintaan pertemanan berhasil dikirim!' });

    // Notifikasi push ke penerima
    const users = data.readUsers();
    const senderUser = users.find((u) => u.username === sender);
    const senderName = (senderUser && senderUser.displayName) || sender;
    push.sendToUser(receiver, {
        title: '🔔 Permintaan Teman Baru',
        body: `${senderName} mengirim permintaan pertemanan.`,
        url: '/index.html'
    });
});

// 2. Accept Friend Request (hanya penerima yang boleh accept)
router.post('/friends/accept', isAuthenticated, (req, res) => {
    const { requestId } = req.body;
    const username = req.session.user.username;
    let friends = data.readFriends();

    const index = friends.findIndex((f) => f.id === Number(requestId));
    if (index !== -1 && friends[index].user2 === username) {
        friends[index].status = 'accepted';
        data.saveFriends(friends);
        return res.json({ success: true, message: 'Permintaan pertemanan diterima!' });
    }

    res.json({ success: false, message: 'Permintaan tidak ditemukan.' });
});

// Endpoint Tolak Pertemanan (hanya penerima yang boleh tolak)
router.post('/friends/reject', isAuthenticated, (req, res) => {
    const { requestId } = req.body;
    const username = req.session.user.username;
    let friends = data.readFriends();

    const target = friends.find((f) => f.id === Number(requestId));
    if (!target || target.user2 !== username) {
        return res.json({ success: false, message: 'Permintaan tidak ditemukan.' });
    }

    const newFriends = friends.filter((f) => f.id !== Number(requestId));
    data.saveFriends(newFriends);
    return res.json({ success: true, message: 'Permintaan pertemanan ditolak.' });
});

// Get Daftar Pending Friend Request
router.get('/friends/requests/:username', isAuthenticated, (req, res) => {
    const { username } = req.params;
    if (username !== req.session.user.username) {
        return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }
    let friends = data.readFriends();

    const pendingRequests = friends.filter((f) => f.user2 === username && f.status === 'pending');
    res.json(pendingRequests);
});

// Endpoint untuk mengecek status pertemanan antara 2 user
router.get('/friends/status/:user1/:user2', isAuthenticated, (req, res) => {
    const { user1, user2 } = req.params;
    const friends = data.readFriends();

    const relation = friends.find((f) =>
        (f.user1 === user1 && f.user2 === user2) ||
        (f.user1 === user2 && f.user2 === user1)
    );

    if (!relation) {
        return res.json({ status: 'none' });
    }

    res.json({ status: relation.status, sender: relation.user1 });
});

// 1. Get Friendlist
router.get('/friends/list/:username', isAuthenticated, (req, res) => {
    const { username } = req.params;
    if (username !== req.session.user.username) {
        return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }
    const friends = data.readFriends();

    const accepted = friends.filter((f) =>
        f.status === 'accepted' && (f.user1 === username || f.user2 === username)
    );

    const friendNames = accepted.map((f) => f.user1 === username ? f.user2 : f.user1);

    res.json(friendNames);
});

// 2. Unfriend
router.post('/friends/unfriend', isAuthenticated, (req, res) => {
    const current = req.session.user.username;
    const { user2 } = req.body;

    if (typeof user2 !== 'string' || !user2.trim() || user2 === current) {
        return res.status(400).json({ success: false, message: 'Parameter tidak valid.' });
    }

    let friends = data.readFriends();

    const updatedFriends = friends.filter((f) =>
        !((f.user1 === current && f.user2 === user2) || (f.user1 === user2 && f.user2 === current))
    );

    data.saveFriends(updatedFriends);
    res.json({ success: true, message: 'Berhasil menghapus pertemanan.' });
});

// Ambil Daftar Teman
router.get('/friends/:username', isAuthenticated, (req, res) => {
    const { username } = req.params;
    if (username !== req.session.user.username) {
        return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }
    let friends = data.readFriends();

    const myFriends = friends.filter((f) =>
        (f.user1 === username || f.user2 === username) && f.status === 'accepted'
    ).map((f) => f.user1 === username ? f.user2 : f.user1);

    res.json(myFriends);
});

// Get Chat antara 2 User (harus salah satu peserta)
router.get('/chat/:user1/:user2', isAuthenticated, (req, res) => {
    const { user1, user2 } = req.params;
    const current = req.session.user.username;

    if (current !== user1 && current !== user2) {
        return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }

    let messages = data.readMessages();

    const chatHistory = messages.filter((m) =>
        (m.from === user1 && m.to === user2) || (m.from === user2 && m.to === user1)
    );

    res.json(chatHistory);
});

// Send Chat
router.post('/chat',
    isAuthenticated,
    [
        body('to').isString().trim().notEmpty().withMessage('Penerima wajib diisi.'),
        body('text').isString().trim().isLength({ min: 1, max: 5000 }).withMessage('Pesan wajib diisi.')
    ],
    handleValidationErrors,
    (req, res) => {
        const from = req.session.user.username;
        const { to, text } = req.body;
        let messages = data.readMessages();

        const newMsg = { id: Date.now(), from, to, text, timestamp: new Date().toLocaleTimeString() };
        messages.push(newMsg);
        data.saveMessages(messages);

        res.json({ success: true, message: newMsg });

        // Notifikasi push ke penerima chat
        const users = data.readUsers();
        const fromUser = users.find((u) => u.username === from);
        const fromName = (fromUser && fromUser.displayName) || from;
        push.sendToUser(to, {
            title: `💬 ${fromName}`,
            body: text.slice(0, 100),
            url: '/index.html'
        });
    });

module.exports = router;