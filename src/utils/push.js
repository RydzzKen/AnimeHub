const webpush = require('web-push');
const config = require('../config');
const data = require('./dataStore');

// Setup VAPID (web-push mengharuskan setVapidDetails hanya perlu dipanggil sekali)
if (config.vapidPublicKey && config.vapidPrivateKey) {
    webpush.setVapidDetails(
        config.vapidSubject,
        config.vapidPublicKey,
        config.vapidPrivateKey
    );
}

// Simpan/update subscription untuk seorang user
function subscribeUser(username, subscription) {
    const subs = data.readPush();
    const existing = subs.find((s) => s.username === username);

    if (existing) {
        existing.subscription = subscription;
    } else {
        subs.push({ username, subscription });
    }

    data.savePush(subs);
    return true;
}

// Hapus subscription user (saat logout / unsubscrib)
function unsubscribeUser(username, subscription) {
    let subs = data.readPush();
    const before = subs.length;
    subs = subs.filter((s) =>
        !(s.username === username && JSON.stringify(s.subscription) === JSON.stringify(subscription))
    );
    if (subs.length !== before) data.savePush(subs);
    return true;
}

// Ambil subscription milik sebuah user (objek atau null)
function getSubscription(username) {
    const subs = data.readPush();
    const entry = subs.find((s) => s.username === username);
    return entry ? entry.subscription : null;
}

// Kirim notifikasi push ke sebuah user (best-effort, tidak menggagalkan request utama)
async function sendToUser(username, payload) {
    if (!config.vapidPublicKey || !config.vapidPrivateKey) return false;
    const subscription = getSubscription(username);
    if (!subscription) return false;

    try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        return true;
    } catch (err) {
        // 404/410 -> subscription tidak valid lagi, hapus
        if (err.statusCode === 404 || err.statusCode === 410) {
            let subs = data.readPush();
            subs = subs.filter((s) => s.username !== username);
            data.savePush(subs);
        }
        return false;
    }
}

module.exports = {
    subscribeUser,
    unsubscribeUser,
    getSubscription,
    sendToUser,
    vapidPublicKey: config.vapidPublicKey,
};
