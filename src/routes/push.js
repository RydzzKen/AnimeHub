const express = require('express');
const { body } = require('express-validator');
const { handleValidationErrors, isAuthenticated } = require('../middleware/auth');
const push = require('../utils/push');

const router = express.Router();

// Ekspose public key VAPID untuk frontend
router.get('/push/vapid-public-key', (req, res) => {
    if (!push.vapidPublicKey) {
        return res.status(500).json({ success: false, message: 'VAPID key belum dikonfigurasi di .env' });
    }
    res.json({ success: true, publicKey: push.vapidPublicKey });
});

// Simpan subscription push milik user yang sedang login
router.post('/push/subscribe',
    isAuthenticated,
    [
        body('subscription').isObject().withMessage('Subscription tidak valid.')
    ],
    handleValidationErrors,
    (req, res) => {
        const username = req.session.user.username;
        push.subscribeUser(username, req.body.subscription);
        res.json({ success: true, message: 'Berhasil berlangganan notifikasi.' });
    });

// Hapus subscription push milik user
router.post('/push/unsubscribe',
    isAuthenticated,
    [
        body('subscription').optional().isObject()
    ],
    handleValidationErrors,
    (req, res) => {
        const username = req.session.user.username;
        push.unsubscribeUser(username, req.body.subscription || null);
        res.json({ success: true, message: 'Berhenti berlangganan notifikasi.' });
    });

module.exports = router;
