const express = require('express');
const { applySecurity } = require('./middleware/security');

const app = express();

// ---- Global security & parsing middleware ----
applySecurity(app);

// ---- Routes ----
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/users'));
app.use('/api', require('./routes/comments'));
app.use('/api', require('./routes/social'));
app.use('/api', require('./routes/anime'));
app.use('/api', require('./routes/admin'));
app.use('/api', require('./routes/push'));
app.use('/api', require('./routes/favorites'));
app.use('/api', require('./routes/schedule'));

// ---- Custom error handler (hide stack traces in production) ----
app.use((err, req, res, next) => {
    const isProd = process.env.NODE_ENV === 'production';
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({ success: false, message: 'Permintaan ditolak (CSRF tidak valid).' });
    }
    console.error(err);
    res.status(err.status || 500).json({
        success: false,
        message: isProd ? 'Terjadi kesalahan pada server.' : (err.message || 'Terjadi kesalahan pada server.')
    });
});

module.exports = app;
