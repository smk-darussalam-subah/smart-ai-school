# Development Setup — DIIS Smart AI School

> Panduan setup environment lokal untuk developer DIIS.
> Untuk VPS setup, lihat `docs/deployment/`.

---

## Prasyarat

| Tool | Versi | Catatan |
|---|---|---|
| Node.js | 20.x LTS | Gunakan nvm atau fnm |
| Docker Desktop | Latest | Docker Compose v2 wajib |
| npm | 10.x | Sudah bundled dengan Node.js 20 |
| Git | 2.x | |

---

## Clone & Install

```bash
git clone https://github.com/smk-darussalam-subah/smart-ai-school.git
cd smart-ai-school

# Install semua dependencies (root + semua packages/apps)
npm install
```

---

## Environment Variables

```bash
# Copy semua template .env
cp infrastructure/docker/.env.example infrastructure/docker/.env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local

# Edit masing-masing file dengan nilai yang sesuai
# ⚠️ JANGAN commit file .env ke git
```

---

## Jalankan Infrastructure (Docker)

### Opsi A — Development Lokal (port DB terbuka di localhost)

```bash
cd infrastructure/docker

# Jalankan dengan dev override — postgres:5432 dan redis:6379 terbuka di localhost
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

> ⚠️ `docker-compose.dev.yml` expose port 5432 dan 6379 ke localhost.
> File ini hanya untuk dev lokal — **JANGAN** dipakai di VPS/production.

### Opsi B — Connect ke Database di VPS via SSH Tunnel (lebih aman)

Jika kamu mengerjakan dari mesin lokal tetapi database jalan di VPS, gunakan SSH tunnel.
Ini **lebih aman** karena port DB tidak perlu dibuka ke internet sama sekali.

```bash
# Buka tunnel ke VPS (jalankan di terminal terpisah atau dengan &)
# Format: -L <local_port>:<host_di_vps>:<remote_port> user@vps-ip
ssh -L 5432:localhost:5432 -L 6379:localhost:6379 root@204.168.242.123 -N

# Tunnel aktif — sekarang localhost:5432 → VPS PostgreSQL
# dan localhost:6379 → VPS Redis
```

Setelah tunnel aktif, tool lokal langsung bisa connect:

```bash
# Prisma Studio
cd packages/database
npx prisma studio
# Buka http://localhost:5555

# DBeaver / TablePlus / DataGrip
# Host: localhost, Port: 5432, DB: smk_db, User: smk_admin

# redis-cli
redis-cli -h localhost -p 6379 -a <REDIS_PASSWORD>
```

**Tips:** Tambahkan alias di `~/.bashrc` atau `~/.zshrc`:

```bash
alias smk-tunnel='ssh -L 5432:localhost:5432 -L 6379:localhost:6379 root@204.168.242.123 -N'
```

---

## Setup Database

```bash
cd packages/database

# Jalankan migration (setelah tunnel/docker aktif)
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Seed data awal (40 users, 10 kelas)
npx prisma db seed

# Buka Prisma Studio
npx prisma studio
```

---

## Jalankan Dev Server

```bash
# Dari root monorepo — menjalankan semua apps secara paralel via Turborepo
npm run dev

# Atau per-app:
cd apps/api && npm run dev   # → http://localhost:3001
cd apps/web && npm run dev   # → http://localhost:3000
```

---

## Cek Kesehatan Services

```bash
# API health check
curl http://localhost:3001/health

# Docker services status
cd infrastructure/docker
docker compose ps

# Lihat logs
docker compose logs -f api
docker compose logs -f postgres
```

---

## TypeScript Check

```bash
# Dari root — cek semua packages dan apps
npx tsc --noEmit

# Atau per-app
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
```

---

## Jalankan Tests

```bash
# Dari root
npm test

# Atau per-app
cd apps/api && npx jest
cd apps/api && npx jest --coverage  # dengan coverage report
```

---

## Branching Convention

```
feat/SMA-XX-deskripsi-singkat    → fitur baru
fix/SMA-XX-deskripsi-singkat     → bugfix
refactor/SMA-XX-deskripsi-singkat
```

Commit format: `feat(auth): add Keycloak JWT verification`
Lihat `CLAUDE.md` Section 5 untuk detail conventions.

---

*Dokumen ini dikelola oleh Cowork AI | Terakhir diupdate: 2026-05-26*
