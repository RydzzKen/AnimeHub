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

// ---- Custom error handler (never leaks internals to clients) ----
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN' || err.code === 'CSRF_NOT_VALID') {
        return res.status(403).json({ success: false, message: 'Permintaan ditolak (CSRF tidak valid).' });
    }
    console.error(err);
    const status = err.status || 500;
    const message = status >= 500 ? 'Terjadi kesalahan pada server.' : 'Permintaan tidak dapat diproses.';
    res.status(status).json({ success: false, message });
});

module.exports = app;
