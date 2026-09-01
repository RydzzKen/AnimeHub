# PRD — AnimeHub

**Product Requirements Document**
**Versi:** 7.4.0
**Tanggal:** 1 September 2026
**Status:** Active (v7.4: storage aktif pindah ke SQLite, schedule CRUD admin, subscribe anime, theming UI)

---

## 1. Ringkasan Produk (Overview)

**AnimeHub** adalah sebuah aplikasi web streaming anime gratis yang menyajikan
pengalaman sosial bagi pengguna. Selain menonton anime, pengguna dapat membuat
akun, menyimpan progres tontonan (*continue watching*), menyimpan **favorit
per-akun**, **subscribe anime** ("ikuti"), berinteraksi lewat komentar, menambah
teman, mengobrol (chat pribadi), serta mengelola profil mereka. Di sisi backend,
terdapat panel admin untuk memoderasi pengguna (ban/suspend) dan mengelola
katalog anime + jadwal rilis.

Aplikasi dijalankan sebagai **PWA (Progressive Web App)** yang dapat diinstal
di perangkat mobile, mendukung **mode offline** (cache shell & aset), **Web Push
Notification** untuk notifikasi chat & permintaan teman, serta tema
**dark/light** via `theme.js`.

---

## 2. Tujuan & Sasaran

| Tujuan | Deskripsi |
| ------ | --------- |
| G1 | Menyediakan katalog anime yang dapat dijelajahi (index, catalog A–Z, schedule). |
| G2 | Memberikan sistem akun aman (register, login, session, proteksi CSRF/XSS). |
| G3 | Menyimpan progres menonton tiap pengguna. |
| G4 | Membangun fitur sosial: komentar, pertemanan, dan chat. |
| G5 | Menyediakan alat moderasi (admin: ban, suspend, hapus user) + kelola anime & jadwal. |
| G6 | Dapat diakses via LAN, tunnel (serveo/cloudflare), dan diinstal sebagai PWA. |
| G7 | Memberikan mekanisme subscribe anime ("ikuti") untuk pengguna. |

**Target Pengguna:** Penonton anime kasual yang ingin layanan gratis + sosial.

---

## 3. Arsitektur Sistem

- **Backend:** Node.js + Express (CommonJS), **arsitektur modular** di folder `src/`.
  `server.js` kini hanya berfungsi sebagai *entry point* (boot HTTP server + banner).
- **Frontend:** HTML statis + vanilla JS + Service Worker (PWA) + `styles.css`
  (glassmorphism design system) + `theme.js` (dark/light).
- **Penyimpanan:** **SQLite** (`better-sqlite3`) sebagai database aktif
  (`data/animehub.sqlite`) via `utils/database.js`. `utils/dataStore.js` menjadi
  *gateway* yang dipakai seluruh route (API lama tetap sama). Data encrypted JSON
  legacy (`data/*.json`) hanya dibaca saat **migrasi otomatis sekali** di boot
  pertama (`utils/dataStoreJsonLegacy.js`). Catatan: `better-sqlite3` adalah
  native module → target deployment PC/Linux (tidak cocok Termux/Android).
- **Keamanan:** helmet, cors, csrf, rate-limit, slow-down, bcryptjs, xss,
  session-file-store, validasi `express-validator`. Password di-hash bcrypt.
- **Konfigurasi:** via `.env` (dotenv), dimuat terpusat di `src/config.js`.

### 3.1 Struktur Modul Backend (`src/`)

