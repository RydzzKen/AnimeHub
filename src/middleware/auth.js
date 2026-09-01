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
// MIDDLEWARE AUTENTIKASI
// ==========================================
function isAuthenticated(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            error: 'Silakan login terlebih dahulu!'
        });
    }
    next();
}

function isAdmin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            error: 'Silakan login terlebih dahulu!'
        });
    }
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            error: 'Akses ditolak! Hanya admin yang diizinkan.'
        });
    }
    next();
}

// FIX: Input validation result handler
function handleValidationErrors(req, res, next) {
    const { validationResult } = require('express-validator');
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: errors.array()[0].msg || 'Data tidak valid!',
            errors: errors.array()
        });
    }
    next();
}

module.exports = {
    isAuthenticated,
    isAdmin,
    handleValidationErrors,
};
