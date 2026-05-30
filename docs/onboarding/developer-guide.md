# Developer Onboarding Guide — DIIS Smart AI School

> Panduan ini membawa developer baru dari nol sampai bisa `npm run dev` dalam satu sesi.
> Semua perintah sudah diverifikasi nyata terhadap repo ini.

---

## Prasyarat

Install semua tool berikut sebelum mulai:

| Tool | Versi minimum | Cek |
|---|---|---|
| Node.js | 20.x LTS | `node --version` |
| npm | 10.x (bundled Node 20) | `npm --version` |
| Docker Desktop / Docker Engine | dengan Compose v2 | `docker compose version` |
| Git | 2.x | `git --version` |

> **Windows:** Gunakan WSL2 untuk pengalaman terbaik. Docker Desktop perlu diaktifkan integrasi WSL2.

---

## Clone & Setup Awal

```bash
# 1. Clone repo
git clone git@github.com:smk-darussalam-subah/smart-ai-school.git
cd smart-ai-school

# 2. Salin template env
cp .env.example infrastructure/docker/.env

# Edit .env — isi semua nilai yang ada placeholder
# Minimal untuk dev lokal: POSTGRES_PASSWORD, REDIS_PASSWORD, KC_ADMIN_PASSWORD,
# N8N_BASIC_AUTH_PASSWORD, N8N_ENCRYPTION_KEY, MINIO_ROOT_PASSWORD

# 3. Install semua dependencies (monorepo)
npm install
```

> `.env.example` ada di root repo. File `.env` yang dipakai Docker Compose harus ada di
> `infrastructure/docker/.env` — bukan di root. Jangan commit file `.env`.

---

## Dev Lokal — Docker Services

Untuk dev lokal, cukup jalankan tiga service inti (postgres, redis, keycloak).
File `docker-compose.dev.yml` mengekspos port database ke host agar Prisma Studio dan
tools lain bisa konek langsung.

```bash
cd infrastructure/docker

# Start postgres + redis + keycloak saja (tidak perlu 14 service)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis keycloak

# Tunggu keycloak ready (~90 detik pertama kali)
docker compose logs -f keycloak | grep -m1 "Listening on"

# Cek semua service healthy
docker compose ps
```

Port yang tersedia setelah perintah di atas:

| Service | Host | Port |
|---|---|---|
| PostgreSQL | localhost | 5432 |
| Redis | localhost | 6379 |
| Keycloak | localhost | 8080 |

---

## Dev Lokal — Aplikasi

```bash
# Dari root repo (bukan dari infrastructure/docker/)
cd /path/to/smart-ai-school

# Migrate database (wajib sebelum pertama kali dev)
npm run db:migrate

# Seed data awal (40 users, 10 kelas, 4 jurusan)
npm run db:seed

# Jalankan semua app (Turborepo menjalankan api + web paralel)
npm run dev
```

Setelah berhasil:

| App | URL |
|---|---|
| **Web (Next.js)** | http://localhost:3000 |
| **API (NestJS)** | http://localhost:3001 |
| **API Health** | http://localhost:3001/health |
| **API Metrics** | http://localhost:3001/metrics |

---

## Struktur Monorepo

```
smart-ai-school/
├── apps/
│   ├── api/          → NestJS 11 + Fastify (port 3001)
│   └── web/          → Next.js 15 (port 3000)
├── packages/
│   ├── auth/         → @smk/auth — Keycloak JWT verify, hasRole()
│   ├── database/     → @smk/database — Prisma client + schema
│   ├── logger/       → @smk/logger — Winston logger
│   ├── types/        → @smk/types — shared TypeScript interfaces
│   └── config/       → @smk/config — tsconfig base files
├── infrastructure/
│   ├── docker/       → docker-compose.yml (semua service), .env
│   ├── nginx/        → nginx.conf (reverse proxy)
│   ├── monitoring/   → prometheus.yml, grafana dashboards
│   └── n8n/          → workflow JSON files
├── docs/             → dokumentasi teknis
├── .tasks/           → task queue sistem (current.md, queue.md)
├── CLAUDE.md         → konvensi dan keputusan arsitektur
└── turbo.json
```

---

## Workflow Git