| Modul | Tanggung Jawab |
| ----- | -------------- |
| `app.js` | Rakitan Express: pasang middleware & route, global error handler. |
| `config.js` | Muat `.env`, path direktori, daftar file data, opsi CORS. |
| `middleware/security.js` | helmet, CORS, rate-limit, session, CSRF, sanitasi XSS, path-traversal guard. |
| `middleware/auth.js` | `isAuthenticated`, `isAdmin`, `handleValidationErrors`. |
| `routes/auth.js` | register, login, logout, profil, ganti password, progres. |
| `routes/users.js` | profil publik (`GET /api/users/:username`). |
| `routes/comments.js` | komentar (get/post/delete). |
| `routes/social.js` | pertemanan & chat (+ trigger push notif). |
| `routes/anime.js` | CRUD daftar anime (publik + admin). |
| `routes/schedule.js` | CRUD jadwal rilis (publik + admin). |
| `routes/admin.js` | moderasi: ban, suspend, unban, kelola user. |
| `routes/push.js` | subscribe/unsubscribe Web Push (VAPID). |
| `routes/favorites.js` | favorit + subscribe anime per-akun (get/toggle/status). |
| `utils/dataStore.js` | gateway storage (SQLite) — API dipakai seluruh route. |
| `utils/database.js` | SQLite layer (`better-sqlite3`): skema, migrasi, CRUD. |
| `utils/dataStoreJsonLegacy.js` | reader JSON lama — hanya untuk migrasi satu-kali ke SQLite. |
| `utils/crypto.js` | encrypt/decrypt AES-256-GCM (legacy JSON). |
| `utils/push.js` | helper web-push: set VAPID, subscribe, send notif. |

---

## 4. Fitur Utama (Functional Requirements)

### 4.1 Autentikasi & Profil
- `POST /api/register` — daftar akun baru (bcrypt + validasi).
- `POST /api/login` — login, membuat session.
- `POST /api/logout` — menghancurkan session.
- `GET  /api/me` — cek sesi user saat ini.
- `POST /api/update-profile` — ubah profil (terproteksi auth).
- `POST /api/change-password` — ganti password (terproteksi auth).
- `GET  /api/users/:username` — lihat profil publik.

### 4.2 Library / Progres Tontonan
- `POST /api/save-continue-watching` — simpan anime "lanjut tonton".
- `POST /api/update-progress` — update progres episode.

### 4.3 Favorit (per-akun)
- `GET  /api/favorites` — daftar favorit user (id + data anime lengkap).
- `POST /api/favorites/toggle` — tambah/hapus favorit (terproteksi auth).
- `POST /api/favorites/status` — cek status favorit untuk banyak id.
- Favorit tersimpan di tabel `favorites`/kolom SQLite (via `users.username`)
  → sinkron antar perangkat.
- Tampil di halaman `library.html` (section "Favorit").

### 4.4 Subscribe Anime ("ikuti")
- `GET  /api/subscriptions` — daftar anime yang diikuti user.
- `POST /api/subscriptions/toggle` — ikuti/berhenti ikuti anime (payload `animeId`).
- `POST /api/subscriptions/status` — cek status subscribe untuk banyak id.
- Tersimpan di tabel `subscriptions` SQLite, dikelola di
  `routes/favorites.js` (satu modul dengan favorit).
- Tombol "Ikuti" tersedia di halaman beranda/streaming (`index.html`).

### 4.5 Push Notification (PWA)
- `GET  /api/push/vapid-public-key` — public key VAPID untuk frontend.
- `POST /api/push/subscribe` — simpan subscription push user (login).
- `POST /api/push/unsubscribe` — hapus subscription push.
- Notifikasi dikirim otomatis saat ada **chat masuk** dan **permintaan teman**.
- UI toggle notifikasi di halaman `profile.html`.

### 4.6 Sosial — Komentar
- `GET  /api/comments` — daftar komentar.
- `POST /api/comments` — tambah komentar (XSS sanitized).
- `DELETE /api/comments/:id` — hapus komentar.

### 4.7 Sosial — Pertemanan
- `POST /api/friends/request` — kirim permintaan teman.
- `POST /api/friends/accept` — terima permintaan.
- `POST /api/friends/reject` — tolak permintaan.
- `POST /api/friends/unfriend` — hapus teman.
- `GET  /api/friends/list/:username` — daftar teman.
- `GET  /api/friends/requests/:username` — permintaan masuk.
- `GET  /api/friends/status/:u1/:u2` — status relasi.

### 4.8 Sosial — Chat
- `GET  /api/chat/:u1/:u2` — ambil riwayat chat.
- `POST /api/chat` — kirim pesan.

