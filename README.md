# AnimeHub 🎬

![Security](https://img.shields.io/badge/security-A%2B-brightgreen) 
![Version](https://img.shields.io/badge/version-7.3.7-blue) 
![License](https://img.shields.io/badge/license-ISC-green)
![Node](https://img.shields.io/badge/node-18.x-green)
![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen)

> Platform streaming anime gratis dengan fitur sosial (temanan, chat, komentar)
> dan panel moderasi admin. Dibangun sebagai **PWA** yang bisa diinstal di HP.

---

## Fitur

- 🔐 **Autentikasi aman** — register/login dengan hash bcrypt, session, proteksi
  CSRF, XSS sanitization, dan rate limiting.
- 📺 **Streaming & Library** — simpan *continue watching* & progres episode.
- 🗂️ **Katalog & Jadwal** — jelajahi anime A–Z dan lihat schedule rilis.
- 💬 **Sosial** — komentar, pertemanan (request/accept/reject), dan chat pribadi.
- 🛡️ **Admin** — ban, suspend, dan kelola pengguna.
- 📱 **PWA** — install di layar utama, service worker, offline shell.

---

## Tech Stack

| Layer | Teknologi |
| ----- | --------- |
| Backend | Node.js, Express 4 |
| Frontend | HTML statis, vanilla JS, Service Worker |
| Storage | File JSON (`data/`) + session-file-store |
| Security | helmet, cors, csurf, express-rate-limit, express-slow-down, bcryptjs, xss, dotenv |

---

## Struktur Folder

```
AnimeApp/
├── server.js                # Entry point backend Express
├── package.json             # Dependensi & script
├── .env.example             # Template konfigurasi environment
├── .gitignore
├── .npmrc
├── public/                  # Frontend (PWA)
│   ├── index.html           # Beranda / streaming
│   ├── catalog.html         # Katalog anime A–Z
│   ├── schedule.html        # Jadwal rilis
│   ├── library.html         # Library & lanjut tonton
│   ├── profile.html         # Profil pengguna
│   ├── manifest.json        # Konfigurasi PWA
│   ├── sw.js                # Service worker
│   ├── csrf.js              # Helper CSRF frontend
│   ├── Logo.png
│   ├── Icons.png
│   ├── banners/             # Banner carousel
│   ├── Poster Anime/        # Poster tiap series
│   └── Video/               # Aset video
├── data/                    # Penyimpanan data (JSON "database")
│   ├── users.json
│   ├── comments.json
│   ├── friends.json
│   ├── messages.json
│   ├── banned.json
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

# 3. Jalankan server
npm start
# atau
node server.js
```

Server berjalan di `http://localhost:8080` (atau `PORT` di `.env`).

---

## Konfigurasi (`.env`)

| Variabel | Keterangan |
| -------- | ---------- |
| `SESSION_SECRET` | Secret session, min 32 karakter acak. |
| `ENCRYPTION_KEY` | Key AES-256-GCM, 64 karakter hex. |
| `ALLOWED_ORIGINS` | Origin CORS (`*` untuk tunnel/LAN). |
| `NODE_ENV` | `development` / `production`. |
| `PORT` | Port server (default 8080). |

---

## API Endpoint (Ringkasan)

**Auth & Profil**
- `POST /api/register`, `POST /api/login`, `POST /api/logout`
- `POST /api/update-profile`, `GET /api/users/:username`

**Library**
- `POST /api/save-continue-watching`, `POST /api/update-progress`

**Komentar**
- `GET /api/comments`, `POST /api/comments`, `DELETE /api/comments/:id`

**Pertemanan**
- `POST /api/friends/request|accept|reject|unfriend`
- `GET /api/friends/list/:username`, `GET /api/friends/requests/:username`

**Chat**
- `GET /api/chat/:u1/:u2`, `POST /api/chat`

**Admin**
- `POST /api/admin/ban|unban|suspend`
- `GET /api/admin/users`, `GET /api/admin/banned-list`
- `DELETE /api/admin/users/:username`

> Semua endpoint mutasi memerlukan header `CSRF-Token` (ambil dari
> `GET /api/csrf-token`).

---

## Keamanan

Proyek ini menerapkan pertahanan berlapis:
helmet, CORS terkontrol, CSRF token, rate-limit & slow-down, hashing password
bcrypt, sanitasi XSS, dan enkripsi data sensitif di rest (AES-256-GCM).
**Jangan pernah meng-commit file `.env`.**

---

## Lisensi

ISC
