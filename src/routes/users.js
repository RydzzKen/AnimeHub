const express = require('express');
const data = require('../utils/dataStore');

const router = express.Router();

// AMBIL PROFIL USER LAIN
router.get('/users/:username', (req, res) => {
    const users = data.readUsers();
    const targetUser = users.find((u) => u.username === req.params.username);

    if (!targetUser) {
        return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    const isOwner = req.session && req.session.user && req.session.user.username === targetUser.username;

    if (isOwner) {
        const { password, ...fullProfile } = targetUser;
        return res.json(fullProfile);
    }

    // Public profile: jangan bocorkan history/favorites/rating/relasi.
    return res.json({
        username: targetUser.username,
        displayName: targetUser.displayName,
        avatar: targetUser.avatar || '',
        banner: targetUser.banner || '',
        bio: targetUser.bio || '',
        level: targetUser.level || 1,
        xp: targetUser.xp || 0,
        role: targetUser.role || 'user'
    });
});

module.exports = router;