# AnimeHub 🎬

![Security](https://img.shields.io/badge/security-A%2B-brightgreen) 
![Version](https://img.shields.io/badge/version-7.4.0-blue) 
![License](https://img.shields.io/badge/license-ISC-green)
![Node](https://img.shields.io/badge/node-18.x-green)
![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen)

> Platform streaming anime gratis dengan fitur sosial (temanan, chat, komentar)
> dan panel moderasi admin. Dibangun sebagai **PWA** yang bisa diinstal di HP.

**Versi:** 7.4.0

---

## Fitur

- 🔐 **Autentikasi aman** — register/login dengan hash bcrypt, session, proteksi
  CSRF, XSS sanitization, dan rate limiting.
- 📺 **Streaming & Library** — simpan *continue watching* & progres episode.
- ❤️ **Favorit** — simpan anime favorit **per akun** (database), sinkron antar perangkat.
- 🔔 **Subscribe anime** — ikuti anime favoritmu ("ikuti") dan kelola dari library; terhubung dengan sistem notifikasi PWA.
- 🗂️ **Katalog & Jadwal** — jelajahi anime A–Z dan lihat schedule rilis; admin bisa kelola jadwal (tambah/edit/hapus).
- 💬 **Sosial** — komentar, pertemanan (request/accept/reject), dan chat pribadi.
- 🛡️ **Admin** — ban, suspend, kelola pengguna, kelola jadwal, dan **search** cepat daftar anime/user.
- 📱 **PWA** — install di layar utama, **offline mode** (cache shell & aset), dan **Web Push Notifications**.

---

## Tech Stack

| Layer | Teknologi |
| ----- | --------- |
| Backend | Node.js, Express 4 |
| Frontend | HTML statis, vanilla JS, Service Worker, glassmorphism CSS (`styles.css`), theme loader (`theme.js`) |
| Storage | **SQLite (`better-sqlite3`)** — database aktif `data/animehub.sqlite` (migrasi otomatis dari encrypted JSON legacy di boot pertama) + session-file-store |
| Push Notification | web-push (VAPID) |
| Security | helmet, cors, csurf, express-rate-limit, express-slow-down, bcryptjs, xss, dotenv, express-validator, morgan |

---

## Struktur Folder

```
AnimeApp/
├── server.js                # Entry point: boot HTTP server (delegasikan ke src/)
├── package.json             # Dependensi & script
├── .env.example             # Template konfigurasi environment
├── .gitignore
├── .npmrc
├── src/                     # Backend modular (Express)
│   ├── app.js               # Rakitan express + middleware + routes
│   ├── config.js            # Load .env & path direktori
│   ├── middleware/
│   │   ├── security.js      # helmet, CORS, CSRF, rate-limit, session, XSS
│   │   └── auth.js          # isAuthenticated, isAdmin, validasi
│   ├── routes/
│   │   ├── auth.js           # register, login, profil, ganti password, progres
│   │   ├── users.js          # profil publik
│   │   ├── comments.js       # komentar
│   │   ├── social.js         # pertemanan & chat (+ push notif)
│   │   ├── anime.js          # CRUD anime
│   │   ├── schedule.js       # CRUD jadwal rilis (admin)
│   │   ├── admin.js          # moderasi user
│   │   ├── push.js           # subscribe/unsubscribe Web Push
│   │   └── favorites.js      # favorit + subscribe anime per-akun
│   └── utils/
│       ├── dataStore.js      # Gateway storage (SQLite) dipakai seluruh route
│       ├── dataStoreJsonLegacy.js  # reader JSON lama (hanya utk migrasi sekali)
│       ├── database.js       # SQLite layer (better-sqlite3): skema, migrasi, CRUD
│       ├── crypto.js         # AES-256-GCM encrypt/decrypt (legacy JSON)
│       └── push.js           # helper web-push (send/subscribe)
├── public/                  # Frontend (PWA)
│   ├── index.html           # Beranda / streaming (+ subscribe & filter "Fav")
│   ├── catalog.html         # Katalog anime A–Z
│   ├── schedule.html        # Jadwal rilis
│   ├── library.html         # Library, lanjut tonton, & favorit
│   ├── profile.html         # Profil & toggle notifikasi
│   ├── admin.html           # Panel admin (moderasi, kelola anime/schedule, search)
│   ├── manifest.json        # Konfigurasi PWA
│   ├── sw.js                # Service worker (offline + push)
│   ├── pwa.js               # Helper PWA: register SW + subscribe push
│   ├── styles.css           # Design system glassmorphism (shared)
│   ├── theme.js             # Loader theme dark/light
│   ├── csrf.js              # Helper CSRF frontend
│   ├── Logo.png
│   ├── Icons.png
│   ├── banners/             # Banner carousel
│   ├── Poster Anime/        # Poster tiap series
│   └── Video/               # Aset video
├── data/                    # Database & legacy JSON
│   ├── animehub.sqlite      # Database aktif (SQLite, better-sqlite3)
│   ├── users.json           # Legacy (migrasi sekali ke SQLite; tdk dipakai lagi)
│   ├── comments.json
│   ├── friends.json
│   ├── messages.json
│   ├── banned.json
│   ├── anime.json
│   ├── schedule.json
│   ├── push.json
│   └── sessions/            # Session file-store
└── node_modules/
```

---

## Instalasi & Menjalankan

```bash
# 1. Install dependensi
npm install

# 2. Siapkan environment
cp .env.example .env
# edit .env dan ubah SESSION_SECRET & ENCRYPTION_KEY dengan nilai acak

# 3. (Opsional) Untuk Web Push Notification, generate VAPID key:
npm run vapid:keys
# lalu isi VAPID_PUBLIC_KEY & VAPID_PRIVATE_KEY di .env

# 4. Jalankan server
npm start
# atau
node server.js
```

Server berjalan di `http://localhost:8080` (atau `PORT` di `.env`).

> **Catatan storage:** mulai v7.4 storage aktif adalah **SQLite** (`better-sqlite3`),
> dependensi native — jalankan di PC/Linux (bukan Termux/Android). Data JSON
> lama di `data/*.json` otomatis dimigrasikan sekali saat boot pertama,
> dan tidak lagi dipakai untuk baca/tulis.

---

## Konfigurasi (`.env`)

| Variabel | Keterangan |
| -------- | ---------- |
| `SESSION_SECRET` | Secret session, min 32 karakter acak. |
| `ENCRYPTION_KEY` | Key AES-256-GCM, 64 karakter hex. |
| `ALLOWED_ORIGINS` | Origin CORS (`*` untuk tunnel/LAN). |
| `NODE_ENV` | `development` / `production`. |
| `PORT` | Port server (default 8080). |
| `VAPID_PUBLIC_KEY` | Public key push notifikasi (generate via `npx web-push generate-vapid-keys`). |
| `VAPID_PRIVATE_KEY` | Private key push notifikasi (rahasia). |
| `VAPID_SUBJECT` | Contact `mailto:` untuk push (default `mailto:admin@animehub.local`). |

---

## API Endpoint (Ringkasan)

**Auth & Profil**
- `POST /api/register`, `POST /api/login`, `POST /api/logout`
- `GET /api/me` — cek sesi user
- `POST /api/update-profile`, `POST /api/change-password`
- `GET /api/users/:username`

**Library**
- `POST /api/save-continue-watching`, `POST /api/update-progress`

**Favorit (database, per-akun)**
- `GET /api/favorites` — daftar favorit user (id + data anime)
- `POST /api/favorites/toggle` — tambah/hapus (payload `animeId`)
- `POST /api/favorites/status` — cek status (payload `animeIds[]`)

**Subscribe Anime ("ikuti", per-akun)**
- `GET /api/subscriptions` — daftar anime yang diikuti
- `POST /api/subscriptions/toggle` — ikuti/berhenti (payload `animeId`)
- `POST /api/subscriptions/status` — cek status (payload `animeIds[]`)

**Komentar**
- `GET /api/comments`, `POST /api/comments`, `DELETE /api/comments/:id`

**Pertemanan**
- `POST /api/friends/request` — kirim permintaan (payload `sender`, `receiver`)
- `POST /api/friends/accept` — terima (payload `requestId`)
- `POST /api/friends/reject` — tolak (payload `requestId`)
- `POST /api/friends/unfriend` — hapus teman (payload `user1`, `user2`)
- `GET /api/friends/list/:username`, `GET /api/friends/requests/:username`
- `GET /api/friends/status/:user1/:user2`, `GET /api/friends/:username`

**Chat**
- `GET /api/chat/:u1/:u2`, `POST /api/chat`

**Push Notification**
- `GET /api/push/vapid-public-key` — ambil public key VAPID
- `POST /api/push/subscribe` — simpan subscription push (login)
- `POST /api/push/unsubscribe` — hapus subscription push

**Admin**
- `POST /api/admin/ban|unban|suspend`
- `GET /api/admin/users`, `GET /api/admin/banned-list`
- `DELETE /api/admin/users/:username`

**Daftar Anime (SQLite)**
- `GET /api/anime` — publik, daftar semua anime
- `POST /api/anime` — admin, tambah anime (field: `title`, `season`, `poster`, `genres[]`, `synopsis`, `episodes[{title,file}]`)
- `PUT /api/anime/:id` — admin, edit anime
- `DELETE /api/anime/:id` — admin, hapus anime

**Jadwal Rilis (SQLite)**
- `GET /api/schedule` — publik, daftar jadwal
- `POST /api/schedule` — admin, tambah jadwal (field: `title`, `poster`, `genres[]`, `episode`, `day`, `time`)
- `PUT /api/schedule/:id` — admin, edit jadwal
- `DELETE /api/schedule/:id` — admin, hapus jadwal

> Panel admin kelola anime & jadwal: buka `admin.html` (login sebagai admin).
> Semua endpoint mutasi memerlukan header `CSRF-Token` (ambil dari
> `GET /api/csrf-token`).

---

## Keamanan

Proyek ini menerapkan pertahanan berlapis:
helmet, CORS terkontrol, CSRF token, rate-limit & slow-down, hashing password
bcrypt, dan sanitasi XSS. Storage aktif SQLite (`data/animehub.sqlite`);
password tetap di-hash bcrypt. File JSON legacy kini hanya untuk migrasi awal.
**Jangan pernah meng-commit file `.env`.**

---

## Lisensi

ISC
