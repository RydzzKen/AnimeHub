// ==========================================
// SQLITE DATABASE LAYER (better-sqlite3)
// Replaces the encrypted-JSON file store with a proper relational DB.
// - Schema initialized on first load.
// - Data migrated automatically from the legacy JSON files (data/).
// - Provides CRUD helpers consumed by dataStore.js so existing routes
//   keep working unchanged.
// ==========================================
const fs = require('fs');
const path = require('path');
const config = require('../config');

const DB_PATH = path.join(config.dataDir, 'animehub.sqlite');

// Lazily-open a single reusable connection.
let _db = null;
function db() {
    if (_db) return _db;
    const Database = require('better-sqlite3');
    if (!fs.existsSync(config.dataDir)) fs.mkdirSync(config.dataDir, { recursive: true });
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    migrateSchema(_db);
    return _db;
}

// ==========================================
// SCHEMA
// ==========================================
function migrateSchema(database) {
    database.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            displayName TEXT,
            avatar TEXT,
            banner TEXT,
            bio TEXT,
            level INTEGER DEFAULT 1,
            xp INTEGER DEFAULT 0,
            role TEXT DEFAULT 'user',
            friends TEXT DEFAULT '[]',
            continueWatching TEXT DEFAULT 'null',
            watchHistory TEXT DEFAULT 'null'
        );

        CREATE TABLE IF NOT EXISTS anime (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            season TEXT,
            genres TEXT DEFAULT '[]',
            synopsis TEXT DEFAULT '',
            poster TEXT DEFAULT '',
            episodes TEXT DEFAULT '[]'
        );

        CREATE TABLE IF NOT EXISTS ratings (
            username TEXT NOT NULL,
            anime_id INTEGER NOT NULL,
            score INTEGER NOT NULL,
            PRIMARY KEY (username, anime_id)
        );

        CREATE TABLE IF NOT EXISTS favorites (
            username TEXT NOT NULL,
            anime_id INTEGER NOT NULL,
            PRIMARY KEY (username, anime_id)
        );

        CREATE TABLE IF NOT EXISTS subscriptions (
            username TEXT NOT NULL,
            anime_id INTEGER NOT NULL,
            PRIMARY KEY (username, anime_id)
        );

        CREATE TABLE IF NOT EXISTS push_subs (
            username TEXT PRIMARY KEY,
            subscription TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY,
            video TEXT,
            text TEXT,
            user TEXT,
            date TEXT
        );

        CREATE TABLE IF NOT EXISTS friends (
            id INTEGER PRIMARY KEY,
            user1 TEXT,
            user2 TEXT,
            status TEXT
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY,
            "from" TEXT,
            "to" TEXT,
            text TEXT,
            timestamp TEXT
        );

        CREATE TABLE IF NOT EXISTS banned (
            username TEXT PRIMARY KEY,
            type TEXT,
            until TEXT,
            bannedAt TEXT,
            suspendedAt TEXT
        );

        CREATE TABLE IF NOT EXISTS schedule (
            id INTEGER PRIMARY KEY,
            title TEXT,
            poster TEXT,
            genres TEXT DEFAULT '[]',
            episode TEXT,
            day TEXT,
            time TEXT,
            createdAt TEXT
        );
    `);
}

// ==========================================
// ID GENERATOR (matches legacy Date.now()/max+1 semantics)
// ==========================================
function nextId(table) {
    const row = db().prepare(`SELECT MAX(id) AS max FROM ${table}`).get();
    const max = row && row.max ? row.max : 0;
    return max + 1;
}

// ==========================================
// MIGRATION FROM LEGACY JSON (one-time)
// ==========================================
function migrateFromJson() {
    const database = db();
    const hasUsers = database.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0;
    if (hasUsers) return;

    const legacy = require('./dataStoreJsonLegacy');
    const users = legacy.readUsers() || [];
    const anime = legacy.readAnime() || [];
    const comments = legacy.readComments() || [];
    const friends = legacy.readFriends() || [];
    const messages = legacy.readMessages() || [];
    const banned = legacy.readBanned() || [];
    const push = legacy.readPush() || [];
    const schedule = legacy.readSchedule() || [];

    const insUser = database.prepare(`INSERT INTO users (id, username, password, displayName, avatar, banner, bio, level, xp, role, friends, continueWatching, watchHistory) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insAnime = database.prepare(`INSERT INTO anime (id, title, season, genres, synopsis, poster, episodes) VALUES (?,?,?,?,?,?,?)`);
    const insRating = database.prepare(`INSERT OR IGNORE INTO ratings (username, anime_id, score) VALUES (?,?,?)`);
    const insFav = database.prepare(`INSERT OR IGNORE INTO favorites (username, anime_id) VALUES (?,?)`);
    const insSub = database.prepare(`INSERT OR IGNORE INTO subscriptions (username, anime_id) VALUES (?,?)`);
    const insPush = database.prepare(`INSERT OR IGNORE INTO push_subs (username, subscription) VALUES (?,?)`);
    const insComment = database.prepare(`INSERT OR IGNORE INTO comments (id, video, text, user, date) VALUES (?,?,?,?,?)`);
    const insFriend = database.prepare(`INSERT OR IGNORE INTO friends (id, user1, user2, status) VALUES (?,?,?,?)`);
    const insMessage = database.prepare(`INSERT OR IGNORE INTO messages (id, "from", "to", text, timestamp) VALUES (?,?,?,?,?)`);
    const insBanned = database.prepare(`INSERT OR IGNORE INTO banned (username, type, until, bannedAt, suspendedAt) VALUES (?,?,?,?,?)`);
    const insSchedule = database.prepare(`INSERT OR IGNORE INTO schedule (id, title, poster, genres, episode, day, time, createdAt) VALUES (?,?,?,?,?,?,?,?)`);

    const tx = database.transaction(() => {
        for (const u of users || []) {
            insUser.run(
                u.id || nextId('users'),
                u.username,
                u.password,
                u.displayName !== undefined ? u.displayName : u.username,
                u.avatar || '',
                u.banner || '',
                u.bio || '',
                u.level || 1,
                u.xp || 0,
                u.role || 'user',
                JSON.stringify(u.friends || []),
                JSON.stringify(u.continueWatching !== undefined ? u.continueWatching : null),
                JSON.stringify(u.watchHistory !== undefined ? u.watchHistory : null)
            );
            for (const [animeId, score] of Object.entries(u.ratings || {})) {
                insRating.run(u.username, parseInt(animeId), parseInt(score));
            }
            for (const favId of (u.favorites || [])) {
                insFav.run(u.username, parseInt(favId));
            }
            for (const subId of (u.subscriptions || [])) {
                insSub.run(u.username, parseInt(subId));
            }
        }
        for (const a of anime || []) {
            insAnime.run(
                a.id || nextId('anime'),
                a.title,
                a.season || '',
                JSON.stringify(a.genres || []),
                a.synopsis || '',
                a.poster || '',
                JSON.stringify(a.episodes || [])
            );
        }
        for (const p of push || []) {
            insPush.run(p.username, JSON.stringify(p.subscription || null));
        }
        for (const c of comments || []) {
            insComment.run(c.id, c.video, c.text, c.user, c.date);
        }
        for (const f of friends || []) {
            insFriend.run(f.id, f.user1, f.user2, f.status);
        }
        for (const m of messages || []) {
            insMessage.run(m.id, m.from, m.to, m.text, m.timestamp);
        }
        for (const b of banned || []) {
            insBanned.run(b.username, b.type, b.until, b.bannedAt, b.suspendedAt);
        }
        for (const s of schedule || []) {
            insSchedule.run(s.id, s.title, s.poster, JSON.stringify(s.genres || []), s.episode, s.day, s.time, s.createdAt);
        }
    });
    tx();
}

