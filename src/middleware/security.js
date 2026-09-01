const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const csrf = require('csurf');
const xss = require('xss');
const config = require('../config');

// ==========================================
// SECURITY & GLOBAL MIDDLEWARE SETUP
// Order matters and mirrors the original server.js behaviour.
// ==========================================
function applySecurity(app) {
    app.disable('x-powered-by');

    // ---- Helmet ----
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.plyr.io", "https://www.youtube.com"],
                scriptSrcAttr: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.plyr.io", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'", "https://www.youtube.com"],
                fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
                mediaSrc: ["'self'", "data:", "https:"],
                frameSrc: ["'self'", "https:"]
            }
        },
        crossOriginResourcePolicy: { policy: 'cross-origin' }
    }));

    // ---- CORS ----
    const allowedOrigins = config.allowedOrigins;
    const reflectAll = allowedOrigins.length === 0 || allowedOrigins.includes('*');
    const corsOptions = {
        origin: function (origin, callback) {
            if (reflectAll || !origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('CORS tidak diizinkan untuk origin ini.'));
            }
        },
        credentials: true,
    };
    app.use(cors(corsOptions));

    // ---- Rate limiting on /api ----
    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 1000,
        standardHeaders: true,
        legacyHeaders: false,
    });
    app.use('/api', apiLimiter);

    // ---- Request logging ----
    app.use(morgan(config.isProd ? 'combined' : 'dev'));

    // ---- PATH TRAVERSAL guard ----
    app.use((req, res, next) => {
        const url = req.originalUrl || '';
        if (url.includes('..') ||
            url.toLowerCase().includes('%2e%2e') ||
            url.includes('\\')) {
            return res.status(400).json({ success: false, message: 'Permintaan tidak valid.' });
        }
        next();
    });

    // ---- Session ----
    const sessionSecret = config.sessionSecret;
    if (!sessionSecret || sessionSecret.length < 16) {
        if (config.isProd) {
            console.error('FATAL: SESSION_SECRET is not set or too weak. Exiting.');
            process.exit(1);
        } else {
            console.warn('WARNING: SESSION_SECRET is weak/empty, using insecure fallback (dev only).');
        }
    }

    app.use(session({
        secret: sessionSecret || 'insecure_dev_fallback_secret_change_me',
        store: new FileStore({
            path: require('path').join(config.dataDir, 'sessions'),
            ttl: 24 * 60 * 60,
            retries: 0
        }),
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: config.isProd,
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000
        }
    }));

    // ---- CSRF PROTECTION ----
    const csrfProtection = csrf();
    app.use(csrfProtection);

    app.get('/api/csrf-token', (req, res) => {
        res.json({ csrfToken: req.csrfToken() });
    });

    // ---- Body parsing ----
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ limit: '10mb', extended: true }));

    // ---- Static files ----
    app.use(express.static(config.publicDir));

    // ---- XSS sanitization (existing behaviour preserved) ----
    app.use((req, res, next) => {
        if (req.body) {
            for (let key in req.body) {
                if (typeof req.body[key] === 'string') {
                    req.body[key] = xss(req.body[key]);
                }
            }
        }
        if (req.query) {
            for (let key in req.query) {
                if (typeof req.query[key] === 'string') {
                    req.query[key] = xss(req.query[key]);
                }
            }
        }
        next();
    });
}

module.exports = { applySecurity };
