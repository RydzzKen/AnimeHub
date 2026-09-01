const express = require('express');
const { body } = require('express-validator');
const data = require('../utils/dataStore');
const { handleValidationErrors, isAuthenticated } = require('../middleware/auth');

const router = express.Router();

// Ambil daftar favorit user yang sedang login (id + data anime lengkap)
router.get('/favorites', isAuthenticated, (req, res) => {
    const username = req.session.user.username;
    let users = data.readUsers();
    const user = users.find((u) => u.username === username);

    if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });

    const favIds = user.favorites || [];
    const animeList = data.readAnime();
    const favorites = animeList.filter((a) => favIds.includes(a.id));

    res.json({ success: true, favorites, ids: favIds });
});

// Toggle favorit (tambah/hapus) berdasarkan animeId
router.post('/favorites/toggle',
    isAuthenticated,
    [
        body('animeId').isInt().withMessage('animeId tidak valid.')
    ],
    handleValidationErrors,
    (req, res) => {
        const username = req.session.user.username;
        const animeId = parseInt(req.body.animeId);

        let users = data.readUsers();
        const userIndex = users.findIndex((u) => u.username === username);
        if (userIndex === -1) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });

        const animeList = data.readAnime();
        if (!animeList.find((a) => a.id === animeId)) {
            return res.status(404).json({ success: false, message: 'Anime tidak ditemukan' });
        }

        const user = users[userIndex];
        if (!Array.isArray(user.favorites)) user.favorites = [];

        const idx = user.favorites.indexOf(animeId);
        const isFav = idx !== -1;
        if (isFav) {
            user.favorites.splice(idx, 1);
        } else {
            user.favorites.push(animeId);
        }

        data.setFavorite(username, animeId, !isFav);
        data.saveUsers(users);

        res.json({
            success: true,
            isFavorite: !isFav,
            favorites: user.favorites,
            message: isFav ? 'Dihapus dari favorit.' : 'Ditambahkan ke favorit.'
        });
    });

// Tentukan apakah anime merupakan favorit user (untuk inisialisasi tombol)
router.post('/favorites/status',
    isAuthenticated,
    [
        body('animeIds').isArray().withMessage('animeIds tidak valid.')
    ],
    handleValidationErrors,
    (req, res) => {
        const username = req.session.user.username;
        let users = data.readUsers();
        const user = users.find((u) => u.username === username);
        const favIds = (user && user.favorites) || [];
        const ids = (req.body.animeIds || []).map((x) => parseInt(x)).filter((n) => !isNaN(n));
        const status = {};
        ids.forEach((id) => { status[id] = favIds.includes(id); });
        res.json({ success: true, status });
    });

// Ambil daftar anime subscription user (+ status)
router.get('/subscriptions', isAuthenticated, (req, res) => {
    const username = req.session.user.username;
    const user = data.readUser(username);
    const subIds = (user && user.subscriptions) || [];
    const animeList = data.readAnime();
    const subscribed = animeList.filter((a) => subIds.includes(a.id));
    res.json({ success: true, subscriptions: subscribed, ids: subIds });
});

// Toggle subscribe anime (ikuti anime)
router.post('/subscriptions/toggle',
    isAuthenticated,
    [
        body('animeId').isInt().withMessage('animeId tidak valid.')
    ],
    handleValidationErrors,
    (req, res) => {
        const username = req.session.user.username;
        const animeId = parseInt(req.body.animeId);

        const animeList = data.readAnime();
        if (!animeList.find((a) => a.id === animeId)) {
            return res.status(404).json({ success: false, message: 'Anime tidak ditemukan' });
        }

        const user = data.readUser(username);
        if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });

        const subIds = user.subscriptions || [];
        const isSub = subIds.includes(animeId);

        data.setSubscription(username, animeId, !isSub);

        const updatedUser = data.readUser(username);
        res.json({
            success: true,
            isSubscribed: !isSub,
            subscriptions: updatedUser.subscriptions || [],
            message: isSub ? 'Berhenti berlangganan anime.' : 'Berlangganan anime.'
        });
    });

// Status subscribe untuk beberapa anime (inisialisasi tombol)
router.post('/subscriptions/status',
    isAuthenticated,
    [
        body('animeIds').isArray().withMessage('animeIds tidak valid.')
    ],
    handleValidationErrors,
    (req, res) => {
        const username = req.session.user.username;
        const user = data.readUser(username);
        const subIds = (user && user.subscriptions) || [];
        const ids = (req.body.animeIds || []).map((x) => parseInt(x)).filter((n) => !isNaN(n));
        const status = {};
        ids.forEach((id) => { status[id] = subIds.includes(id); });
        res.json({ success: true, status });
    });

module.exports = router;
