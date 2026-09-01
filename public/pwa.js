// ==========================================
// AnimeHub PWA Helper
//  - Register service worker (offline mode)
//  - Kelola subscription Web Push Notification
// ==========================================
(function () {
    const pwa = {};

    // Register service worker (offline)
    pwa.registerSW = function () {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .catch((err) => console.warn('SW register gagal:', err));
        }
    };

    // Cek apakah push didukung & diizinkan
    pwa.isPushSupported = function () {
        return 'serviceWorker' in navigator
            && 'PushManager' in window
            && Notification && Notification.permission !== 'denied';
    };

    // Dapatkan public key VAPID dari server
    async function getVapidKey() {
        try {
            const res = await fetch('/api/push/vapid-public-key');
            const d = await res.json();
            return d.publicKey || null;
        } catch (e) {
            return null;
        }
    }

    // Permintaan izin + subscribe push
    pwa.askNotificationPermission = async function () {
        if (!pwa.isPushSupported()) return { granted: false, reason: 'unsupported' };

        const publicKey = await getVapidKey();
        if (!publicKey) return { granted: false, reason: 'no-vapid' };

        let permission = Notification.permission;
        if (permission === 'default') {
            permission = await Notification.requestPermission();
        }
        if (permission !== 'granted') return { granted: false, reason: 'denied' };

        try {
            const reg = await navigator.serviceWorker.ready;
            let subscription = await reg.pushManager.getSubscription();
            if (!subscription) {
                subscription = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(publicKey)
                });
            }
            // Kirim subscription ke server (CSRF di-automasi oleh csrf.js)
            await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription })
            });
            return { granted: true };
        } catch (err) {
            console.warn('Push subscribe gagal:', err);
            return { granted: false, reason: 'error' };
        }
    };

    // Nonaktifkan notifikasi (unsubscribe)
    pwa.disableNotification = async function () {
        try {
            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.ready;
                const subscription = await reg.pushManager.getSubscription();
                if (subscription) await subscription.unsubscribe();
                await fetch('/api/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription }) });
            }
        } catch (e) {}
    };

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    window.AnimePWA = pwa;
    pwa.registerSW();
})();
