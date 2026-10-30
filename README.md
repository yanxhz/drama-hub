# DramaHub 🎬

Streaming-style catalog untuk **Drakor (drama Korea)**, **Dracin (drama Tiongkok)**, dan **Film** (layar lebar). Website ini menampilkan trailer resmi dan link ke platform nonton legal — bukan streaming bajakan.

🔗 **Live:** https://drama-hub-4af.pages.dev

## ✨ Fitur

- **Katalog dinamis** dari [TMDB API](https://www.themoviedb.org/) — ratusan judul, diperbarui otomatis
- **Tab filter:** Semua / Drakor / Dracin / Film
- **Pencarian** judul, genre, atau aktor di seluruh database TMDB
- **Halaman detail** per judul:
  - Info lengkap (tahun, negara, cast, sinopsis, genre)
  - Poster asli dari TMDB
  - **Trailer resmi** (YouTube embed)
  - **Link platform nonton legal** dari watch providers TMDB (Netflix, Viu, iQIYI, WeTV, dll)
- **Responsif** — enak dilihat di mobile dan desktop
- API key TMDB **aman**: disimpan sebagai secret di sisi server (Cloudflare Pages Function), tidak diekspos ke browser

## 🛠 Teknologi

- HTML / CSS / JavaScript vanilla (tanpa framework)
- [Cloudflare Pages](https://pages.cloudflare.com/) — hosting + Functions
- [TMDB API](https://developers.themoviedb.org/) — metadata, poster, trailer
- YouTube embed (youtube-nocookie) — trailer resmi

## 🚀 Menjalankan Lokal

```bash
# 1. Klon repo
git clone https://github.com/yanxhz/drama-hub.git
cd drama-hub

# 2. Siapkan API key TMDB
#    Buat file .dev.vars berisi:
#    TMDB_API_KEY=key_anda

# 3. Jalankan server dev (dengan Cloudflare Pages Functions)
npx wrangler pages dev . --port 8788
```

Buka http://127.0.0.1:8788

## 🔐 Variabel Lingkungan

| Variabel | Deskripsi | Diperlukan |
|---|---|---|
| `TMDB_API_KEY` | API key v3 dari themoviedb.org | Ya |

Di **Cloudflare Pages**, set `TMDB_API_KEY` sebagai secret (bukan variabel biasa).

## 📦 Deploy

### Otomatis (GitHub Actions)
Setiap `push` ke branch `main` otomatis men-deploy ke Cloudflare Pages. Project memerlukan dua secret di GitHub (Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN` — token dengan izin *Cloudflare Pages: Edit*
- `CLOUDFLARE_ACCOUNT_ID` — ID akun Cloudflare

### Manual
```bash
npx wrangler pages deploy . --project-name drama-hub --branch main
```

## ⚖️ Legal

Website ini **tidak menyimpan, mengunggah, atau menyediakan konten bajakan**. Semua konten yang ditampilkan:
- **Trailer resmi** yang diembed dari YouTube (channel pemegang hak), dan
- **Link ke platform streaming resmi** (Netflix, Viu, iQIYI, WeTV, dll).

Data metadata dan poster diambil dari TMDB berdasarkan [syarat penggunaan TMDB](https://www.themoviedb.org/documentation/api/terms-of-use).

## 📄 Lisensi

[MIT](LICENSE)
