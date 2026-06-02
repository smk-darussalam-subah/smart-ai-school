# Environment Variables — DIIS Smart AI School

**Versi Dokumen:** 1.0 | 2026-05-29  
**Source of truth:** `.env.example` di root monorepo

> ⚠️ **JANGAN COMMIT file `.env` ke Git.** File `.env.example` berisi template placeholder yang aman untuk di-commit.

---

## Cara Setup

```bash
# 1. Copy template
cp .env.example .env

# 2. Edit semua nilai — ganti semua placeholder GANTI_* dan GENERATE_*
nano .env

# 3. Generate secret secara aman
openssl rand -base64 32          # untuk password
openssl rand -hex 32             # untuk secret key (JWT, session, dll)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 1. Environment Global

| Variable | Required | Default | Deskripsi | Contoh |
|----------|----------|---------|-----------|--------|
| `NODE_ENV` | Ya | `development` | Environment mode | `production` |
| `TZ` | Ya | — | Timezone sistem | `Asia/Jakarta` |

---

## 2. PostgreSQL Database

Digunakan oleh: `postgres` container, `api` service, `keycloak`, `n8n`, `metabase`

| Variable | Required | Default | Deskripsi | Contoh |
|----------|----------|---------|-----------|--------|
| `POSTGRES_DB` | Ya | `smk_db` | Nama database utama | `smk_db` |
| `POSTGRES_USER` | Ya | `smk_admin` | Username superuser PostgreSQL | `smk_admin` |
| `POSTGRES_PASSWORD` | **Wajib diisi** | — | Password PostgreSQL (min 20 karakter) | `<password-kuat>` |
| `DATABASE_URL` | Ya | — | Connection string Prisma (format postgresql://) | `postgresql://smk_admin:<pass-encoded>@postgres:5432/smk_db` |

> **Catatan:** `DATABASE_URL` digunakan oleh `apps/api` via Prisma. Untuk koneksi dari dalam Docker network, hostname adalah `postgres` (bukan `localhost`). Untuk dev lokal, gunakan `localhost` dengan port dari `docker-compose.dev.yml`.
>
> ⚠️ **URL-Encoding Wajib:** Jika `POSTGRES_PASSWORD` mengandung karakter khusus (`@`, `#`, `!`, `%`, dll), password **harus di-URL-encode** sebelum dimasukkan ke `DATABASE_URL`. Contoh: password `p@ss#1` → encoded `p%40ss%231`. Script `deploy.yml` melakukan encoding otomatis via `python3 urllib.parse.quote()`. Untuk set manual:
> ```bash
> python3 -c "import urllib.parse; print(urllib.parse.quote('p@ss#1', safe=''))"
> # Output: p%40ss%231
> ```

---

## 3. Redis

Digunakan oleh: `redis` container, `api` service (ThrottlerModule, queue)

| Variable | Required | Default | Deskripsi | Contoh |
|----------|----------|---------|-----------|--------|
| `REDIS_PASSWORD` | **Wajib diisi** | — | Password Redis (--requirepass) | `<password-kuat>` |
| `REDIS_URL` | Ya | — | Connection URL dengan password (URL-encoded) | `redis://:<pass-encoded>@redis:6379` |

> ⚠️ **URL-Encoding Wajib:** Sama seperti `DATABASE_URL` — jika `REDIS_PASSWORD` mengandung karakter khusus, harus di-URL-encode. Script `deploy.yml` menangani ini secara otomatis.

---

## 4. Keycloak Auth Server

Digunakan oleh: `keycloak` container, `api` service, `web` service

| Variable | Required | Default | Deskripsi | Contoh |
|----------|----------|---------|-----------|--------|
| `KC_ADMIN_USER` | Ya | `admin` | Username admin Keycloak console | `admin` |
| `KC_ADMIN_PASSWORD` | **Wajib diisi** | — | Password admin Keycloak | `<password-kuat>` |
| `KEYCLOAK_URL` | Ya | — | URL internal Docker (dari api service) | `http://keycloak:8080` |
| `KEYCLOAK_REALM` | Ya | — | Nama realm | `diis` |
| `KEYCLOAK_ISSUER` | Ya | — | Issuer URL untuk token validation | `http://keycloak:8080/realms/diis` |
| `KEYCLOAK_WEB_CLIENT_SECRET` | **Wajib diisi** | — | Secret client `diis-web` (dari Keycloak admin) | `<generate-dari-keycloak>` |
| `KEYCLOAK_API_CLIENT_SECRET` | **Wajib diisi** | — | Secret client `diis-api` (dari Keycloak admin) | `<generate-dari-keycloak>` |