// ==========================================
// SERIALIZATION HELPERS (JSON <-> DB rows)
// ==========================================
function parseJson(str, fallback) {
    try {
        const v = JSON.parse(str);
        return v === undefined || v === null ? fallback : v;
    } catch (e) {
        return fallback;
    }
}

function rowToUser(row) {
    if (!row) return null;
    const ratings = db().prepare('SELECT anime_id, score FROM ratings WHERE username = ?').all(row.username);
    const favs = db().prepare('SELECT anime_id FROM favorites WHERE username = ?').all(row.username);
    const subs = db().prepare('SELECT anime_id FROM subscriptions WHERE username = ?').all(row.username);
    const ratingObj = {};
    ratings.forEach((r) => { ratingObj[r.anime_id] = r.score; });
    return {
        id: row.id,
        username: row.username,
        password: row.password,
        displayName: row.displayName,
        avatar: row.avatar,
        banner: row.banner,
        bio: row.bio,
        level: row.level,
        xp: row.xp,
        role: row.role,
        friends: parseJson(row.friends, []),
        ratings: ratingObj,
        favorites: favs.map((f) => f.anime_id),
        subscriptions: subs.map((s) => s.anime_id),
        continueWatching: parseJson(row.continueWatching, null),
        watchHistory: parseJson(row.watchHistory, null),
    };
}

