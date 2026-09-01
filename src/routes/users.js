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

    const { password, ...publicProfile } = targetUser;
    res.json(publicProfile);
});

module.exports = router;