> **Cara generate client secret:** Keycloak admin console → Clients → `diis-web` → Credentials → Regenerate Secret

---

## 5. next-auth (apps/web)

File: `apps/web/.env.local`

| Variable | Required | Default | Deskripsi | Contoh |
|----------|----------|---------|-----------|--------|
| `NEXTAUTH_URL` | Ya | `http://localhost:3000` | URL publik aplikasi web (tanpa trailing slash) | `https://smkdarussalamsubah.sch.id` |
| `NEXTAUTH_SECRET` | **Wajib diisi** | — | Secret untuk enkripsi cookie/JWT (min 32 karakter) | `<openssl-rand-hex-32>` |
| `KEYCLOAK_CLIENT_ID` | Ya | — | ID client untuk web | `diis-web` |
| `KEYCLOAK_CLIENT_SECRET` | **Wajib diisi** | — | Sama dengan `KEYCLOAK_WEB_CLIENT_SECRET` | `<dari-keycloak>` |
| `KEYCLOAK_ISSUER` | Ya | — | Issuer URL (penting: akses dari browser, gunakan public URL) | `https://auth.smkdarussalamsubah.sch.id/realms/diis` |
| `API_URL` | Tidak | `http://localhost:3001` | URL backend API untuk Next.js rewrite | `http://api:3001` |

> **Penting:** `KEYCLOAK_ISSUER` untuk `apps/web` harus menggunakan URL **publik** (bukan `http://keycloak:8080`) karena redirect browser keluar dari Docker network.

---

## 6. apps/api — NestJS Backend

File: `apps/api/.env`

| Variable | Required | Default | Deskripsi | Contoh |
|----------|----------|---------|-----------|--------|
| `NODE_ENV` | Ya | `development` | Environment mode | `production` |
| `API_PORT` | Tidak | `3001` | Port NestJS server | `3001` |
| `DATABASE_URL` | Ya | — | PostgreSQL connection string | `postgresql://...` |
| `REDIS_URL` | Ya | — | Redis connection URL | `redis://:pass@redis:6379` |
| `KEYCLOAK_URL` | Ya | — | Keycloak base URL (internal Docker) | `http://keycloak:8080` |
| `KEYCLOAK_REALM` | Ya | — | Keycloak realm | `diis` |
| `KEYCLOAK_CLIENT_ID` | Ya | — | Client ID API | `diis-api` |
| `KEYCLOAK_CLIENT_SECRET` | Ya | — | Client secret API | `<dari-keycloak>` |
| `ALLOWED_ORIGINS` | Tidak | `http://localhost:3000` | CORS whitelist (koma-separated) | `https://smkdarussalamsubah.sch.id` |
| `OLLAMA_URL` | Tidak | — | URL Ollama untuk AI inference | `http://ollama:11434` |
| `ANTHROPIC_API_KEY` | Tidak | — | Anthropic API key (Claude AI) | `sk-ant-...` |
| `LOG_LEVEL` | Tidak | `info` | Winston log level | `info` / `debug` |
| `TZ` | Ya | — | Timezone | `Asia/Jakarta` |

> **Validasi fail-fast:** Semua variable mandatory divalidasi oleh `apps/api/src/config/env.validation.ts` (Zod) sebelum NestJS bootstrap. Server tidak akan start jika ada variable yang hilang/invalid.

---

## 7. n8n Automation

| Variable | Required | Default | Deskripsi | Contoh |
|----------|----------|---------|-----------|--------|
| `N8N_BASIC_AUTH_USER` | Ya | `admin` | Username Basic Auth n8n | `admin` |
| `N8N_BASIC_AUTH_PASSWORD` | **Wajib diisi** | — | Password Basic Auth n8n | `<password-kuat>` |
| `N8N_ENCRYPTION_KEY` | **Wajib diisi** | — | Key enkripsi credential n8n (32 karakter) | `<openssl-rand-hex-32>` |

---

## 8. Monitoring

| Variable | Required | Default | Deskripsi | Contoh |
|----------|----------|---------|-----------|--------|
| `GRAFANA_ADMIN_USER` | Ya | `admin` | Username Grafana | `admin` |
| `GRAFANA_ADMIN_PASSWORD` | **Wajib diisi** | — | Password Grafana dashboard | `<password-kuat>` |