function rowToAnime(row) {
    if (!row) return null;
    return {
        id: row.id,
        title: row.title,
        season: row.season,
        genres: parseJson(row.genres, []),
        synopsis: row.synopsis,
        poster: row.poster,
        episodes: parseJson(row.episodes, []),
    };
}

// ==========================================
// QUERY HELPERS (mirror legacy dataStore API)
// ==========================================
function getAllUsers() {
    const rows = db().prepare('SELECT * FROM users ORDER BY username').all();
    return rows.map(rowToUser);
}
function getUsersByUsername(username) {
    const users = getAllUsers();
    return users.find((u) => u.username === username) || null;
}
function saveUser(user) {
    const database = db();
    database.prepare(`INSERT INTO users (id, username, password, displayName, avatar, banner, bio, level, xp, role, friends, continueWatching, watchHistory)
        VALUES (@id, @username, @password, @displayName, @avatar, @banner, @bio, @level, @xp, @role, @friends, @continueWatching, @watchHistory)
        ON CONFLICT(username) DO UPDATE SET
            password=excluded.password, displayName=excluded.displayName, avatar=excluded.avatar,
            banner=excluded.banner, bio=excluded.bio, level=excluded.level, xp=excluded.xp,
            role=excluded.role, friends=excluded.friends, continueWatching=excluded.continueWatching,
            watchHistory=excluded.watchHistory`)
        .run({
            id: user.id || nextId('users'),
            username: user.username,
            password: user.password,
            displayName: user.displayName,
            avatar: user.avatar || '',
            banner: user.banner || '',
            bio: user.bio || '',
            level: user.level || 1,
            xp: user.xp || 0,
            role: user.role || 'user',
            friends: JSON.stringify(user.friends || []),
            continueWatching: JSON.stringify(user.continueWatching !== undefined ? user.continueWatching : null),
            watchHistory: JSON.stringify(user.watchHistory !== undefined ? user.watchHistory : null),
        });
    // sync related tables
    syncRatingReferences(user);
    syncFavoriteReferences(user);
    syncSubscriptionReferences(user);
}
function deleteUser(username) {
    const database = db();
    database.prepare('DELETE FROM users WHERE username = ?').run(username);
    database.prepare('DELETE FROM ratings WHERE username = ?').run(username);
    database.prepare('DELETE FROM favorites WHERE username = ?').run(username);
    database.prepare('DELETE FROM subscriptions WHERE username = ?').run(username);
    database.prepare('DELETE FROM push_subs WHERE username = ?').run(username);
}