### 4.9 Admin / Moderasi
- `POST /api/admin/suspend` — suspend user.
- `POST /api/admin/ban` — ban user.
- `POST /api/admin/unban` — unban user.
- `GET  /api/admin/banned-list` — daftar banned.
- `GET  /api/admin/users` — daftar user.
- `DELETE /api/admin/users/:username` — hapus user.
- **Search** real-time daftar anime (judul/season/genre) & user (username/display) di `admin.html`.
- Kelola **jadwal rilis** via `schedule.html` (untuk user) & API schedule di bawah.

### 4.10 Jadwal Rilis (Schedule)
- `GET  /api/schedule` — publik, daftar jadwal.
- `POST /api/schedule` — admin, tambah jadwal (field: `title`, `poster`, `genres[]`, `episode`, `day`, `time`).
- `PUT  /api/schedule/:id` — admin, edit jadwal.
- `DELETE /api/schedule/:id` — admin, hapus jadwal.
- Validasi hari (senin–minggu); data disimpan di tabel `schedule` SQLite.
- Tampil di halaman `schedule.html`.

### 4.11 Halaman Frontend (PWA)
| File | Fungsi |
| ---- | ------ |
| `index.html` | Beranda / streaming (+ favorit & filter "Fav", subscribe "Ikuti"). |
| `catalog.html` | Katalog anime A–Z. |
| `schedule.html` | Jadwal rilis anime. |
| `library.html` | Library, lanjut tonton, & favorit. |
| `profile.html` | Profil & toggle notifikasi push. |
| `admin.html` | Panel admin: moderasi user, kelola anime/schedule, search. |
| `manifest.json` + `sw.js` | Konfigurasi PWA, offline cache, push handler. |
| `pwa.js` | Helper: register service worker + subscribe push. |
| `styles.css` | Design system glassmorphism bersama (shared). |
| `theme.js` | Loader tema dark/light (localStorage). |

---

## 5. Non-Functional Requirements

- **Security:** CSRF token wajib di semua mutasi; password di-hash bcrypt;
  data sensitif dienkripsi di rest; rate-limit & slow-down aktif.
- **Performance:** Static file dilayani Express; koneksi SQLite tunggal + WAL mode
  (`better-sqlite3`) untuk I/O yang cepat dan aman terhadap concurrency.
- **Compatibility:** Mendukung akses via LAN & tunnel (CORS reflect origin);
  target deployment PC/Linux (native module `better-sqlite3`).
- **Maintainability:** Pisahkan route & util ke modul (lihat rekomendasi §7).

---

## 6. Struktur Folder Saat Ini

```
AnimeApp/
├── .env                      # konfigurasi rahasia (jangan di-commit)
├── .env.example             # template konfigurasi
├── .gitignore
├── .npmrc
├── server.js                # entry point: boot HTTP server (delegasikan ke src/)
├── package.json
├── package-lock.json
├── src/                     # backend modular (Express)
│   ├── app.js               # rakitan express + middleware + routes
│   ├── config.js            # load .env & path
│   ├── middleware/
│   │   ├── security.js      # helmet, cors, csrf, rate-limit, session, XSS
│   │   └── auth.js          # isAuthenticated, isAdmin, validasi
│   ├── routes/
│   │   ├── auth.js          # register, login, profil, password, progres
│   │   ├── users.js         # profil publik
│   │   ├── comments.js      # komentar
│   │   ├── social.js        # pertemanan & chat (+ push notif)
│   │   ├── anime.js         # CRUD anime
│   │   ├── schedule.js      # CRUD jadwal rilis
│   │   ├── admin.js         # moderasi user
│   │   ├── push.js          # subscribe/unsubscribe Web Push
│   │   └── favorites.js     # favorit + subscribe anime per-akun
│   └── utils/
│       ├── dataStore.js     # gateway storage (SQLite) — dipakai seluruh route
│       ├── database.js      # SQLite layer (better-sqlite3): skema, migrasi, CRUD
│       ├── dataStoreJsonLegacy.js  # reader JSON lama (migrasi sekali)
│       ├── crypto.js        # AES-256-GCM encrypt/decrypt (legacy JSON)
│       └── push.js          # helper web-push
├── public/                  # frontend statis (PWA)
│   ├── index.html
│   ├── catalog.html
│   ├── schedule.html
│   ├── library.html
│   ├── profile.html
│   ├── admin.html           # panel admin (+ search)
│   ├── manifest.json
│   ├── sw.js                # offline cache + push
│   ├── pwa.js               # helper PWA (register SW + subscribe push)
│   ├── styles.css           # glassmorphism design system
│   ├── theme.js             # loader tema dark/light
│   ├── csrf.js
│   ├── Logo.png
│   ├── Icons.png
│   ├── banners/             # banner carousel
│   ├── Poster Anime/        # poster tiap series
│   └── Video/               # aset video
├── data/                    # database aktif + legacy JSON
│   ├── animehub.sqlite      # database aktif (SQLite, better-sqlite3)
│   ├── users.json           # legacy (hanya dibaca saat migrasi awal)
│   ├── comments.json
│   ├── friends.json
│   ├── messages.json
│   ├── banned.json
│   ├── anime.json
│   ├── schedule.json
│   ├── push.json
│   └── sessions/           # session file-store
│       └── *.json
├── node_modules/
└── *.log / cookiesA.txt     # log & aset temp (sebaiknya gitignored)
```