```bash
# 1. Selalu mulai dari main terbaru
git checkout main && git pull origin main

# 2. Buat branch dengan format yang benar
git checkout -b feat/SMA-XX-deskripsi-singkat
# Contoh: feat/SMA-09-keycloak-setup, fix/SMA-24-port-mismatch

# 3. Kerjakan perubahan, commit dengan conventional commits
git commit -m "feat(auth): add Keycloak JWT verification"
# Format: <type>(<scope>): <deskripsi>
# Type: feat | fix | refactor | test | docs | chore

# 4. Push dan buat PR ke main
git push -u origin feat/SMA-XX-deskripsi-singkat
gh pr create --base main --title "feat(scope): deskripsi" --body "..."

# 5. Tunggu CI hijau sebelum minta review
# CI: tsc --noEmit + jest (62 test harus lulus)

# 6. Setelah merged, hapus branch lokal
git checkout main && git pull && git branch -d feat/SMA-XX-deskripsi-singkat
```

**Aturan utama:**
- PR ke `main` — bukan langsung push ke main
- CI harus hijau sebelum merge
- Satu branch = satu task/issue
- Semua perubahan ada di branch SEBELUM branch dinyatakan siap merge

---

## Tech Stack

Lihat **CLAUDE.md §3** untuk tabel lengkap tech stack yang immutable.

Ringkasan: NestJS 11 (Fastify), Next.js 15 (React 19), TypeScript strict, PostgreSQL 16 + pgvector, Prisma 5, Redis 7, Keycloak 24, Zod (bukan class-validator), Winston logger, Turborepo, Docker Compose v2.

---

## Akses Service via SSH Tunnel (VPS)

Untuk konek ke database VPS dari mesin lokal (bukan untuk dev — untuk inspect/debug):

→ Lihat **[docs/development-setup.md](../development-setup.md)** — bagian SSH Tunnel.

---

## Troubleshooting

### `DATABASE_URL` atau `REDIS_URL` error saat startup

Password yang mengandung karakter khusus (`@`, `#`, `!`, `%`) harus di-URL-encode.
Contoh: password `abc@123` → `abc%40123` di dalam URL.

```bash
# Generate DATABASE_URL yang benar
python3 -c "import urllib.parse; pw='PASSWORD_ANDA'; print('postgresql://user:'+urllib.parse.quote(pw,safe='')+'@localhost:5432/smk_db')"
```

### `npm install` / `npm ci` gagal

1. Pastikan Node.js versi 20: `node --version`
2. Hapus cache dan install ulang: `rm -rf node_modules && npm install`
3. Jangan mix `npm` dan `yarn`/`pnpm` — repo ini pakai `npm workspaces`

### Keycloak belum siap (error `ECONNREFUSED` ke port 8080)

Keycloak butuh ~90 detik startup pertama kali (import realm). Tunggu sampai log muncul:

```bash
docker compose logs -f keycloak | grep -m1 "Listening on"
```

Jika masih gagal setelah 3 menit: `docker compose restart keycloak`

### React error #31 saat `next build`

Biasanya duplikasi React di workspace. Pastikan root `package.json` punya:

```json
"overrides": {
  "react": "^19.1.0",
  "react-dom": "^19.1.0"
}
```

Jika tidak ada, jalankan `npm install` dari root untuk regenerate `package-lock.json`.
Lihat keputusan arsitektur di CLAUDE.md §10 untuk penjelasan lengkap.

### Port sudah dipakai (EADDRINUSE)

```bash
# Cari proses yang pakai port 3000 atau 3001
npx kill-port 3000 3001
# Atau
lsof -ti:3001 | xargs kill -9
```

---

## Script Referensi Cepat

Semua dijalankan dari **root repo** kecuali ada catatan lain:

```bash
npm run dev           # dev server (api + web via Turborepo)
npm run build         # build semua apps
npm run test          # jalankan semua test (62 test)
npm run type-check    # tsc --noEmit seluruh monorepo
npm run lint          # ESLint
npm run db:migrate    # prisma migrate deploy (production-safe)
npm run db:seed       # seed 40 users, 10 kelas, 4 jurusan
npm run db:generate   # regenerate Prisma client setelah schema berubah

# Dari infrastructure/docker/ (bukan root)
docker compose ps                        # status semua service
docker compose logs -f api               # tail log smk-api
docker compose restart nginx             # restart nginx saja
docker compose up -d --no-deps api web   # deploy api+web tanpa restart deps
```