// Replace the whole users table (mirrors legacy saveUsers(list) semantics).
// Users no longer present are removed; the rest are upserted with their
// favorites/subscriptions/ratings synced.
function saveUsersList(list) {
    const database = db();
    const existing = database.prepare('SELECT username FROM users').all();
    const incoming = new Set((list || []).map((u) => u.username));
    const removed = existing.map((r) => r.username).filter((name) => !incoming.has(name));

    const tx = database.transaction(() => {
        for (const name of removed) deleteUser(name);
        for (const user of list || []) saveUser(user);
    });
    tx();
}
function syncRatingReferences(user) {
    const database = db();
    const username = user.username;
    database.prepare('DELETE FROM ratings WHERE username = ?').run(username);
    const ins = database.prepare('INSERT OR IGNORE INTO ratings (username, anime_id, score) VALUES (?,?,?)');
    for (const [animeId, score] of Object.entries(user.ratings || {})) {
        ins.run(username, parseInt(animeId), parseInt(score));
    }
}
function syncFavoriteReferences(user) {
    const database = db();
    const username = user.username;
    database.prepare('DELETE FROM favorites WHERE username = ?').run(username);
    const ins = database.prepare('INSERT OR IGNORE INTO favorites (username, anime_id) VALUES (?,?)');
    for (const favId of (user.favorites || [])) {
        ins.run(username, parseInt(favId));
    }
}
function syncSubscriptionReferences(user) {
    const database = db();
    const username = user.username;
    database.prepare('DELETE FROM subscriptions WHERE username = ?').run(username);
    const ins = database.prepare('INSERT OR IGNORE INTO subscriptions (username, anime_id) VALUES (?,?)');
    for (const subId of (user.subscriptions || [])) {
        ins.run(username, parseInt(subId));
    }
}
function setRating(username, animeId, score) {
    db().prepare('INSERT OR REPLACE INTO ratings (username, anime_id, score) VALUES (?,?,?)').run(username, animeId, score);
    return computeRating(animeId);
}
function computeRating(animeId) {
    const row = db().prepare('SELECT AVG(score) AS avg, COUNT(score) AS c FROM ratings WHERE anime_id = ?').get(animeId);
    if (!row || row.c === 0) return { average: null, count: 0 };
    const average = Math.round(row.avg * 10) / 10;
    return { average, count: row.c };
}
function getUserScore(username, animeId) {
    const row = db().prepare('SELECT score FROM ratings WHERE username = ? AND anime_id = ?').get(username, animeId);
    return row ? row.score : null;
}
function setFavorite(username, animeId, isFavorite) {
    if (isFavorite) {
        db().prepare('INSERT OR IGNORE INTO favorites (username, anime_id) VALUES (?,?)').run(username, animeId);
    } else {
        db().prepare('DELETE FROM favorites WHERE username = ? AND anime_id = ?').run(username, animeId);
    }
}
function setSubscription(username, animeId, subscribed) {
    if (subscribed) {
        db().prepare('INSERT OR IGNORE INTO subscriptions (username, anime_id) VALUES (?,?)').run(username, animeId);
    } else {
        db().prepare('DELETE FROM subscriptions WHERE username = ? AND anime_id = ?').run(username, animeId);
    }
}

function getAllAnime() {
    const rows = db().prepare('SELECT * FROM anime ORDER BY id').all();
    return rows.map(rowToAnime);
}
function getAnimeById(id) {
    return rowToAnime(db().prepare('SELECT * FROM anime WHERE id = ?').get(id));
}
function saveAnimeList(list) {
    const database = db();
    const del = database.prepare('DELETE FROM anime');
    const ins = database.prepare('INSERT OR REPLACE INTO anime (id, title, season, genres, synopsis, poster, episodes) VALUES (?,?,?,?,?,?,?)');
    const tx = database.transaction(() => {
        del.run();
        for (const a of list) {
            ins.run(a.id, a.title, a.season || '', JSON.stringify(a.genres || []), a.synopsis || '', a.poster || '', JSON.stringify(a.episodes || []));
        }
    });
    tx();
}

function getAllComments() {
    return db().prepare('SELECT * FROM comments ORDER BY id').all();
}
function addComment(comment) {
    db().prepare('INSERT OR REPLACE INTO comments (id, video, text, user, date) VALUES (?,?,?,?,?)')
        .run(comment.id, comment.video, comment.text, comment.user, comment.date);
}
function deleteComment(id) {
    db().prepare('DELETE FROM comments WHERE id = ?').run(id);
}
function replaceComments(list) {
    const database = db();
    const del = database.prepare('DELETE FROM comments');
    const ins = database.prepare('INSERT OR REPLACE INTO comments (id, video, text, user, date) VALUES (?,?,?,?,?)');
    const tx = database.transaction(() => {
        del.run();
        for (const c of list) ins.run(c.id, c.video, c.text, c.user, c.date);
    });
    tx();
}