---

## 7. Roadmap & Status

Restrukturisasi monolitik → modular **(✅ SELESAI)** di v7.0.0:

| Item | Status |
| ---- | ------ |
| Pecah `server.js` menjadi modul `src/` | ✅ Selesai |
| `src/config.js` terpusat untuk `.env` & path | ✅ Selesai |
| Middleware keamanan terpisah (`security.js`, `auth.js`) | ✅ Selesai |
| Route dipecah per domain | ✅ Selesai |
| `utils/dataStore.js` + enkripsi at-rest (`crypto.js`) | ✅ Selesai |
| `admin.html` + panel kelola anime | ✅ Selesai |

**Fitur v7.4** (last update):

| Item | Status |
| ---- | ------ |
| Favorit per-akun di database (`routes/favorites.js`) + tampil di `library.html` | ✅ Selesai |
| Web Push Notification (VAPID + `routes/push.js` + `utils/push.js`) | ✅ Selesai |
| True Offline Mode (`sw.js`: cache shell, aset, & API publik) | ✅ Selesai |
| Search real-time anime & user di `admin.html` | ✅ Selesai |
| Subscribe anime ("ikuti") per-akun (`/api/subscriptions/*`) | ✅ Selesai |
| CRUD jadwal rilis (`routes/schedule.js` + `data/schedule.json`) | ✅ Selesai |
| Storage aktif pindah ke **SQLite** (`utils/database.js` + migrasi otomatis dari JSON) | ✅ Selesai |
| Theming UI: `styles.css` (glassmorphism) + `theme.js` (dark/light) | ✅ Selesai |

**Ide berikutnya (v7.5+, jika diinginkan):**
- Tambah `tests/` + CI (unit test untuk routes & crypto).
- Rate-limit per-route yang lebih granular (login/register).
- Notifikasi push saat anime baru ditambahkan admin (terkait fitur subscribe).
- Backup otomatis DB SQLite (mis. `sqlite3 .backup`) untuk mitigasi korupsi file.
- Catatan: `better-sqlite3` tidak berjalan di Termux/Android — untuk deployment
  HP, deployment saat ini tidak ditargetkan (storage aktif sudah SQLite).

---

## 8. Metrik Kesuksesan

- 99% request API < 300ms (lokal).
- 0 kebocoran credential (password terenkripsi/hash).
- Pengguna aktif harian meningkat via fitur sosial (chat & teman).

---

## 9. Risiko & Mitigasi

| Risiko | Mitigasi |
| ------ | -------- |
| DB SQLite rawan korupsi / single-file | WAL mode aktif; backup rutin (`sqlite3 .backup`). |
| Tidak ada tests | Tambah `tests/` + CI. |
| Server file tunggal sulit dipelihara | Restrukturisasi §7. |