---

## 9. MinIO File Storage

| Variable | Required | Default | Deskripsi | Contoh |
|----------|----------|---------|-----------|--------|
| `MINIO_ROOT_USER` | Ya | `smkadmin` | Username root MinIO | `smkadmin` |
| `MINIO_ROOT_PASSWORD` | **Wajib diisi** | — | Password root MinIO (min 8 karakter) | `<password-kuat>` |

---

## 10. Backup (pg-backup service)

Diset otomatis dari variable lain — tidak perlu diisi terpisah jika sudah mengisi `POSTGRES_*` dan `MINIO_*`. Referensi dari docker-compose.yml:

| Variable | Sumber | Deskripsi |
|----------|--------|-----------|
| `PGPASSWORD` | = `POSTGRES_PASSWORD` | Password pg_dump |
| `POSTGRES_HOST` | hardcoded `postgres` | Hostname DB |
| `POSTGRES_USER` | = `POSTGRES_USER` | User DB |
| `POSTGRES_DB` | = `POSTGRES_DB` | Nama DB |
| `MINIO_ENDPOINT` | hardcoded `http://minio:9000` | MinIO endpoint |
| `MINIO_ACCESS_KEY` | = `MINIO_ROOT_USER` | MinIO access key |
| `MINIO_SECRET_KEY` | = `MINIO_ROOT_PASSWORD` | MinIO secret key |
| `BACKUP_BUCKET` | hardcoded `diis-backup` | Nama bucket backup |
| `BACKUP_RETENTION_DAYS` | hardcoded `7` | Retensi hari |

---

## 11. Integrasi Eksternal (Opsional)

| Variable | Required | Deskripsi | Contoh |
|----------|----------|-----------|--------|
| `ANTHROPIC_API_KEY` | Tidak | Claude AI API key | `sk-ant-...` |
| `OPENAI_API_KEY` | Tidak | OpenAI backup | `sk-...` |
| `FONNTE_API_KEY` | Tidak | WhatsApp notification (Fonnte) | `<api-key>` |
| `FONNTE_SENDER_NUMBER` | Tidak | Nomor WhatsApp pengirim | `628XXXXXXXXXX` |
| `ADMIN_PHONE_NUMBER` | Tidak | Nomor admin untuk notifikasi sistem | `628XXXXXXXXXX` |
| `SMTP_HOST` | Tidak | SMTP server untuk email | `smtp.gmail.com` |
| `SMTP_PORT` | Tidak | SMTP port | `587` |
| `SMTP_USER` | Tidak | SMTP username/email | `noreply@smkdarussalamsubah.sch.id` |
| `SMTP_PASSWORD` | Tidak | SMTP password/app password | `<app-password>` |

### 11a. NotificationAdapter (SMA-42)

Digunakan oleh `apps/api` — `NotificationModule`. Semua opsional; CI tanpa key tetap boot pakai `LogAdapter`.

| Variable | Required | Default | Deskripsi | Contoh |
|----------|----------|---------|-----------|--------|
| `NOTIF_PROVIDER` | Tidak | `log` | Provider aktif: `fonnte` \| `smtp` \| `log` | `fonnte` |
| `FONNTE_API_KEY` | Ya jika `NOTIF_PROVIDER=fonnte` | — | API key Fonnte (header Authorization) | `<api-key-fonnte>` |
| `ADMIN_PHONE_NUMBER` | Tidak | — | Nomor WA admin (dipakai n8n + notif sistem) | `628XXXXXXXXXX` |
| `SMTP_HOST` | Ya jika `NOTIF_PROVIDER=smtp` | — | SMTP server | `smtp.gmail.com` |
| `SMTP_PORT` | Ya jika `NOTIF_PROVIDER=smtp` | `587` | SMTP port | `587` |
| `SMTP_USER` | Ya jika `NOTIF_PROVIDER=smtp` | — | Email pengirim | `noreply@smkdarussalamsubah.sch.id` |
| `SMTP_PASSWORD` | Ya jika `NOTIF_PROVIDER=smtp` | — | App password / SMTP password | `<app-password>` |

> **Catatan:** `NOTIF_PROVIDER=smtp` adalah stub (Sprint 4 — Nodemailer belum dikonfirmasi direktur). Gunakan `fonnte` atau `log` di Sprint 3.
> `LogAdapter` hanya men-log ke Winston (aman untuk dev/CI — tidak kirim ke luar).

