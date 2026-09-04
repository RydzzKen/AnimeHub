const express = require('express');
const { body } = require('express-validator');
const data = require('../utils/dataStore');
const { isAuthenticated, handleValidationErrors } = require('../middleware/auth');

const router = express.Router();

// API KOLOM KOMENTAR (GET)
router.get('/comments', (req, res) => {
    const videoTitle = req.query.video;
    let comments = data.readComments();
    let users = data.readUsers();

    if (videoTitle) {
        comments = comments.filter((c) => c.video === videoTitle);
    }

    const enrichedComments = comments.map((c) => {
        const userInfo = users.find((u) => u.username === c.user) || {};
        return {
            ...c,
            avatar: userInfo.avatar || 'https://via.placeholder.com/40',
            level: userInfo.level || 1,
            rank: userInfo.role === 'admin' ? 'Admin' : `Lvl ${userInfo.level || 1}`
        };
    });

    res.json(enrichedComments);
});

// API POST KOMENTAR BARU
router.post('/comments',
    isAuthenticated,
    [
        body('text').isString().trim().isLength({ min: 1, max: 2000 }).withMessage('Komentar wajib diisi (maks 2000).'),
        body('video').isString().trim().notEmpty().withMessage('Judul video wajib diisi.')
    ],
    handleValidationErrors,
    (req, res) => {
        const { video, text } = req.body;
        const user = req.session.user.username;

        let comments = data.readComments();

        const newComment = {
            id: Date.now(),
            video: video,
            text: text,
            user: user,
            date: new Date().toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
        };

        comments.push(newComment);
        data.saveComments(comments);

        res.json({ success: true, message: 'Komentar berhasil dikirim!', comment: newComment });
    });

// API DELETE KOMENTAR
router.delete('/comments/:id', isAuthenticated, (req, res) => {
    const commentId = parseInt(req.params.id);
    const currentUsername = req.session.user.username;
    const currentRole = req.session.user.role;

    if (!currentUsername) {
        return res.status(400).json({ success: false, message: 'User tidak valid!' });
    }

    let comments = data.readComments();

    const commentIndex = comments.findIndex((c) => c.id === commentId);

    if (commentIndex === -1) {
        return res.status(404).json({ success: false, message: 'Komentar tidak ditemukan!' });
    }

    const targetComment = comments[commentIndex];

    const isAdmin = currentRole === 'admin';
    const isOwner = targetComment.user === currentUsername;

    if (isAdmin || isOwner) {
        comments.splice(commentIndex, 1);
        data.saveComments(comments);
        return res.json({ success: true, message: 'Komentar berhasil dihapus.' });
    } else {
        return res.status(403).json({ success: false, message: 'Anda tidak memiliki izin!' });
    }
});

module.exports = router;