# PRD — AnimeHub

**Product Requirements Document**
**Versi:** 1.0.0
**Tanggal:** 29 Agustus 2026
**Status:** Draft

---

## 1. Ringkasan Produk (Overview)

**AnimeHub** adalah sebuah aplikasi web streaming anime gratis yang menyajikan
pengalaman sosial bagi pengguna. Selain menonton anime, pengguna dapat membuat
akun, menyimpan progres tontonan (*continue watching*), berinteraksi lewat
komentar, menambah teman, mengobrol (chat pribadi), serta mengelola profil
mereka. Di sisi backend, terdapat panel admin untuk memoderasi pengguna
(ban/suspend).

Aplikasi dijalankan sebagai **PWA (Progressive Web App)** sehingga dapat
diinstal di perangkat mobile dan berjalan layaknya aplikasi native.

---

## 2. Tujuan & Sasaran

| Tujuan | Deskripsi |
| ------ | --------- |
| G1 | Menyediakan katalog anime yang dapat dijelajahi (index, catalog A–Z, schedule). |
| G2 | Memberikan sistem akun aman (register, login, session, proteksi CSRF/XSS). |
| G3 | Menyimpan progres menonton tiap pengguna. |
| G4 | Membangun fitur sosial: komentar, pertemanan, dan chat. |
| G5 | Menyediakan alat moderasi (admin: ban, suspend, hapus user). |
| G6 | Dapat diakses via LAN, tunnel (serveo/cloudflare), dan diinstal sebagai PWA. |

**Target Pengguna:** Penonton anime kasual yang ingin layanan gratis + sosial.

---

## 3. Arsitektur Sistem

- **Backend:** Node.js + Express (CommonJS), single file `server.js`.
- **Frontend:** HTML statis + vanilla JS + Service Worker (PWA).
- **Penyimpanan:** File JSON di folder `data/` (tanpa database eksternal).
- **Keamanan:** helmet, cors, csrf, rate-limit, slow-down, bcryptjs, xss,
  session-file-store, enkripsi AES-256-GCM untuk data sensitif di rest.
- **Konfigurasi:** via `.env` (dotenv).

---

## 4. Fitur Utama (Functional Requirements)

### 4.1 Autentikasi & Profil
- `POST /api/register` — daftar akun baru (bcrypt + validasi).
- `POST /api/login` — login, membuat session.
- `POST /api/logout` — menghancurkan session.
- `POST /api/update-profile` — ubah profil (terproteksi auth).
- `GET  /api/users/:username` — lihat profil publik.

### 4.2 Library / Progres Tontonan
- `POST /api/save-continue-watching` — simpan anime "lanjut tonton".
- `POST /api/update-progress` — update progres episode.

### 4.3 Sosial — Komentar
- `GET  /api/comments` — daftar komentar.
- `POST /api/comments` — tambah komentar (XSS sanitized).
- `DELETE /api/comments/:id` — hapus komentar.

### 4.4 Sosial — Pertemanan
- `POST /api/friends/request` — kirim permintaan teman.
- `POST /api/friends/accept` — terima permintaan.
- `POST /api/friends/reject` — tolak permintaan.
- `POST /api/friends/unfriend` — hapus teman.
- `GET  /api/friends/list/:username` — daftar teman.
- `GET  /api/friends/requests/:username` — permintaan masuk.
- `GET  /api/friends/status/:u1/:u2` — status relasi.

### 4.5 Sosial — Chat
- `GET  /api/chat/:u1/:u2` — ambil riwayat chat.
- `POST /api/chat` — kirim pesan.

### 4.6 Admin / Moderasi
- `POST /api/admin/suspend` — suspend user.
- `POST /api/admin/ban` — ban user.
- `POST /api/admin/unban` — unban user.
- `GET  /api/admin/banned-list` — daftar banned.
- `GET  /api/admin/users` — daftar user.
- `DELETE /api/admin/users/:username` — hapus user.

### 4.7 Halaman Frontend (PWA)
| File | Fungsi |
| ---- | ------ |
| `index.html` | Beranda / streaming. |
| `catalog.html` | Katalog anime A–Z. |
| `schedule.html` | Jadwal rilis anime. |
| `library.html` | Library & lanjut tonton user. |
| `profile.html` | Profil & pengaturan akun. |
| `manifest.json` + `sw.js` | Konfigurasi PWA & offline. |

---

## 5. Non-Functional Requirements

- **Security:** CSRF token wajib di semua mutasi; password di-hash bcrypt;
  data sensitif dienkripsi di rest; rate-limit & slow-down aktif.
- **Performance:** Static file dilayani Express; JSON I/O ringan.
- **Compatibility:** Mendukung akses via LAN & tunnel (CORS reflect origin).
- **Maintainability:** Pisahkan route & util ke modul (lihat rekomendasi §7).

---

## 6. Struktur Folder Saat Ini

```
AnimeApp/
├── .env                      # konfigurasi rahasia (jangan di-commit)
├── .env.example             # template konfigurasi
├── .gitignore
├── .npmrc
├── server.js                # backend Express (1003 baris)
├── package.json
├── package-lock.json
├── public/                  # frontend statis (PWA)
│   ├── index.html
│   ├── catalog.html
│   ├── schedule.html
│   ├── library.html
│   ├── profile.html
│   ├── manifest.json
│   ├── sw.js
│   ├── csrf.js
│   ├── Logo.png
│   ├── Icons.png
│   ├── banners/
│   │   ├── banner1.jpg ... banner4.jpg
│   │   └── .nomedia
│   ├── Poster Anime/        # poster tiap series
│   │   └── .nomedia
│   └── Video/               # aset video
│       └── .nomedia
├── data/                    # penyimpanan JSON (database file)
│   ├── users.json
│   ├── comments.json
│   ├── friends.json
│   ├── messages.json
│   ├── banned.json
│   └── sessions/           # session file-store
│       └── *.json
├── node_modules/
└── *.log / cookiesA.txt     # log & aset temp (sebaiknya gitignored)
```

---

## 7. Rekomendasi Restrukturisasi (Roadmap)

Agar `server.js` tidak monolitik, pecah menjadi modul:

```
AnimeApp/
├── src/
│   ├── app.js              # inisialisasi express & middleware
│   ├── config/env.js       # load .env
│   ├── middleware/
│   │   ├── auth.js         # isAuthenticated, isAdmin
│   │   ├── security.js     # helmet, cors, csrf, rate-limit
│   │   └── validate.js
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── social.routes.js
│   │   ├── library.routes.js
│   │   └── admin.routes.js
│   ├── services/
│   │   ├── store.js        # read/save JSON
│   │   └── crypto.js       # encrypt/decrypt
│   └── utils/
├── public/                 # (tetap)
├── data/                   # (tetap)
└── tests/
```

---

## 8. Metrik Kesuksesan

- 99% request API < 300ms (lokal).
- 0 kebocoran credential (password terenkripsi/hash).
- Pengguna aktif harian meningkat via fitur sosial (chat & teman).

---

## 9. Risiko & Mitigasi

| Risiko | Mitigasi |
| ------ | -------- |
| File JSON rawan korupsi saat concurrency | Pindah ke DB (SQLite) di v2. |
| Tidak ada tests | Tambah `tests/` + CI. |
| Server file tunggal sulit dipelihara | Restrukturisasi §7. |