---

### 11b. AIGateway / OllamaAdapter (SMA-45)

Digunakan oleh `apps/api` — `AiModule`. Semua opsional; CI tanpa Ollama tetap boot (gateway tersedia via DI tapi backfill tidak dijalankan otomatis).

> **Gate §2.1 (ATURAN KERAS):** `OLLAMA_EMBED_DIMENSIONS` HARUS sama persis dengan output dimensi model embedding yang dipakai. Mismatch → pgvector error saat INSERT. Single source of truth dimensi = env ini.

| Variable | Required | Default | Deskripsi | Contoh |
|----------|----------|---------|-----------|--------|
| `AI_PROVIDER` | Tidak | `ollama` | Provider aktif: `ollama` \| `claude` (Sprint 4) | `ollama` |
| `OLLAMA_URL` | Tidak | `http://ollama:11434` | Base URL Ollama (dalam Docker network) | `http://ollama:11434` |
| `OLLAMA_CHAT_MODEL` | Tidak | `qwen2.5:7b` | Model Ollama untuk chat RAG (D-2: qwen2.5:7b) | `qwen2.5:7b` |
| `OLLAMA_EMBED_MODEL` | Tidak | `nomic-embed-text` | Model Ollama untuk embedding (§2.1: 768d) | `nomic-embed-text` |
| `OLLAMA_EMBED_DIMENSIONS` | Tidak | `768` | Dimensi output model embed — HARUS cocok model | `768` |

> **Catatan:**
> - `AI_PROVIDER=claude` belum diimplementasikan (Sprint 4, SMA-48 — R-03 strip-PII gerbang keras).
> - Model Ollama harus sudah di-pull di VPS sebelum backfill:
>   ```bash
>   docker exec smk-ollama ollama pull nomic-embed-text
>   docker exec smk-ollama ollama pull qwen2.5:7b
>   ```
> - Backfill embedding FAQ di produksi: `POST /api/v1/ai/knowledge/backfill` dengan token SA (N-13: menggantikan script ts-node yang tidak bisa jalan di image prod).
> - Di dev/CI, gateway tetap terdaftar sebagai provider DI (inject `AI_GATEWAY`); Ollama tidak dipanggil kecuali backfill dijalankan eksplisit.

### 11c. RAG Retrieval (SMA-46 Chatbot)

Digunakan oleh `AiService.searchSimilar()` saat memproses request `POST /ai/chat`.

| Variable | Required | Default | Deskripsi | Contoh |
|----------|----------|---------|-----------|--------|
| `AI_RAG_TOP_K` | Tidak | `4` | Jumlah chunk paling mirip yang di-retrieve dari pgvector | `4` |
| `AI_RAG_MIN_SIMILARITY` | Tidak | `0.3` | Ambang minimum cosine similarity (0–1) — chunk di bawah ini dibuang | `0.3` |

> **Catatan:**
> - `AI_RAG_TOP_K`: nilai lebih tinggi = konteks lebih kaya tapi prompt lebih panjang (lebih lambat + lebih mahal).
> - `AI_RAG_MIN_SIMILARITY`: nilai lebih tinggi = konteks lebih relevan tapi bisa jadi kosong (graceful fallback: chat tanpa context).
> - Keduanya sudah tervalidasi Zod di `env.validation.ts` — API gagal start jika nilainya non-numerik.

---

## 12. File yang TIDAK Boleh Di-Commit ke Git

```
.env                    ← root — semua docker-compose vars
apps/api/.env           ← API environment
apps/api/.env.local
apps/web/.env.local     ← NextAuth + Keycloak client secret
infrastructure/docker/.env
```

Pastikan baris berikut ada di `.gitignore` (sudah ada):
```gitignore
.env
.env.local
.env*.local
!.env.example
```

---

## 13. Cara Generate Secret yang Aman

```bash
# Password umum (min 20 karakter)
openssl rand -base64 32

# Hex secret (JWT, session, encryption key)
openssl rand -hex 32

# Atau via Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# NEXTAUTH_SECRET (Next.js merekomendasikan openssl rand -base64 32)
openssl rand -base64 32
```

---

*Dokumen ini dihasilkan dari `.env.example` dan `infrastructure/docker/docker-compose.yml`. Perbarui setiap kali ada variable baru yang ditambahkan.*
