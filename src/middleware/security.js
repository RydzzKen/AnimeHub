const express = require('express');
const crypto = require('crypto');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const xss = require('xss');
const config = require('../config');

const CSRF_COOKIE = 'csrfToken';

// ==========================================
// SECURITY & GLOBAL MIDDLEWARE SETUP
// Order matters and mirrors the original server.js behaviour.
// ==========================================

// ---- CSRF helpers (double-submit cookie pattern) ----
// Token lives in an httpOnly cookie AND must be echoed back in the
// x-csrf-token header. This avoids depending on the session store, which
// previously caused intermittent "CSRF tidak valid" failures on login due
// to race conditions in session-file-store.
function generateCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
}

function parseCookies(header) {
    const cookies = {};
    if (!header) return cookies;
    header.split(';').forEach((part) => {
        const eq = part.indexOf('=');
        if (eq === -1) return;
        const key = part.slice(0, eq).trim();
        const val = part.slice(eq + 1).trim();
        if (key) {
            try {
                cookies[key] = decodeURIComponent(val);
            } catch (e) {
                cookies[key] = val;
            }
        }
    });
    return cookies;
}

function tokensMatch(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return crypto.timingSafeEqual(bufA, bufB);
}

function setCsrfCookie(res) {
    const token = generateCsrfToken();
    res.cookie(CSRF_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProd,
        path: '/',
        maxAge: 24 * 60 * 60 * 1000
    });
    return token;
}

// ---- Recursive XSS sanitization ----
function sanitizeValue(value) {
    if (typeof value === 'string') {
        const cleaned = xss(value).trim();
        return cleaned.length > 100000 ? cleaned.slice(0, 100000) : cleaned;
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeValue);
    }
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value)) {
            out[key] = sanitizeValue(value[key]);
        }
        return out;
    }
    return value;
}

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
    // Never reflect arbitrary origins. Same-origin requests (via the Host
    // header) and explicitly configured origins only.
    const allowedOrigins = config.allowedOrigins.filter((o) => o !== '*');
    app.use((req, res, next) => {
        const selfOrigin = `${req.protocol}://${req.get('host')}`;
        cors({
            origin(origin, cb) {
                if (!origin) return cb(null, true);
                if (origin === selfOrigin) return cb(null, true);
                if (allowedOrigins.includes(origin)) return cb(null, true);
                return cb(null, false);
            },
            credentials: true,
        })(req, res, next);
    });

    // ---- Rate limiting on /api ----
    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 1000,
        standardHeaders: true,
        legacyHeaders: false,
    });
    app.use('/api', apiLimiter);

    // ---- Request logging (query strings redacted) ----
    app.use(morgan(function (tokens, req, res) {
        const status = tokens.status(req, res);
        const ms = tokens['response-time'](req, res);
        const coloredStatus = status >= 500
            ? '\x1b[31m' + status + '\x1b[0m'
            : status >= 400 ? '\x1b[33m' + status + '\x1b[0m' : status;
        return `${tokens.method(req, res)} ${req.path} ${coloredStatus} ${ms} ms`;
    }));

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
    let sessionSecret = config.sessionSecret;
    if (!sessionSecret || sessionSecret.length < 32) {
        if (config.isProd) {
            console.error('FATAL: SESSION_SECRET is not set or too weak. Exiting.');
            process.exit(1);
        } else {
            console.warn('WARNING: SESSION_SECRET is weak/empty, generating an ephemeral dev secret.');
            sessionSecret = crypto.randomBytes(32).toString('hex');
        }
    }

    app.use(session({
        secret: sessionSecret,
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

    // ---- CSRF PROTECTION (double-submit cookie) ----
    app.use((req, res, next) => {
        const method = req.method.toUpperCase();
        if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
            return next();
        }

        const cookies = parseCookies(req.headers.cookie || '');
        const cookieToken = cookies[CSRF_COOKIE];
        const headerToken = req.headers['x-csrf-token'];

        if (!cookieToken || !headerToken || !tokensMatch(cookieToken, headerToken)) {
            const err = new Error('invalid csrf token');
            err.code = 'EBADCSRFTOKEN';
            err.status = 403;
            return next(err);
        }
        next();
    });

    app.get('/api/csrf-token', (req, res) => {
        // Reuse a still-valid token so multiple tabs share the same value.
        const existing = parseCookies(req.headers.cookie || '')[CSRF_COOKIE];
        const token = (existing && existing.length === 64) ? existing : setCsrfCookie(res);
        res.json({ csrfToken: token });
    });

    // ---- Body parsing ----
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ limit: '10mb', extended: true }));

    // ---- Static files ----
    app.use(express.static(config.publicDir));

    // ---- XSS sanitization (recursive, also covers nested objects/arrays) ----
    app.use((req, res, next) => {
        if (req.body && typeof req.body === 'object') req.body = sanitizeValue(req.body);
        if (req.query && typeof req.query === 'object') req.query = sanitizeValue(req.query);
        next();
    });
}

module.exports = { applySecurity };