function getAllFriends() {
    return db().prepare('SELECT * FROM friends ORDER BY id').all();
}
function saveFriendsList(list) {
    const database = db();
    const del = database.prepare('DELETE FROM friends');
    const ins = database.prepare('INSERT OR REPLACE INTO friends (id, user1, user2, status) VALUES (?,?,?,?)');
    const tx = database.transaction(() => {
        del.run();
        for (const f of list) ins.run(f.id, f.user1, f.user2, f.status);
    });
    tx();
}

function getAllMessages() {
    return db().prepare('SELECT * FROM messages ORDER BY id').all();
}
function saveMessagesList(list) {
    const database = db();
    const del = database.prepare('DELETE FROM messages');
    const ins = database.prepare('INSERT OR REPLACE INTO messages (id, "from", "to", text, timestamp) VALUES (?,?,?,?,?)');
    const tx = database.transaction(() => {
        del.run();
        for (const m of list) ins.run(m.id, m.from, m.to, m.text, m.timestamp);
    });
    tx();
}

function getAllBanned() {
    return db().prepare('SELECT * FROM banned ORDER BY username').all();
}
function saveBannedList(list) {
    const database = db();
    const del = database.prepare('DELETE FROM banned');
    const ins = database.prepare('INSERT OR REPLACE INTO banned (username, type, until, bannedAt, suspendedAt) VALUES (?,?,?,?,?)');
    const tx = database.transaction(() => {
        del.run();
        for (const b of list) ins.run(b.username, b.type, b.until, b.bannedAt, b.suspendedAt);
    });
    tx();
}

function getPushSubscriptions() {
    const rows = db().prepare('SELECT * FROM push_subs').all();
    return rows.map((r) => ({ username: r.username, subscription: parseJson(r.subscription, null) }));
}
function savePushSubscriptions(list) {
    const database = db();
    const del = database.prepare('DELETE FROM push_subs');
    const ins = database.prepare('INSERT OR REPLACE INTO push_subs (username, subscription) VALUES (?,?)');
    const tx = database.transaction(() => {
        del.run();
        for (const p of list) ins.run(p.username, JSON.stringify(p.subscription || null));
    });
    tx();
}

function getAllSchedule() {
    const rows = db().prepare('SELECT * FROM schedule ORDER BY id').all();
    return rows.map((r) => ({
        id: r.id,
        title: r.title,
        poster: r.poster,
        genres: parseJson(r.genres, []),
        episode: r.episode,
        day: r.day,
        time: r.time,
        createdAt: r.createdAt,
    }));
}
function saveScheduleList(list) {
    const database = db();
    const del = database.prepare('DELETE FROM schedule');
    const ins = database.prepare('INSERT OR REPLACE INTO schedule (id, title, poster, genres, episode, day, time, createdAt) VALUES (?,?,?,?,?,?,?,?)');
    const tx = database.transaction(() => {
        del.run();
        for (const s of list) {
            ins.run(s.id, s.title, s.poster || '', JSON.stringify(s.genres || []), s.episode, s.day, s.time, s.createdAt);
        }
    });
    tx();
}

module.exports = {
    db,
    migrateFromJson,
    nextId,
    getAllUsers,
    getUsersByUsername,
    saveUser,
    saveUsersList,
    deleteUser,
    setRating,
    computeRating,
    getUserScore,
    setFavorite,
    setSubscription,
    getAllAnime,
    getAnimeById,
    saveAnimeList,
    getAllComments,
    addComment,
    deleteComment,
    replaceComments,
    getAllFriends,
    saveFriendsList,
    getAllMessages,
    saveMessagesList,
    getAllBanned,
    saveBannedList,
    getPushSubscriptions,
    savePushSubscriptions,
    getAllSchedule,
    saveScheduleList,
};
