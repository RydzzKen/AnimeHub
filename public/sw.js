// ==========================================
// AnimeHub Service Worker - True Offline Mode
// Strategi:
//  - PRECACHE app-shell (HTML/CSS/JS/manifest/icons) saat install
//  - Cache-First untuk aset statis (poster, banner, gambar)
//  - Network-First untuk navigasi halaman (fallback ke cache saat offline)
//  - Network-only untuk request API (agar data selalu segar & aman)
//  - Stale-While-Revalidate untuk API GET publik (katalog/jadwal)
// ==========================================

const VERSION = 'animehub-v1.0.0';

// App shell - di-precache saat install
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/catalog.html',
    '/schedule.html',
    '/library.html',
    '/profile.html',
    '/admin.html',
    '/styles.css',
    '/theme.js',
    '/csrf.js',
    '/manifest.json',
    '/Logo.png',
    '/Icons.png'
];

const STATIC_CACHE = VERSION + '-static';
const API_CACHE = VERSION + '-api';

const STATIC_EXT = /\.(css|js|png|webp|jpg|jpeg|gif|svg|ico|json)$/;

// ---- INSTALL: precache app shell ----
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .catch(() => {})
            .then(() => self.skipWaiting())
    );
});

// ---- ACTIVATE: bersihkan cache lama ----
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => !key.startsWith(VERSION))
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// ---- FETCH ----
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Hanya tangani request same-origin
    if (url.origin !== self.location.origin) return;

    const isApi = url.pathname.startsWith('/api/');
    const isNavigation = e.request.mode === 'navigate';

    // 1. API
    if (isApi) {
        // POST/PUT/DELETE -> network only (jangan di-cache demi keamanan & konsistensi)
        if (e.request.method !== 'GET') return;
        // API GET publik (katalog, jadwal) -> stale-while-revalidate
        return e.respondWith(staleWhileRevalidate(e.request, API_CACHE));
    }

    // 2. Navigasi halaman -> network-first dgn fallback index.html saat offline
    if (isNavigation) {
        return e.respondWith(networkFirst(e.request, STATIC_CACHE));
    }

    // 3. Aset statis (poster/banner/gambar/css/js) -> cache-first
    if (STATIC_EXT.test(url.pathname)) {
        return e.respondWith(cacheFirst(e.request, STATIC_CACHE));
    }

    // 4. Lainnya -> network only
    return;
});

// ---- HELPER: Cache-First (Fastest offline) ----
async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) {
        // Refresh cache di background (tanpa blokir respon)
        refreshCache(request, cache);
        return cached;
    }
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (err) {
        return new Response('', { status: 503, statusText: 'Offline' });
    }
}

// ---- HELPER: Network-First (fresh, fallback offline) ----
async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (err) {
        const cached = await cache.match(request, { ignoreSearch: true })
            || await cache.match('/index.html');
        if (cached) return cached;
        return new Response('', { status: 503, statusText: 'Offline' });
    }
}

// ---- HELPER: Stale-While-Revalidate (fast + fresh) ----
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const networkPromise = fetch(request)
        .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        })
        .catch(() => cached);

    return cached || networkPromise;
}

async function refreshCache(request, cache) {
    try {
        const response = await fetch(request);
        if (response && response.status === 200) {
            cache.put(request, response.clone());
        }
    } catch (err) {}
}

// ==========================================
// WEB PUSH NOTIFICATIONS
// ==========================================

self.addEventListener('push', (e) => {
    let data = { title: 'AnimeHub', body: 'Ada notifikasi baru.', url: '/' };
    try {
        if (e.data) data = e.data.json();
    } catch (err) {}

    const options = {
        body: data.body || '',
        icon: '/Icons.png',
        badge: '/Logo.png',
        data: { url: data.url || '/' }
    };

    e.waitUntil(
        self.registration.showNotification(data.title || 'AnimeHub', options)
    );
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const url = (e.notification.data && e.notification.data.url) || '/';
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if ('focus' in client) {
                        client.navigate(url);
                        return client.focus();
                    }
                }
                return clients.openWindow(url);
            })
    );
});

// ==========================================
// MESSAGE: buka/page aktifkan aksi
// ==========================================
self.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
