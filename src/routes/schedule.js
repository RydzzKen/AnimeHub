const express = require('express');
const data = require('../utils/dataStore');
const { isAdmin } = require('../middleware/auth');

const router = express.Router();

const VALID_DAYS = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];

router.get('/schedule', (req, res) => {
    res.json(data.readSchedule());
});

router.post('/schedule', isAdmin, (req, res) => {
    const { title, poster, genres, episode, day, time } = req.body;

    if (!title || !day || !time) {
        return res.status(400).json({ success: false, message: 'Judul, hari, dan jam wajib diisi.' });
    }
    if (!VALID_DAYS.includes(day)) {
        return res.status(400).json({ success: false, message: 'Hari tidak valid.' });
    }

    const schedule = data.readSchedule();
    const item = {
        id: Date.now(),
        title,
        poster: poster || '',
        genres: Array.isArray(genres) ? genres : [],
        episode: episode || '',
        day,
        time,
        createdAt: new Date().toISOString()
    };
    schedule.push(item);
    data.saveSchedule(schedule);
    res.json({ success: true, message: 'Jadwal berhasil ditambahkan.', item });
});

router.put('/schedule/:id', isAdmin, (req, res) => {
    const id = Number(req.params.id);
    const { title, poster, genres, episode, day, time } = req.body;

    if (!VALID_DAYS.includes(day)) {
        return res.status(400).json({ success: false, message: 'Hari tidak valid.' });
    }

    const schedule = data.readSchedule();
    const idx = schedule.findIndex((s) => s.id === id);
    if (idx === -1) {
        return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan.' });
    }

    schedule[idx] = {
        ...schedule[idx],
        title: title || schedule[idx].title,
        poster: poster !== undefined ? poster : schedule[idx].poster,
        genres: Array.isArray(genres) ? genres : schedule[idx].genres,
        episode: episode !== undefined ? episode : schedule[idx].episode,
        day: day || schedule[idx].day,
        time: time || schedule[idx].time,
    };
    data.saveSchedule(schedule);
    res.json({ success: true, message: 'Jadwal berhasil diperbarui.' });
});

router.delete('/schedule/:id', isAdmin, (req, res) => {
    const id = Number(req.params.id);
    let schedule = data.readSchedule();
    const idx = schedule.findIndex((s) => s.id === id);
    if (idx === -1) {
        return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan.' });
    }
    schedule.splice(idx, 1);
    data.saveSchedule(schedule);
    res.json({ success: true, message: 'Jadwal berhasil dihapus.' });
});

module.exports = router;
