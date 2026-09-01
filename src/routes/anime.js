const express = require('express');
const { body, param } = require('express-validator');
const data = require('../utils/dataStore');
const { isAdmin, handleValidationErrors } = require('../middleware/auth');

const router = express.Router();

// Helper: tentukan id berikutnya (inkremental, seperti data lama)
function nextAnimeId(list) {
    const maxId = list.reduce((max, a) => (a.id > max ? a.id : max), 0);
    return maxId + 1;
}

// Sanitasi object anime dari input (whitelist field)
function sanitizeAnime(input) {
    const episodes = Array.isArray(input.episodes)
        ? input.episodes
            .filter((e) => e && typeof e === 'object')
            .map((e) => ({
                title: String(e.title || '').slice(0, 300),
                file: String(e.file || '').slice(0, 500)
            }))
        : [];

    return {
        title: String(input.title || '').slice(0, 200),
        season: String(input.season || '').slice(0, 100),
        genres: Array.isArray(input.genres) ? input.genres.map((g) => String(g).slice(0, 50)).slice(0, 30) : [],
        synopsis: String(input.synopsis || '').slice(0, 5000),
        poster: String(input.poster || '').slice(0, 500),
        episodes
    };
}

// GET daftar anime (publik)
router.get('/anime', (req, res) => {
    res.json(data.readAnime());
});

// TAMBAH anime (admin)
router.post('/anime',
    isAdmin,
    [
        body('title').isString().trim().notEmpty().withMessage('Judul anime wajib diisi.'),
        body('season').optional().isString(),
        body('poster').optional().isString(),
        body('synopsis').optional().isString(),
        body('genres').optional().isArray(),
        body('episodes').optional().isArray()
    ],
    handleValidationErrors,
    (req, res) => {
        let list = data.readAnime();
        const anime = sanitizeAnime(req.body);
        anime.id = nextAnimeId(list);

        list.push(anime);
        data.saveAnime(list);

        res.json({ success: true, message: 'Anime berhasil ditambahkan!', anime });
    });

// UPDATE anime (admin)
router.put('/anime/:id',
    isAdmin,
    [
        param('id').isInt().withMessage('ID tidak valid.'),
        body('title').optional().isString().trim().notEmpty(),
        body('genres').optional().isArray(),
        body('episodes').optional().isArray()
    ],
    handleValidationErrors,
    (req, res) => {
        let list = data.readAnime();
        const id = parseInt(req.params.id);
        const index = list.findIndex((a) => a.id === id);

        if (index === -1) {
            return res.status(404).json({ success: false, message: 'Anime tidak ditemukan!' });
        }

        const updated = sanitizeAnime({ ...list[index], ...req.body });
        updated.id = id;
        list[index] = updated;
        data.saveAnime(list);

        res.json({ success: true, message: 'Anime berhasil diperbarui!', anime: updated });
    });

// HAPUS anime (admin)
router.delete('/anime/:id',
    isAdmin,
    [param('id').isInt().withMessage('ID tidak valid.')],
    handleValidationErrors,
    (req, res) => {
        let list = data.readAnime();
        const id = parseInt(req.params.id);
        const newList = list.filter((a) => a.id !== id);

        if (newList.length === list.length) {
            return res.status(404).json({ success: false, message: 'Anime tidak ditemukan!' });
        }

        data.saveAnime(newList);
        res.json({ success: true, message: 'Anime berhasil dihapus.' });
    });

module.exports = router;
